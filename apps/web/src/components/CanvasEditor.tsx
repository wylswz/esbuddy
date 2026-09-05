import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  SelectionMode,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type Viewport,
  type NodeDragHandler,
  type NodeMouseHandler,
  type OnMove,
  type OnMoveEnd,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ArrowLeft } from 'lucide-react';

import { StickyNode } from './StickyNode';
import { AggregateNode } from './AggregateNode';
import { Toolbar } from './Toolbar';
import { HelpModal } from './HelpModal';
import { createNode } from '../cmlImporter';
import { CanvasActionsContext, DropTargetContext } from '../CanvasContext';
import { useI18n } from '../i18n/context';
import { useHistory } from '../useHistory';
import { useTouchMode } from '../useMediaQuery';
import type { CanvasSnapshot, Store } from '@esbuddy/sdk';
import { NOTE_DEFAULT_SIZE, ELEMENT_STYLES, type ElementType } from '../types';

const AGGREGATE_PADDING = 40;

/*
 * Modifier key scheme (one concern per modifier, no overlap):
 *   Shift            — break containment: drag a child out of its aggregate to remove it.
 *   Alt / ⌥ Option   — create a relation: select a node, then click another to connect them.
 *   Cmd/Ctrl (⌘)     — multi-select (React Flow default).
 */
const REMOVE_MODIFIER_KEY: 'Shift' | 'Alt' | 'Control' | 'Meta' = 'Shift';

/*
 * Touch scheme (phones / tablets, detected via `pointer: coarse`):
 *   One finger anywhere (including over a note) pans; pinch zooms. Notes are never
 *   dragged by a plain swipe, so scrolling the board can't accidentally rearrange it.
 *   To move a note, long-press it (TOUCH_HOLD_MS without moving more than TOUCH_SLOP px)
 *   — it lifts, then follows the finger until it's released.
 */
const TOUCH_HOLD_MS = 450;
const TOUCH_SLOP = 8;
const NO_MODIFIERS = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false } as unknown as React.MouseEvent;

const NODE_SHORTCUTS: Record<string, ElementType> = {};
(Object.keys(ELEMENT_STYLES) as ElementType[]).forEach((type) => {
  const shortcut = ELEMENT_STYLES[type].shortcut;
  if (shortcut) NODE_SHORTCUTS[shortcut.toLowerCase()] = type;
});

const nodeTypes = {
  event: StickyNode,
  command: StickyNode,
  aggregate: AggregateNode,
  actor: StickyNode,
  policy: StickyNode,
  external: StickyNode,
  hotspot: StickyNode,
  readmodel: StickyNode,
};

const initialNodes: Node[] = [
  {
    id: 'event_demo_1',
    type: 'event',
    position: { x: 300, y: 200 },
    data: { label: 'Order Placed', type: 'event' },
    style: { width: NOTE_DEFAULT_SIZE, height: NOTE_DEFAULT_SIZE },
  },
  {
    id: 'cmd_demo_1',
    type: 'command',
    position: { x: 100, y: 200 },
    data: { label: 'Place Order', type: 'command' },
    style: { width: NOTE_DEFAULT_SIZE, height: NOTE_DEFAULT_SIZE },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'e_demo_1',
    source: 'cmd_demo_1',
    target: 'event_demo_1',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
];

// Grow/shrink an aggregate so its box covers all of its children (with padding).
function fitAggregateToChildren(nds: Node[], aggId: string): Node[] {
  const children = nds.filter((n) => n.data?.aggregateId === aggId);
  if (children.length === 0) return nds;

  const minX = Math.min(...children.map((n) => n.position.x));
  const minY = Math.min(...children.map((n) => n.position.y));
  const maxX = Math.max(...children.map((n) => n.position.x + (n.width ?? 180)));
  const maxY = Math.max(...children.map((n) => n.position.y + (n.height ?? 84)));

  return nds.map((n) =>
    n.id === aggId
      ? {
          ...n,
          position: { x: minX - AGGREGATE_PADDING, y: minY - AGGREGATE_PADDING },
          style: {
            ...n.style,
            width: maxX - minX + AGGREGATE_PADDING * 2,
            height: maxY - minY + AGGREGATE_PADDING * 2,
          },
        }
      : n,
  );
}

// While an aggregate is being dragged, move its children by the same delta.
function followAggregateChildren(prevNodes: Node[], nextNodes: Node[], changes: NodeChange[]): Node[] {
  const movedIds = new Set<string>();
  const aggregateDeltas = new Map<string, { dx: number; dy: number }>();

  for (const change of changes) {
    if (change.type !== 'position' || !change.dragging || !change.position) continue;
    movedIds.add(change.id);
    const prev = prevNodes.find((n) => n.id === change.id);
    if (prev?.type === 'aggregate') {
      aggregateDeltas.set(change.id, {
        dx: change.position.x - prev.position.x,
        dy: change.position.y - prev.position.y,
      });
    }
  }

  if (aggregateDeltas.size === 0) return nextNodes;

  return nextNodes.map((n) => {
    if (!n.data?.aggregateId || movedIds.has(n.id)) return n;
    const delta = aggregateDeltas.get(n.data.aggregateId as string);
    if (!delta) return n;
    return { ...n, position: { x: n.position.x + delta.dx, y: n.position.y + delta.dy } };
  });
}

/*
 * Aggregate invariants (enforced across every add / remove / move / resize):
 *
 * 1. Containment — a child never leaves its aggregate's bounds. Enforced by:
 *    - growing the box while a child is dragged outward (growAggregatesForDraggedChildren)
 *    - blocking aggregate resizes that would uncover a child (AggregateNode#shouldResize)
 *    - re-fitting the box on add/remove/drop (fitAggregateToChildren)
 *    To break out, hold Shift while dragging (removes the child instead).
 *
 * 2. No nesting — an aggregate can never contain another aggregate. Enforced by
 *    skipping aggregates in drop-to-join and only grouping events/commands.
 *
 * 3. Single parent — an element belongs to at most one aggregate (single aggregateId).
 *
 * 4. No orphans — an aggregate left with zero children is removed (removeEmptyAggregates).
 */

function isRemoveModifierHeld(e: {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  switch (REMOVE_MODIFIER_KEY) {
    case 'Alt':
      return e.altKey;
    case 'Control':
      return e.ctrlKey;
    case 'Meta':
      return e.metaKey;
    default:
      return e.shiftKey;
  }
}

function aggregateBounds(n: Node): { x: number; y: number; w: number; h: number } {
  return {
    x: n.position.x,
    y: n.position.y,
    w: (n.width ?? (n.style?.width as number | undefined) ?? 0),
    h: (n.height ?? (n.style?.height as number | undefined) ?? 0),
  };
}

function isNodeCenterOutside(node: Node, agg: Node): boolean {
  const cx = node.position.x + (node.width ?? 180) / 2;
  const cy = node.position.y + (node.height ?? 84) / 2;
  const b = aggregateBounds(agg);
  return cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h;
}

function removeEmptyAggregates(nds: Node[]): Node[] {
  const childCount = new Map<string, number>();
  nds.forEach((n) => {
    const aggId = n.data?.aggregateId as string | undefined;
    if (aggId) childCount.set(aggId, (childCount.get(aggId) ?? 0) + 1);
  });
  return nds.filter((n) => n.type !== 'aggregate' || (childCount.get(n.id) ?? 0) > 0);
}

// Grow (never shrink) an aggregate so it covers all of its children.
function growAggregateToContainChildren(nds: Node[], aggId: string): Node[] {
  const agg = nds.find((n) => n.id === aggId);
  if (!agg) return nds;

  const children = nds.filter((n) => n.data?.aggregateId === aggId);
  if (children.length === 0) return nds;

  const b = aggregateBounds(agg);
  const minX = Math.min(...children.map((n) => n.position.x)) - AGGREGATE_PADDING;
  const minY = Math.min(...children.map((n) => n.position.y)) - AGGREGATE_PADDING;
  const maxX = Math.max(...children.map((n) => n.position.x + (n.width ?? 180))) + AGGREGATE_PADDING;
  const maxY = Math.max(...children.map((n) => n.position.y + (n.height ?? 84))) + AGGREGATE_PADDING;

  const newLeft = Math.min(b.x, minX);
  const newTop = Math.min(b.y, minY);
  const newRight = Math.max(b.x + b.w, maxX);
  const newBottom = Math.max(b.y + b.h, maxY);

  if (newLeft === b.x && newTop === b.y && newRight === b.x + b.w && newBottom === b.y + b.h) {
    return nds;
  }

  return nds.map((n) =>
    n.id === aggId
      ? {
          ...n,
          position: { x: newLeft, y: newTop },
          style: { ...n.style, width: newRight - newLeft, height: newBottom - newTop },
        }
      : n,
  );
}

// While a child is dragged outward, expand its aggregate to keep it inside (unless removing).
function growAggregatesForDraggedChildren(nextNodes: Node[], changes: NodeChange[], constrain: boolean): Node[] {
  if (!constrain) return nextNodes;

  const draggingIds = new Set<string>();
  for (const change of changes) {
    if (change.type === 'position' && change.dragging) draggingIds.add(change.id);
  }
  if (draggingIds.size === 0) return nextNodes;

  const affectedAggIds = new Set<string>();
  nextNodes.forEach((n) => {
    if (!draggingIds.has(n.id)) return;
    const aggId = n.data?.aggregateId as string | undefined;
    if (aggId) affectedAggIds.add(aggId);
  });
  if (affectedAggIds.size === 0) return nextNodes;

  let result = nextNodes;
  affectedAggIds.forEach((aggId) => {
    result = growAggregateToContainChildren(result, aggId);
  });
  return result;
}

// When nodes are deleted, detach orphaned children, remove empty aggregates and re-fit the rest.
function handleNodeRemovals(prevNodes: Node[], nextNodes: Node[], changes: NodeChange[]): Node[] {
  const removedIds = new Set<string>();
  for (const change of changes) {
    if (change.type === 'remove') removedIds.add(change.id);
  }
  if (removedIds.size === 0) return nextNodes;

  let result = nextNodes;
  const affectedAggIds = new Set<string>();

  removedIds.forEach((id) => {
    const removed = prevNodes.find((n) => n.id === id);
    if (!removed) return;

    if (removed.type === 'aggregate') {
      // Deleting an aggregate detaches its children rather than deleting them.
      result = result.map((n) =>
        n.data?.aggregateId === removed.id ? { ...n, data: { ...n.data, aggregateId: null } } : n,
      );
      return;
    }

    const aggId = removed.data?.aggregateId as string | undefined;
    if (aggId) affectedAggIds.add(aggId);
  });

  result = removeEmptyAggregates(result);
  affectedAggIds.forEach((id) => {
    result = fitAggregateToChildren(result, id);
  });
  return result;
}

export interface CanvasEditorProps {
  canvasId: string;
  store: Store;
  onBack: () => void;
}

export function CanvasEditor({ canvasId, store, onBack }: CanvasEditorProps) {
  const [hadSaved, setHadSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const { t } = useI18n();
  const touchMode = useTouchMode();

  const canvasRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<Viewport | null>(null);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const pendingViewportRef = useRef<Viewport | null>(null);
  const selectionRef = useRef<string[]>([]);
  const prevSelectionRef = useRef<string[]>([]);
  const draggingRef = useRef(false);
  const resizingRef = useRef(false);

  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Load the persisted canvas through the polymorphic Store (local or remote).
  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;
    store
      .getCanvas(canvasId)
      .then((record) => {
        if (cancelled) return;
        if (record) setName(record.name);
        if (record && record.snapshot.nodes.length > 0) {
          setNodes(record.snapshot.nodes as Node[]);
          setEdges(record.snapshot.edges as Edge[]);
          if (record.snapshot.viewport) {
            viewportRef.current = record.snapshot.viewport;
            pendingViewportRef.current = record.snapshot.viewport;
            rfInstanceRef.current?.setViewport(record.snapshot.viewport);
          }
          setHadSaved(true);
        }
      })
      .catch(() => {
        // ignore load failures; start from the demo canvas
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [store, canvasId]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstanceRef.current = instance;
    if (pendingViewportRef.current) {
      instance.setViewport(pendingViewportRef.current);
    }
  }, []);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  const startRename = useCallback(() => {
    setNameDraft(name);
    setEditingName(true);
  }, [name]);

  const commitRename = useCallback(() => {
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || next === name) return;
    setName(next);
    store.renameCanvas(canvasId, next).catch(() => {
      // ignore rename failures; the local title still reflects the intent
    });
  }, [nameDraft, name, store, canvasId]);

  const getState = useCallback(
    () => ({ nodes: nodesRef.current, edges: edgesRef.current }),
    [],
  );
  const applyState = useCallback((snap: { nodes: Node[]; edges: Edge[] }) => {
    nodesRef.current = snap.nodes;
    edgesRef.current = snap.edges;
    setNodes(snap.nodes);
    setEdges(snap.edges);
  }, []);
  const { commit, undo, redo, canUndo, canRedo } = useHistory(getState, applyState);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const removeKeyRef = useRef(false);
  useEffect(() => {
    const isRemoveKey = (e: KeyboardEvent) => e.key === REMOVE_MODIFIER_KEY;
    const onDown = (e: KeyboardEvent) => {
      if (isRemoveKey(e)) removeKeyRef.current = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (isRemoveKey(e)) removeKeyRef.current = false;
    };
    const onBlur = () => {
      removeKeyRef.current = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Track selection synchronously (before React's effect-based onSelectionChange)
    // so Alt+click can read the pre-click selection as the connect source.
    const selectChanges = changes.filter((c) => c.type === 'select');
    if (selectChanges.length > 0) {
      prevSelectionRef.current = selectionRef.current;
      const nextSelection = new Set(selectionRef.current);
      for (const c of selectChanges) {
        if (c.selected) nextSelection.add(c.id);
        else nextSelection.delete(c.id);
      }
      selectionRef.current = Array.from(nextSelection);
    }

    // Commit a history entry at the start of a drag/resize, or on deletion.
    let shouldCommit = false;
    for (const c of changes) {
      if (c.type === 'position' && typeof c.dragging === 'boolean') {
        if (c.dragging && !draggingRef.current) shouldCommit = true;
        draggingRef.current = c.dragging;
      } else if (c.type === 'dimensions' && typeof c.resizing === 'boolean') {
        if (c.resizing && !resizingRef.current) shouldCommit = true;
        resizingRef.current = c.resizing;
      } else if (c.type === 'remove') {
        shouldCommit = true;
      }
    }
    if (shouldCommit) commit();

    setNodes((nds) => {
      const applied = applyNodeChanges(changes, nds);
      const followed = followAggregateChildren(nds, applied, changes);
      const grown = growAggregatesForDraggedChildren(followed, changes, !removeKeyRef.current);
      return handleNodeRemovals(nds, grown, changes);
    });
  }, [commit]);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some((c) => c.type === 'remove')) commit();
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [commit],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      commit();
      setEdges((eds) => addEdge({ ...conn, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    },
    [commit],
  );

  // Hold Alt and click a node to connect the previously selected node(s) to it.
  const onNodeClick = useCallback<NodeMouseHandler>(
    (event, node) => {
      if (!event.altKey) return;
      const sources = prevSelectionRef.current.filter((id) => id !== node.id);
      if (sources.length === 0) return;

      const willAdd = sources.some(
        (sourceId) =>
          !edgesRef.current.some((e) => e.source === sourceId && e.target === node.id),
      );
      if (!willAdd) return;

      commit();
      setEdges((eds) => {
        let next = eds;
        for (const sourceId of sources) {
          const exists = next.some((e) => e.source === sourceId && e.target === node.id);
          if (exists) continue;
          next = addEdge(
            {
              id: `e_${sourceId}_${node.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              source: sourceId,
              target: node.id,
              markerEnd: { type: MarkerType.ArrowClosed },
            },
            next,
          );
        }
        return next;
      });
    },
    [commit],
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    const ids = selectedNodes.map((n) => n.id);
    selectionRef.current = ids;
    setSelectedNodeIds(ids);
  }, []);

  const updateNodeLabel = useCallback(
    (id: string, label: string) => {
      const node = nodesRef.current.find((n) => n.id === id);
      if (!node || ((node.data?.label as string) ?? '') === label) return;
      commit();
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)));
    },
    [commit],
  );

  const updateNodeDescription = useCallback(
    (id: string, description: string) => {
      const node = nodesRef.current.find((n) => n.id === id);
      if (!node || ((node.data?.description as string) ?? '') === description) return;
      commit();
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, description } } : n)),
      );
    },
    [commit],
  );

  const actions = useMemo(
    () => ({ updateNodeLabel, updateNodeDescription }),
    [updateNodeLabel, updateNodeDescription],
  );

  const addNodeAtMouse = useCallback(
    (type: ElementType) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const vp = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
      const pos = {
        x: (mouseRef.current.x - (rect?.left ?? 0) - vp.x) / vp.zoom,
        y: (mouseRef.current.y - (rect?.top ?? 0) - vp.y) / vp.zoom,
      };
      commit();
      setNodes((nds) => [...nds, createNode(type, pos, t(`elements.${type}.newLabel`))]);
    },
    [commit, t],
  );

  const addElement = useCallback(
    (type: ElementType) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const vp = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
      const pos = {
        x: ((rect?.width ?? 800) / 2 - vp.x) / vp.zoom,
        y: ((rect?.height ?? 600) / 2 - vp.y) / vp.zoom,
      };
      commit();
      setNodes((nds) => [...nds, createNode(type, pos, t(`elements.${type}.newLabel`))]);
    },
    [commit, t],
  );

  const bringToFront = useCallback(() => {
    const ids = new Set(selectedNodeIds);
    if (ids.size === 0) return;
    commit();
    setNodes((nds) => {
      const moved = nds.filter((n) => ids.has(n.id) && n.type !== 'aggregate');
      const rest = nds.filter((n) => !(ids.has(n.id) && n.type !== 'aggregate'));
      return [...rest, ...moved];
    });
  }, [selectedNodeIds, commit]);

  const sendToBack = useCallback(() => {
    const ids = new Set(selectedNodeIds);
    if (ids.size === 0) return;
    commit();
    setNodes((nds) => {
      const aggregates = nds.filter((n) => n.type === 'aggregate');
      const notes = nds.filter((n) => n.type !== 'aggregate');
      const moved = notes.filter((n) => ids.has(n.id));
      const rest = notes.filter((n) => !ids.has(n.id));
      return [...aggregates, ...moved, ...rest];
    });
  }, [selectedNodeIds, commit]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      // Undo / Redo
      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }
        if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
        return;
      }
      if (e.altKey) return;

      const nodeType = NODE_SHORTCUTS[e.key.toLowerCase()];
      if (nodeType) {
        e.preventDefault();
        addNodeAtMouse(nodeType);
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        bringToFront();
      } else if (e.key === '[') {
        e.preventDefault();
        sendToBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addNodeAtMouse, bringToFront, sendToBack, undo, redo]);

  const groupAsAggregate = useCallback(() => {
    if (selectedNodeIds.length < 2) return;

    const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
    if (selectedNodes.length === 0) return;

    commit();

    const minX = Math.min(...selectedNodes.map((n) => n.position.x));
    const minY = Math.min(...selectedNodes.map((n) => n.position.y));
    const maxX = Math.max(...selectedNodes.map((n) => n.position.x + (n.width ?? 220)));
    const maxY = Math.max(...selectedNodes.map((n) => n.position.y + (n.height ?? 90)));

    const aggId = `aggregate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const aggNode: Node = {
      id: aggId,
      type: 'aggregate',
      position: { x: minX - AGGREGATE_PADDING, y: minY - AGGREGATE_PADDING },
      data: { label: t('elements.aggregate.newLabel'), type: 'aggregate' },
      style: {
        width: maxX - minX + AGGREGATE_PADDING * 2,
        height: maxY - minY + AGGREGATE_PADDING * 2,
      },
      selectable: true,
      draggable: true,
    };

    setNodes((nds) => {
      const oldAggIds = new Set<string>();
      selectedNodeIds.forEach((id) => {
        const n = nds.find((x) => x.id === id);
        const aggId = n?.data?.aggregateId as string | undefined;
        if (aggId) oldAggIds.add(aggId);
      });

      let updated = nds.map((n) =>
        selectedNodeIds.includes(n.id)
          ? { ...n, data: { ...n.data, aggregateId: aggId } }
          : n,
      );
      updated = removeEmptyAggregates(updated);
      oldAggIds.forEach((id) => {
        updated = fitAggregateToChildren(updated, id);
      });
      return [aggNode, ...updated];
    });
  }, [selectedNodeIds, nodes, t, commit]);

  const onNodeDrag = useCallback<NodeDragHandler>(
    (_event, node) => {
      // Only free elements can become a new child — highlight the aggregate under them.
      if (node.type === 'aggregate' || node.data?.aggregateId) {
        setDropTargetId(null);
        return;
      }

      const w = node.width ?? 180;
      const h = node.height ?? 84;
      const rect = { x: node.position.x, y: node.position.y, w, h };

      const target = nodes.find((n) => {
        if (n.type !== 'aggregate') return false;
        const aw = (n.width ?? (n.style?.width as number | undefined) ?? 0);
        const ah = (n.height ?? (n.style?.height as number | undefined) ?? 0);
        return (
          rect.x < n.position.x + aw &&
          rect.x + rect.w > n.position.x &&
          rect.y < n.position.y + ah &&
          rect.y + rect.h > n.position.y
        );
      });

      setDropTargetId(target?.id ?? null);
    },
    [nodes],
  );

  const onNodeDragStop = useCallback<NodeDragHandler>(
    (event, node) => {
      setDropTargetId(null);
      if (node.type === 'aggregate') return;

      // Prefer the position from state (reflects aggregate grow/follow adjustments).
      const dragged = nodes.find((n) => n.id === node.id) ?? node;
      const oldAggId = (dragged.data?.aggregateId as string) ?? null;

      // Removal: hold Shift and drag a child out of its aggregate.
      if (oldAggId && isRemoveModifierHeld(event)) {
        const agg = nodes.find((n) => n.id === oldAggId);
        if (agg && isNodeCenterOutside(dragged, agg)) {
          setNodes((nds) => {
            const detached = nds.map((n) =>
              n.id === node.id ? { ...n, data: { ...n.data, aggregateId: null } } : n,
            );
            return fitAggregateToChildren(removeEmptyAggregates(detached), oldAggId);
          });
        }
        return;
      }

      // Drop-to-join (never nest aggregates).
      const w = dragged.width ?? 180;
      const h = dragged.height ?? 84;
      const rect = { x: dragged.position.x, y: dragged.position.y, w, h };

      const target = nodes.find((n) => {
        if (n.type !== 'aggregate' || n.id === oldAggId) return false;
        const aw = (n.width ?? (n.style?.width as number | undefined) ?? 0);
        const ah = (n.height ?? (n.style?.height as number | undefined) ?? 0);
        return (
          rect.x < n.position.x + aw &&
          rect.x + rect.w > n.position.x &&
          rect.y < n.position.y + ah &&
          rect.y + rect.h > n.position.y
        );
      });

      if (!target) {
        // Re-fit the child's own aggregate (tighten after it grew to follow the drag).
        if (oldAggId) {
          setNodes((nds) => fitAggregateToChildren(nds, oldAggId));
        }
        return;
      }

      setNodes((nds) => {
        let next = nds.map((n) =>
          n.id === node.id ? { ...n, data: { ...n.data, aggregateId: target.id } } : n,
        );
        next = fitAggregateToChildren(next, target.id);
        if (oldAggId && oldAggId !== target.id) {
          next = fitAggregateToChildren(removeEmptyAggregates(next), oldAggId);
        }
        return next;
      });
    },
    [nodes],
  );

  // Long-press-to-pick-up dragging for touch screens (see "Touch scheme" above).
  // React Flow's own node dragging is disabled in touch mode, so a note without the
  // `nopan` class lets a swipe bubble up to the pane and pan the board. Once a note is
  // picked up we swallow touchmove in the capture phase so d3-zoom never sees it, and
  // drive the same onNodesChange / onNodeDrag / onNodeDragStop path the mouse uses.
  const touchHandlersRef = useRef({ onNodesChange, onNodeDrag, onNodeDragStop });
  touchHandlersRef.current = { onNodesChange, onNodeDrag, onNodeDragStop };

  useEffect(() => {
    const el = canvasRef.current;
    if (!touchMode || !el) return;

    let timer: number | null = null;
    let nodeId: string | null = null;
    let touchId: number | null = null;
    let picked = false;
    let start = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    let pos = { x: 0, y: 0 };

    const reset = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      nodeId = null;
      touchId = null;
      picked = false;
    };

    const findTouch = (list: TouchList) => Array.from(list).find((x) => x.identifier === touchId);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || picked) {
        reset();
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, .react-flow__resize-control, .react-flow__handle')) return;
      const id = target.closest<HTMLElement>('.react-flow__node')?.dataset.id;
      if (!id) return;

      const touch = e.touches[0];
      nodeId = id;
      touchId = touch.identifier;
      start = last = { x: touch.clientX, y: touch.clientY };

      timer = window.setTimeout(() => {
        timer = null;
        const node = nodesRef.current.find((n) => n.id === id);
        if (!node) {
          reset();
          return;
        }
        picked = true;
        pos = { ...node.position };
        navigator.vibrate?.(15);
        touchHandlersRef.current.onNodesChange([
          ...nodesRef.current
            .filter((n) => n.selected && n.id !== id)
            .map((n) => ({ type: 'select' as const, id: n.id, selected: false })),
          { type: 'select', id, selected: true },
          { type: 'position', id, position: pos, dragging: true },
        ]);
      }, TOUCH_HOLD_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (nodeId === null) return;
      const touch = findTouch(e.touches);
      if (!touch) return;

      if (!picked) {
        // Finger moved before the hold elapsed: this is a pan, not a pick-up.
        if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TOUCH_SLOP) reset();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      const zoom = rfInstanceRef.current?.getViewport().zoom ?? 1;
      pos = { x: pos.x + (touch.clientX - last.x) / zoom, y: pos.y + (touch.clientY - last.y) / zoom };
      last = { x: touch.clientX, y: touch.clientY };

      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      touchHandlersRef.current.onNodesChange([{ type: 'position', id: nodeId, position: pos, dragging: true }]);
      touchHandlersRef.current.onNodeDrag(NO_MODIFIERS, { ...node, position: pos }, [node]);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (nodeId === null || !findTouch(e.changedTouches)) return;
      if (picked) {
        const id = nodeId;
        const node = nodesRef.current.find((n) => n.id === id);
        touchHandlersRef.current.onNodesChange([{ type: 'position', id, position: pos, dragging: false }]);
        if (node) touchHandlersRef.current.onNodeDragStop(NO_MODIFIERS, { ...node, position: pos }, [node]);
      }
      reset();
    };

    // Capture phase so we run before d3-zoom's listeners on the pane.
    const opts: AddEventListenerOptions = { capture: true, passive: false };
    el.addEventListener('touchstart', onTouchStart, opts);
    el.addEventListener('touchmove', onTouchMove, opts);
    el.addEventListener('touchend', onTouchEnd, opts);
    el.addEventListener('touchcancel', onTouchEnd, opts);
    return () => {
      reset();
      el.removeEventListener('touchstart', onTouchStart, opts);
      el.removeEventListener('touchmove', onTouchMove, opts);
      el.removeEventListener('touchend', onTouchEnd, opts);
      el.removeEventListener('touchcancel', onTouchEnd, opts);
    };
  }, [touchMode]);

  const onMove = useCallback<OnMove>((_event, vp) => {
    viewportRef.current = vp;
  }, []);

  const onMoveEnd = useCallback<OnMoveEnd>((_event, vp) => {
    viewportRef.current = vp;
  }, []);

  // Persist only on real content changes (nodes/edges). Pure navigation
  // (pan/zoom) updates viewportRef but must not trigger a save; the latest
  // viewport is captured from the ref whenever content actually changes.
  useEffect(() => {
    if (!loaded || !canvasId) return;
    const timer = setTimeout(() => {
      store.saveCanvas(canvasId, {
        nodes,
        edges,
        viewport: viewportRef.current,
      } as unknown as CanvasSnapshot);
    }, 250);
    return () => clearTimeout(timer);
  }, [nodes, edges, loaded, store, canvasId]);

  const canGroup = useMemo(
    () =>
      selectedNodeIds.length >= 2 &&
      selectedNodeIds.every((id) => {
        const node = nodes.find((n) => n.id === id);
        return node && (node.type === 'event' || node.type === 'command');
      }),
    [selectedNodeIds, nodes],
  );

  return (
    <div ref={canvasRef} className="w-full h-full relative">
      <button
        onClick={onBack}
        className="editor-chip safe-top absolute right-4 z-20 flex items-center gap-1.5 h-9 px-3 text-sm font-semibold hover:bg-ink hover:text-paper hover:border-ink"
        title={t('editor.back')}
      >
        <ArrowLeft size={16} />
        <span>{t('editor.back')}</span>
      </button>
      <div className="safe-top absolute left-1/2 -translate-x-1/2 z-20 max-w-[50vw]">
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditingName(false);
              }
            }}
            placeholder={t('editor.untitled')}
            className="editor-chip h-9 px-3 text-sm font-semibold text-center border-ink focus:outline-none"
          />
        ) : (
          <button
            onClick={startRename}
            className="editor-chip h-9 px-3 text-sm font-semibold hover:border-ink truncate max-w-full"
            title={t('editor.rename')}
          >
            {name || t('editor.untitled')}
          </button>
        )}
      </div>
      <CanvasActionsContext.Provider value={actions}>
        <DropTargetContext.Provider value={dropTargetId}>
          <Toolbar
            onAddElement={addElement}
            onGroupAggregate={groupAsAggregate}
            onBringToFront={bringToFront}
            onSendToBack={sendToBack}
            onHelp={() => setShowHelp(true)}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            canGroup={canGroup}
            touchMode={touchMode}
          />

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onSelectionChange={onSelectionChange}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onMove={onMove}
            onMoveEnd={onMoveEnd}
            nodesDraggable={!touchMode}
            selectionOnDrag={!touchMode}
            panOnDrag={touchMode ? true : [1, 2]}
            panOnScroll
            zoomOnScroll={false}
            zoomOnDoubleClick={!touchMode}
            selectionMode={SelectionMode.Partial}
            fitView={!hadSaved}
            onInit={onInit}
            elevateNodesOnSelect={false}
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
            className="esboard-surface"
          >
            <Background variant={BackgroundVariant.Lines} gap={24} size={1} color="var(--color-board-grid)" />
            <Controls />
            {!touchMode && (
              <MiniMap
                nodeColor={(node) => ELEMENT_STYLES[node.type as ElementType]?.color ?? 'var(--color-board-line)'}
                className="bg-surface border border-border rounded"
              />
            )}
          </ReactFlow>
        </DropTargetContext.Provider>
      </CanvasActionsContext.Provider>

      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
