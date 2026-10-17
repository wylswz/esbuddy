import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
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
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  ArrowLeft,
  CircleHelp,
  FileDown,
  Flag,
  Group,
  Milestone,
  Rows3,
  Ruler,
  ScrollText,
  Upload,
} from 'lucide-react';

import { nodeTypes } from './nodeTypes';
import { Toolbar } from './Toolbar';
import { CommandPalette, type PaletteCommand } from './CommandPalette';
import { GuidedTour, type TourStep } from './GuidedTour';
import { CompileExample, ConceptList, ElementList, GrammarLists, GuideExample, HowTo, ShortcutList } from './TourContent';
import { isTourDone } from '../tour';
import { BoardBackground } from './BoardBackground';
import { BoardStructure, RULER_SIZE, Rulers, type RulerActions, type StructureRef } from './StructureRulers';
import { VersionsDialog } from './VersionsDialog';
import { CompilePanel } from './CompilePanel';
import { PresenceBar } from './PresenceBar';
import { RemoteCursors } from './RemoteCursors';
import {
  addNoteBound,
  aggregateUnder,
  canJoinAggregate,
  createNode,
  fitAggregateToChildren,
  followDependents,
  growAggregatesForDraggedChildren,
  handleNodeRemovals,
  isAttacher,
  isNodeCenterOutside,
  paddedBox,
  removeEmptyAggregates,
  setBinding,
} from '../editor/transforms';
import { newId } from '../ids';
import {
  CanvasActionsContext,
  DiagnosticsContext,
  DropTargetContext,
  RemoteSelectionContext,
  diagnosticColor,
} from '../CanvasContext';
import { useI18n } from '../i18n/context';
import { useTouchMode } from '../useMediaQuery';
import { useAwarenessPeers, userColor, type PeerUser } from '../collab/awareness';
import {
  LOCAL_ORIGIN,
  applyEdgesToDoc,
  applyNodesToDoc,
  edgesFromDoc,
  fromFlowEdge,
  fromFlowNode,
  nodesFromDoc,
} from '../collab/binding';
import type { ConnectionStatus } from '../collab/provider';
import { useCollabSession, type CollabSession } from '../collab/useCollabSession';
import { structureEditor, useStructure } from '../collab/structure';
import { loadViewport, saveViewport } from '../collab/viewport';
import { isRemoteMode } from '../stores/mode';
import * as storage from '../storage';
import {
  boundToOf,
  canConnect,
  canvasToYaml,
  compileCanvas,
  nextBinding,
  docToSnapshot,
  getEdgesMap,
  getNodesMap,
  isStructureEmpty,
  nodeRect,
  placeLane,
  DEFAULT_LANE_HEIGHT,
  MIN_LANE_HEIGHT,
  snapshotToDoc,
  type Diagnostic,
  type Severity,
  type CanvasRecord,
  type CanvasSnapshot,
  type Store,
  type User,
} from '@esbuddy/sdk';
import { NOTE_DEFAULT_SIZE, ELEMENT_DEFAULT_SIZE, ELEMENT_ORDER, ELEMENT_STYLES, type ElementType } from '../types';

/*
 * Modifier key scheme (one concern per modifier, no overlap):
 *   Shift            — break containment: drag a child out of its aggregate to remove it.
 *   Alt / ⌥ Option   — create a relation: select a node, then click another to connect them.
 *   Cmd/Ctrl (⌘)     — multi-select (React Flow default).
 */
type ModifierKey = 'Shift' | 'Alt' | 'Control' | 'Meta';
const REMOVE_MODIFIER_KEY: ModifierKey = 'Shift';

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

/** The two-note starter board a brand-new (empty) canvas is seeded with. */
function demoSnapshot(): CanvasSnapshot {
  return { nodes: initialNodes.map(fromFlowNode), edges: initialEdges.map(fromFlowEdge), viewport: null };
}

function isModifierHeld(
  e: {
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
  },
  key: ModifierKey,
): boolean {
  switch (key) {
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

export interface CanvasEditorProps {
  canvasId: string;
  store: Store;
  user: User | null;
  onBack: () => void;
}

/**
 * Opens the collaboration session for a canvas and, once its initial state has
 * arrived, mounts the editor. Canvas *metadata* (name, legacy viewport) still
 * comes from the Store; canvas *content* lives in the session's Y.Doc.
 */
export function CanvasEditor({ canvasId, store, user, onBack }: CanvasEditorProps) {
  const { t } = useI18n();
  // Metadata for the canvas being opened. A result for another id (stale after
  // switching canvases) counts as "still loading".
  const [fetched, setFetched] = useState<{ id: string; record: CanvasRecord | null } | null>(null);
  const record = fetched?.id === canvasId ? fetched.record : undefined;

  useEffect(() => {
    let cancelled = false;
    store
      .getCanvas(canvasId)
      .then((r) => {
        if (!cancelled) setFetched({ id: canvasId, record: r });
      })
      .catch(() => {
        if (!cancelled) setFetched({ id: canvasId, record: null });
      });
    return () => {
      cancelled = true;
    };
  }, [store, canvasId]);

  const seed = useCallback((): CanvasSnapshot => {
    // Local mode: a board saved by the pre-CRDT build lives in localStorage.
    if (!isRemoteMode()) {
      const legacy = storage.loadCanvas(canvasId);
      if (legacy && legacy.nodes.length > 0) return { ...legacy, viewport: null };
    }
    return demoSnapshot();
  }, [canvasId]);
  const session = useCollabSession(canvasId, { seed });

  if (!session || record === undefined) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-paper" aria-label={t('editor.opening')}>
        <span className="h-1 w-24 bg-accent animate-pulse" />
      </div>
    );
  }

  // The provider lets the rulers, which sit outside the board, follow its viewport.
  return (
    <ReactFlowProvider key={canvasId}>
      <CanvasEditorInner session={session} store={store} record={record} user={user} onBack={onBack} />
    </ReactFlowProvider>
  );
}

interface CanvasEditorInnerProps {
  session: CollabSession;
  store: Store;
  record: CanvasRecord | null;
  user: User | null;
  onBack: () => void;
}

function CanvasEditorInner({ session, store, record, user, onBack }: CanvasEditorInnerProps) {
  const { canvasId, doc, provider, undoManager } = session;
  const [name, setName] = useState(record?.name ?? '');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [nodes, setNodes] = useState<Node[]>(() => nodesFromDoc(doc, []));
  const [edges, setEdges] = useState<Edge[]>(() => edgesFromDoc(doc, []));
  const [showVersions, setShowVersions] = useState(false);
  const [showCompile, setShowCompile] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  // The guided tour doubles as help: shown on the first visit, then from Help.
  const [showTour, setShowTour] = useState(() => !isTourDone());
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(provider.status);

  const { t } = useI18n();
  const touchMode = useTouchMode();

  const canvasRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  // Per-user viewport: this browser's last position, else the one the pre-CRDT
  // build stored server-side, else fit the whole board.
  const initialViewport = useMemo(
    () => loadViewport(canvasId) ?? record?.snapshot.viewport ?? null,
    [canvasId, record],
  );
  const viewportRef = useRef<Viewport | null>(initialViewport);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const selectionRef = useRef<string[]>([]);
  const prevSelectionRef = useRef<string[]>([]);
  const draggingRef = useRef(false);
  const resizingRef = useRef(false);

  // Always the latest arrays (updated synchronously by updateNodes/updateEdges
  // and by the doc observers), for handlers that must not wait for a render.
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);

  // ---- React -> Y: the editor's pure transforms, diffed into the shared doc.
  const updateNodes = useCallback(
    (fn: (nds: Node[]) => Node[]) => {
      const prev = nodesRef.current;
      const next = fn(prev);
      if (next === prev) return;
      nodesRef.current = next;
      setNodes(next);
      applyNodesToDoc(doc, prev, next);
    },
    [doc],
  );
  const updateEdges = useCallback(
    (fn: (eds: Edge[]) => Edge[]) => {
      const prev = edgesRef.current;
      const next = fn(prev);
      if (next === prev) return;
      edgesRef.current = next;
      setEdges(next);
      applyEdgesToDoc(doc, prev, next);
    },
    [doc],
  );

  // ---- Y -> React: peers' edits and undo/redo land here (our own writes are
  // already reflected in state, so LOCAL_ORIGIN transactions are skipped).
  useEffect(() => {
    const ynodes = getNodesMap(doc);
    const yedges = getEdgesMap(doc);
    const onNodes = (_events: unknown, tr: { origin: unknown }) => {
      if (tr.origin === LOCAL_ORIGIN) return;
      const next = nodesFromDoc(doc, nodesRef.current);
      nodesRef.current = next;
      setNodes(next);
    };
    const onEdges = (_events: unknown, tr: { origin: unknown }) => {
      if (tr.origin === LOCAL_ORIGIN) return;
      const next = edgesFromDoc(doc, edgesRef.current);
      edgesRef.current = next;
      setEdges(next);
    };
    ynodes.observeDeep(onNodes);
    yedges.observeDeep(onEdges);
    return () => {
      ynodes.unobserveDeep(onNodes);
      yedges.unobserveDeep(onEdges);
    };
  }, [doc]);

  useEffect(() => provider.onStatus(setStatus), [provider]);

  // ---- Board structure (swimlanes, milestones): edited through the rulers.
  const structure = useStructure(doc);
  const structureEdits = useMemo(() => structureEditor(doc), [doc]);
  // Rulers show while the board has structure, unless this user toggled them.
  const [rulerPref, setRulerPref] = useState<boolean | null>(null);
  const rulersVisible = rulerPref ?? !isStructureEmpty(structure);
  const [structureEditRequest, setStructureEditRequest] = useState<StructureRef | null>(null);

  // ---- Presence.
  const me = useMemo<PeerUser>(() => {
    const id = user?.id ?? 'local-user';
    return { id, name: user?.name ?? 'You', color: userColor(id) };
  }, [user]);
  const awareness = provider.awareness;
  useEffect(() => {
    awareness.setLocalState({ user: me, cursor: null, selection: [] });
    return () => awareness.setLocalState(null);
  }, [awareness, me]);
  const peers = useAwarenessPeers(awareness);
  const remoteSelection = useMemo(() => {
    const map = new Map<string, PeerUser[]>();
    peers.forEach((p) => {
      for (const id of p.selection) map.set(id, [...(map.get(id) ?? []), p.user]);
    });
    return map;
  }, [peers]);

  const cursorFrameRef = useRef<number | null>(null);
  const onPointerMove = useCallback(
    (e: React.MouseEvent) => {
      const { clientX, clientY } = e;
      if (cursorFrameRef.current !== null) return;
      cursorFrameRef.current = requestAnimationFrame(() => {
        cursorFrameRef.current = null;
        const rf = rfInstanceRef.current;
        if (!rf) return;
        awareness.setLocalStateField('cursor', rf.screenToFlowPosition({ x: clientX, y: clientY }));
      });
    },
    [awareness],
  );
  const onPointerLeave = useCallback(() => awareness.setLocalStateField('cursor', null), [awareness]);

  const onInit = useCallback(
    (instance: ReactFlowInstance) => {
      rfInstanceRef.current = instance;
      if (initialViewport) instance.setViewport(initialViewport);
    },
    [initialViewport],
  );

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

  // ---- Undo/redo: Y.UndoManager tracks only this client's transactions.
  // `commit()` marks the start of a new user action so the next change opens a
  // fresh undo step. Calls landing in the same task are coalesced (deleting a
  // node also removes its edges in a separate onEdgesChange call).
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  useEffect(() => {
    const sync = () => {
      setCanUndo(undoManager.undoStack.length > 0);
      setCanRedo(undoManager.redoStack.length > 0);
    };
    undoManager.on('stack-item-added', sync);
    undoManager.on('stack-item-popped', sync);
    undoManager.on('stack-cleared', sync);
    sync();
    return () => {
      undoManager.off('stack-item-added', sync);
      undoManager.off('stack-item-popped', sync);
      undoManager.off('stack-cleared', sync);
    };
  }, [undoManager]);
  const coalescingRef = useRef(false);
  const commit = useCallback(() => {
    if (coalescingRef.current) return;
    coalescingRef.current = true;
    queueMicrotask(() => {
      coalescingRef.current = false;
    });
    undoManager.stopCapturing();
  }, [undoManager]);
  const undo = useCallback(() => undoManager.undo(), [undoManager]);
  const redo = useCallback(() => undoManager.redo(), [undoManager]);
  const rulerActions = useMemo<RulerActions>(() => ({ ...structureEdits, commit }), [structureEdits, commit]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Modifier keys currently held (drag changes carry no key state).
  const heldKeysRef = useRef(new Set<string>());
  useEffect(() => {
    const held = heldKeysRef.current;
    const onDown = (e: KeyboardEvent) => {
      held.add(e.key);
    };
    const onUp = (e: KeyboardEvent) => {
      held.delete(e.key);
    };
    const onBlur = () => {
      held.clear();
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

    updateNodes((nds) => {
      const held = heldKeysRef.current;
      const applied = applyNodeChanges(changes, nds);
      const followed = followDependents(nds, applied, changes);
      const grown = growAggregatesForDraggedChildren(followed, changes, !held.has(REMOVE_MODIFIER_KEY));
      return handleNodeRemovals(nds, grown, changes);
    });
  }, [commit, updateNodes]);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some((c) => c.type === 'remove')) commit();
      updateEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [commit, updateEdges],
  );

  // Only edges the Event Storming grammar gives a meaning to can be drawn.
  const isValidConnection = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return false;
    const s = nodesRef.current.find((n) => n.id === conn.source);
    const t = nodesRef.current.find((n) => n.id === conn.target);
    return !!s?.type && !!t?.type && canConnect(s.type, t.type);
  }, []);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!isValidConnection(conn)) return;
      commit();
      updateEdges((eds) => addEdge({ ...conn, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    },
    [commit, updateEdges, isValidConnection],
  );

  // Hold Alt and click a node to connect the previously selected node(s) to it.
  // Sources the grammar can't connect to this node are skipped.
  const onNodeClick = useCallback<NodeMouseHandler>(
    (event, node) => {
      if (!event.altKey) return;
      const sources = prevSelectionRef.current.filter((id) =>
        isValidConnection({ source: id, target: node.id, sourceHandle: null, targetHandle: null }),
      );
      if (sources.length === 0) return;

      const willAdd = sources.some(
        (sourceId) =>
          !edgesRef.current.some((e) => e.source === sourceId && e.target === node.id),
      );
      if (!willAdd) return;

      commit();
      updateEdges((eds) => {
        let next = eds;
        for (const sourceId of sources) {
          const exists = next.some((e) => e.source === sourceId && e.target === node.id);
          if (exists) continue;
          next = addEdge(
            {
              id: newId(`e_${sourceId}_${node.id}`),
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
    [commit, updateEdges, isValidConnection],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      const ids = selectedNodes.map((n) => n.id);
      selectionRef.current = ids;
      setSelectedNodeIds(ids);
      awareness.setLocalStateField('selection', ids);
    },
    [awareness],
  );

  const updateNodeLabel = useCallback(
    (id: string, label: string) => {
      const node = nodesRef.current.find((n) => n.id === id);
      if (!node || ((node.data?.label as string) ?? '') === label) return;
      commit();
      updateNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)));
    },
    [commit, updateNodes],
  );

  const updateNodeDescription = useCallback(
    (id: string, description: string) => {
      const node = nodesRef.current.find((n) => n.id === id);
      if (!node || ((node.data?.description as string) ?? '') === description) return;
      commit();
      updateNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, description } } : n)),
      );
    },
    [commit, updateNodes],
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
      updateNodes((nds) => addNoteBound(nds, createNode(type, pos, t(`elements.${type}.newLabel`))));
    },
    [commit, t, updateNodes],
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
      updateNodes((nds) => addNoteBound(nds, createNode(type, pos, t(`elements.${type}.newLabel`))));
    },
    [commit, t, updateNodes],
  );

  // Pivotal: tape across every selected event not yet marked; else one strip on the board.
  const addPivotal = useCallback(() => {
    const nds = nodesRef.current;
    const marked = new Set(nds.filter((n) => n.type === 'pivotal').map(boundToOf));
    const events = nds.filter((n) => n.selected && n.type === 'event' && !marked.has(n.id));
    if (events.length === 0) {
      addElement('pivotal');
      return;
    }
    const size = ELEMENT_DEFAULT_SIZE.pivotal!;
    commit();
    updateNodes((prev) => [
      ...prev,
      ...events.map((ev) => {
        const r = nodeRect(ev);
        const pos = { x: r.x + r.w / 2 - size.width / 2, y: r.y + r.h / 2 - size.height / 2 };
        const tape = createNode('pivotal', pos, t('elements.pivotal.newLabel'));
        return { ...tape, data: { ...tape.data, boundTo: ev.id } };
      }),
    ]);
  }, [addElement, commit, t, updateNodes]);

  /** The board area currently on screen, in flow coordinates. */
  const visibleFlowRect = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const vp = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
    const w = rect?.width ?? 800;
    const h = rect?.height ?? 600;
    return { x: -vp.x / vp.zoom, y: -vp.y / vp.zoom, w: w / vp.zoom, h: h / vp.zoom };
  }, []);

  // New lane: under the last one if that is on screen, else near the top of the
  // view — in the free gap there, or below every lane if that spot is taken.
  const addLane = useCallback(() => {
    const view = visibleFlowRect();
    const lanes = structure.lanes;
    const bottom = Math.max(...lanes.map((l) => l.y + l.height));
    const y = bottom >= view.y && bottom <= view.y + view.h - 60 ? bottom : view.y + 40 / (viewportRef.current?.zoom ?? 1);
    const spot = placeLane(lanes, y, DEFAULT_LANE_HEIGHT, MIN_LANE_HEIGHT) ?? { y: bottom, height: DEFAULT_LANE_HEIGHT };
    commit();
    const id = structureEdits.addLane({ label: t('structure.newLane'), ...spot });
    setRulerPref(true);
    setStructureEditRequest({ kind: 'lane', id });
  }, [visibleFlowRect, structure.lanes, commit, structureEdits, t]);

  const addMilestone = useCallback(() => {
    const view = visibleFlowRect();
    commit();
    const id = structureEdits.addMilestone({ label: t('structure.newMilestone'), x: view.x + view.w / 2 });
    setRulerPref(true);
    setStructureEditRequest({ kind: 'milestone', id });
  }, [visibleFlowRect, commit, structureEdits, t]);

  const bringToFront = useCallback(() => {
    const ids = new Set(selectedNodeIds);
    if (ids.size === 0) return;
    commit();
    updateNodes((nds) => {
      const moved = nds.filter((n) => ids.has(n.id) && n.type !== 'aggregate');
      const rest = nds.filter((n) => !(ids.has(n.id) && n.type !== 'aggregate'));
      return [...rest, ...moved];
    });
  }, [selectedNodeIds, commit, updateNodes]);

  const sendToBack = useCallback(() => {
    const ids = new Set(selectedNodeIds);
    if (ids.size === 0) return;
    commit();
    updateNodes((nds) => {
      const aggregates = nds.filter((n) => n.type === 'aggregate');
      const notes = nds.filter((n) => n.type !== 'aggregate');
      const moved = notes.filter((n) => ids.has(n.id));
      const rest = notes.filter((n) => !ids.has(n.id));
      return [...aggregates, ...moved, ...rest];
    });
  }, [selectedNodeIds, commit, updateNodes]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[role="dialog"], [role="alertdialog"]'))
      ) {
        return;
      }

      // Undo / Redo
      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === 'k') {
          e.preventDefault();
          setShowPalette(true);
          return;
        }
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

    const box = paddedBox(selectedNodes);
    const aggId = newId('aggregate');
    const aggNode: Node = {
      id: aggId,
      type: 'aggregate',
      position: { x: box.x, y: box.y },
      data: { label: t('elements.aggregate.newLabel'), type: 'aggregate' },
      style: { width: box.w, height: box.h },
      selectable: true,
      draggable: true,
    };

    updateNodes((nds) => {
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
  }, [selectedNodeIds, nodes, t, commit, updateNodes]);

  const onNodeDrag = useCallback<NodeDragHandler>(
    (_event, node) => {
      // An attacher: highlight the note it would be bound to if dropped here.
      if (isAttacher(node)) {
        setDropTargetId(nextBinding(node, nodesRef.current));
        return;
      }

      // Only free events/commands can become a new child — highlight the aggregate under them.
      if (!canJoinAggregate(node) || node.data?.aggregateId) {
        setDropTargetId(null);
        return;
      }

      setDropTargetId(aggregateUnder(node, nodes)?.id ?? null);
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
      if (oldAggId && isModifierHeld(event, REMOVE_MODIFIER_KEY)) {
        const agg = nodes.find((n) => n.id === oldAggId);
        if (agg && isNodeCenterOutside(dragged, agg)) {
          updateNodes((nds) => {
            const detached = nds.map((n) =>
              n.id === node.id ? { ...n, data: { ...n.data, aggregateId: null } } : n,
            );
            return fitAggregateToChildren(removeEmptyAggregates(detached), oldAggId);
          });
        }
        return;
      }

      // Binding: still on its target ⇒ stays bound; moved off ⇒ unbound, or rebound
      // to the single note it was dropped onto.
      if (isAttacher(dragged)) {
        updateNodes((nds) => {
          const cur = nds.find((n) => n.id === node.id);
          return cur ? setBinding(nds, cur.id, nextBinding(cur, nds)) : nds;
        });
        return;
      }

      // Drop-to-join (never nest aggregates; only events/commands are members).
      const target = canJoinAggregate(dragged) ? aggregateUnder(dragged, nodes, oldAggId) : undefined;

      if (!target) {
        // Re-fit the child's own aggregate (tighten after it grew to follow the drag).
        if (oldAggId) {
          updateNodes((nds) => fitAggregateToChildren(nds, oldAggId));
        }
        return;
      }

      updateNodes((nds) => {
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
    [nodes, updateNodes],
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

  const onMoveEnd = useCallback<OnMoveEnd>(
    (_event, vp) => {
      viewportRef.current = vp;
      saveViewport(canvasId, vp);
    },
    [canvasId],
  );

  // Content persistence needs no code here: every edit is already in the shared
  // doc, which the provider syncs (IndexedDB locally, the room server remotely).

  // ---- Published versions.
  const getSnapshot = useCallback(() => docToSnapshot(doc), [doc]);

  // ---- Export the raw board (nodes + edges) as YAML.
  const exportYaml = useCallback(() => {
    const yaml = canvasToYaml(docToSnapshot(doc), { name });
    const url = URL.createObjectURL(new Blob([yaml], { type: 'application/yaml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.trim() || 'canvas'}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [doc, name]);
  // Overwrite the board with a published snapshot as one undoable local step;
  // it reaches peers through the doc like any other edit.
  const restoreSnapshot = useCallback(
    (snapshot: CanvasSnapshot) => {
      commit();
      snapshotToDoc(snapshot, doc, LOCAL_ORIGIN);
      // The doc observers skip LOCAL_ORIGIN, so refresh the arrays here.
      const nextNodes = nodesFromDoc(doc, nodesRef.current);
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      const nextEdges = edgesFromDoc(doc, edgesRef.current);
      edgesRef.current = nextEdges;
      setEdges(nextEdges);
    },
    [commit, doc],
  );

  // ---- Compile to natural language. Re-analysed live while the panel is open,
  // so problems disappear as the user fixes them.
  const compileInput = useMemo(
    () => (showCompile ? { nodes: nodes.map(fromFlowNode), edges: edges.map(fromFlowEdge) } : null),
    [showCompile, nodes, edges],
  );
  const compiled = useMemo(
    () => (compileInput ? compileCanvas(compileInput, { title: name }) : null),
    [compileInput, name],
  );
  const compileNodesById = useMemo(
    () => new Map((compileInput?.nodes ?? []).map((n) => [n.id, n])),
    [compileInput],
  );
  const nodeDiagnostics = useMemo(() => {
    const map = new Map<string, Severity>();
    for (const d of compiled?.diagnostics ?? []) {
      for (const id of d.nodeIds) if (map.get(id) !== 'error') map.set(id, d.severity);
    }
    return map;
  }, [compiled]);
  // Render-only edge styling: never written to the doc (the binding ignores style).
  const renderedEdges = useMemo(() => {
    const worst = new Map<string, Severity>();
    for (const d of compiled?.diagnostics ?? []) {
      for (const id of d.edgeIds) if (worst.get(id) !== 'error') worst.set(id, d.severity);
    }
    if (worst.size === 0) return edges;
    return edges.map((e) => {
      const color = diagnosticColor(worst.get(e.id));
      return color ? { ...e, style: { ...e.style, stroke: color, strokeWidth: 2.5 } } : e;
    });
  }, [edges, compiled]);

  // Select exactly these notes / edges and bring the notes into view.
  const focusElements = useCallback(
    (nodeList: readonly string[], edgeList: readonly string[] = []) => {
      const nodeIds = new Set(nodeList);
      const edgeIds = new Set(edgeList);
      onNodesChange(
        nodesRef.current
          .filter((n) => !!n.selected !== nodeIds.has(n.id))
          .map((n) => ({ type: 'select' as const, id: n.id, selected: nodeIds.has(n.id) })),
      );
      onEdgesChange(
        edgesRef.current
          .filter((e) => !!e.selected !== edgeIds.has(e.id))
          .map((e) => ({ type: 'select' as const, id: e.id, selected: edgeIds.has(e.id) })),
      );
      if (nodeIds.size > 0) {
        rfInstanceRef.current?.fitView({ nodes: [...nodeIds].map((id) => ({ id })), padding: 0.6, duration: 300, maxZoom: 1.2 });
      }
    },
    [onNodesChange, onEdgesChange],
  );
  const focusDiagnostic = useCallback((d: Diagnostic) => focusElements(d.nodeIds, d.edgeIds), [focusElements]);
  const focusNode = useCallback((id: string) => focusElements([id]), [focusElements]);

  const canGroup = useMemo(
    () =>
      selectedNodeIds.length >= 2 &&
      selectedNodeIds.every((id) => {
        const node = nodes.find((n) => n.id === id);
        return !!node && canJoinAggregate(node);
      }),
    [selectedNodeIds, nodes],
  );

  // ---- Global search (⌘K): structuring tools live here rather than in the toolbar.
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const swatch = (type: ElementType) => (
      <span className="block h-3 w-3 rounded-sm" style={{ backgroundColor: ELEMENT_STYLES[type].color }} />
    );
    return [
      {
        id: 'pivotal',
        label: t('palette.pivotal'),
        hint: t('palette.pivotalHint'),
        keywords: 'pivotal event tape phase 关键事件 胶带 阶段',
        icon: <Flag size={15} />,
        run: addPivotal,
      },
      { id: 'lane', label: t('palette.lane'), keywords: 'swimlane lane role 泳道 角色', icon: <Rows3 size={15} />, run: addLane },
      {
        id: 'milestone',
        label: t('palette.milestone'),
        keywords: 'temporal time milestone timeline 时间 里程碑',
        icon: <Milestone size={15} />,
        run: addMilestone,
      },
      {
        id: 'rulers',
        label: t(rulersVisible ? 'palette.hideRulers' : 'palette.showRulers'),
        keywords: 'ruler 标尺',
        icon: <Ruler size={15} />,
        run: () => setRulerPref(!rulersVisible),
      },
      ...ELEMENT_ORDER.map((type) => ({
        id: `add-${type}`,
        label: t('palette.add', { element: t(`elements.${type}.label`) }),
        hint: ELEMENT_STYLES[type].shortcut,
        keywords: type,
        icon: swatch(type),
        run: () => addElement(type),
      })),
      ...(canGroup
        ? [
            {
              id: 'group',
              label: t('toolbar.groupAsAggregate'),
              keywords: 'aggregate 聚合',
              icon: <Group size={15} />,
              run: groupAsAggregate,
            },
          ]
        : []),
      { id: 'compile', label: t('compile.title'), keywords: 'compile 编译', icon: <ScrollText size={15} />, run: () => setShowCompile(true) },
      { id: 'yaml', label: t('toolbar.exportYaml'), keywords: 'export yaml 导出', icon: <FileDown size={15} />, run: exportYaml },
      {
        id: 'help',
        label: t('toolbar.help'),
        keywords: 'help tour guide shortcuts 帮助 引导 教程 快捷键',
        icon: <CircleHelp size={15} />,
        run: () => setShowTour(true),
      },
    ];
  }, [t, addPivotal, addLane, addMilestone, rulersVisible, addElement, canGroup, groupAsAggregate, exportYaml]);

  const tourSteps = useMemo<TourStep[]>(
    () =>
    {
      // Workshop steps, in the book's order: example board (read-only canvas) + how to do it here.
      const workshop = (
        [
          ['events', 'elements'],
          ['people', 'elements'],
          ['hotspots', 'elements'],
          ['structure', 'search'],
          ['process', 'elements'],
          ['aggregates', 'group'],
          ['compile', 'compile'],
          ['publish', 'publish'],
        ] as const
      ).map(([id, target]) => ({
        id,
        target,
        optional: id === 'publish',
        group: t('tour.groupWorkshop'),
        title: t(`tour.${id}.title`),
        body: t(`tour.${id}.body`),
        content: (
          <>
            {id === 'compile' ? <CompileExample /> : id !== 'publish' && <GuideExample board={id} />}
            <HowTo text={t(`tour.${id}.how`)} />
          </>
        ),
      }));
      const reference = (
        [
          ['elements', ElementList],
          ['grammar', GrammarLists],
          ['shortcuts', ShortcutList],
          ['concepts', ConceptList],
        ] as const
      ).map(([id, Content]) => ({
        id,
        content: <Content />,
        group: t('tour.groupReference'),
        title: t(`tour.${id}.title`),
        body: t(`tour.${id}.body`),
      }));
      return [
        { id: 'welcome', group: t('tour.groupWorkshop'), title: t('tour.welcome.title'), body: t('tour.welcome.body') },
        ...workshop,
        ...reference,
      ];
    },
    [t],
  );

  const inset = rulersVisible ? RULER_SIZE : 0;

  return (
    <div className="w-full h-full relative">
      {rulersVisible && <Rulers structure={structure} actions={rulerActions} editRequest={structureEditRequest} />}
      <div
        ref={canvasRef}
        className="absolute right-0 bottom-0"
        style={{ top: inset, left: inset }}
        onMouseMove={touchMode ? undefined : onPointerMove}
        onMouseLeave={onPointerLeave}
      >
        <div className="safe-top absolute right-4 z-20 flex items-center gap-2">
          <PresenceBar me={me} peers={peers} status={status} />
          <button
            data-tour="compile"
            onClick={() => setShowCompile((v) => !v)}
            aria-pressed={showCompile}
            className={`editor-chip flex items-center gap-1.5 h-9 px-3 text-sm font-semibold hover:bg-ink hover:text-paper hover:border-ink${showCompile ? ' bg-ink text-paper border-ink' : ''}`}
            title={t('compile.title')}
          >
            <ScrollText size={16} />
            <span>{t('compile.open')}</span>
          </button>
          {isRemoteMode() && (
            <button
              data-tour="publish"
              onClick={() => setShowVersions(true)}
              className="editor-chip flex items-center gap-1.5 h-9 px-3 text-sm font-semibold bg-accent hover:bg-ink hover:text-paper hover:border-ink"
              title={t('versions.title')}
            >
              <Upload size={16} />
              <span>{t('versions.publish')}</span>
            </button>
          )}
          <button
            onClick={onBack}
            className="editor-chip flex items-center gap-1.5 h-9 px-3 text-sm font-semibold hover:bg-ink hover:text-paper hover:border-ink"
            title={t('editor.back')}
          >
            <ArrowLeft size={16} />
            <span>{t('editor.back')}</span>
          </button>
        </div>
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
          <RemoteSelectionContext.Provider value={remoteSelection}>
          <DiagnosticsContext.Provider value={nodeDiagnostics}>
            <Toolbar
              onAddElement={addElement}
              onGroupAggregate={groupAsAggregate}
              onBringToFront={bringToFront}
              onSendToBack={sendToBack}
              onHelp={() => setShowTour(true)}
              onSearch={() => setShowPalette(true)}
              onExportYaml={exportYaml}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              canGroup={canGroup}
              touchMode={touchMode}
            />

            <ReactFlow
              nodes={nodes}
              edges={renderedEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
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
              fitView={!initialViewport}
              onInit={onInit}
              elevateNodesOnSelect={false}
              defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
              className="esboard-surface"
            >
              <BoardBackground />
              <BoardStructure structure={structure} />
              <Controls />
              {!touchMode && (
                <MiniMap
                  nodeColor={(node) => ELEMENT_STYLES[node.type as ElementType]?.color ?? 'var(--color-board-line)'}
                  className="bg-surface border border-border rounded"
                />
              )}
              <RemoteCursors peers={peers} />
            </ReactFlow>
          </DiagnosticsContext.Provider>
          </RemoteSelectionContext.Provider>
          </DropTargetContext.Provider>
        </CanvasActionsContext.Provider>

        {compiled && (
          <CompilePanel
            result={compiled}
            nodes={compileNodesById}
            fileName={name}
            onFocus={focusDiagnostic}
            onClose={() => setShowCompile(false)}
          />
        )}
        <GuidedTour open={showTour} steps={tourSteps} onClose={() => setShowTour(false)} />
        <CommandPalette
          open={showPalette}
          onOpenChange={setShowPalette}
          commands={paletteCommands}
          nodes={nodes}
          onFocusNode={focusNode}
        />
        {isRemoteMode() && (
          <VersionsDialog
            open={showVersions}
            onOpenChange={setShowVersions}
            store={store}
            canvasId={canvasId}
            getSnapshot={getSnapshot}
            onRestore={restoreSnapshot}
          />
        )}
      </div>
    </div>
  );
}
