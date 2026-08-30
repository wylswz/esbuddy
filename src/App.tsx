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
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type Viewport,
  type NodeDragHandler,
  type OnMoveEnd,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { StickyNode } from './components/StickyNode';
import { AggregateNode } from './components/AggregateNode';
import { Toolbar } from './components/Toolbar';
import { ExportModal } from './components/ExportModal';
import { exportToCML } from './cmlExporter';
import { parseCML, createNode } from './cmlImporter';
import { CanvasActionsContext } from './CanvasContext';
import { loadCanvas, saveCanvas, DEFAULT_CANVAS_ID } from './storage';
import type { ElementType, EsCanvasState } from './types';

const AGGREGATE_PADDING = 40;
const AGGREGATE_INSET = 12;
const REMOVE_MODIFIER_KEY: 'Shift' | 'Alt' | 'Control' | 'Meta' = 'Shift';

const nodeTypes = {
  event: StickyNode,
  command: StickyNode,
  aggregate: AggregateNode,
  actor: StickyNode,
  policy: StickyNode,
  external: StickyNode,
};

const initialNodes: Node[] = [
  {
    id: 'event_demo_1',
    type: 'event',
    position: { x: 300, y: 200 },
    data: { label: 'Order Placed', type: 'event' },
  },
  {
    id: 'cmd_demo_1',
    type: 'command',
    position: { x: 100, y: 200 },
    data: { label: 'Place Order', type: 'command' },
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
 *    - clamping child positions while dragging (clampChildrenToAggregates)
 *    - blocking aggregate resizes that would uncover a child (AggregateNode#shouldResize)
 *    - re-fitting the box on add/remove (fitAggregateToChildren)
 *    To break out, hold Shift while dragging (removes the child instead).
 *
 * 2. No nesting — an aggregate can never contain another aggregate. Enforced by
 *    skipping aggregates in drop-to-join and only grouping events/commands.
 *
 * 3. Single parent — an element belongs to at most one aggregate (single aggregateId).
 *
 * 4. No orphans — an aggregate left with zero children is removed (removeEmptyAggregates).
 */

function clamp01(v: number, a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.min(Math.max(v, lo), hi);
}

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

function clampChildToAggregate(child: Node, agg: Node): { x: number; y: number } {
  const childW = child.width ?? 180;
  const childH = child.height ?? 84;
  const b = aggregateBounds(agg);

  return {
    x: clamp01(child.position.x, b.x + AGGREGATE_INSET, b.x + b.w - AGGREGATE_INSET - childW),
    y: clamp01(child.position.y, b.y + AGGREGATE_INSET, b.y + b.h - AGGREGATE_INSET - childH),
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

// Keep directly-dragged children inside their aggregate unless the removal key is held.
function clampChildrenToAggregates(nextNodes: Node[], changes: NodeChange[], constrain: boolean): Node[] {
  if (!constrain) return nextNodes;

  const draggingIds = new Set<string>();
  for (const change of changes) {
    if (change.type === 'position' && change.dragging) draggingIds.add(change.id);
  }
  if (draggingIds.size === 0) return nextNodes;

  const aggregates = new Map<string, Node>();
  nextNodes.forEach((n) => {
    if (n.type === 'aggregate') aggregates.set(n.id, n);
  });

  return nextNodes.map((n) => {
    if (!draggingIds.has(n.id)) return n;
    const aggId = n.data?.aggregateId as string | undefined;
    if (!aggId) return n;
    const agg = aggregates.get(aggId);
    if (!agg) return n;

    const pos = clampChildToAggregate(n, agg);
    if (pos.x === n.position.x && pos.y === n.position.y) return n;
    return { ...n, position: pos };
  });
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

function App() {
  const [snapshot] = useState(() => loadCanvas(DEFAULT_CANVAS_ID));
  const [nodes, setNodes] = useState<Node[]>(() => snapshot?.nodes ?? initialNodes);
  const [edges, setEdges] = useState<Edge[]>(() => snapshot?.edges ?? initialEdges);
  const [viewport, setViewport] = useState<Viewport | null>(() => snapshot?.viewport ?? null);
  const [showExport, setShowExport] = useState(false);
  const [exportedCml, setExportedCml] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

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
    setNodes((nds) => {
      const applied = applyNodeChanges(changes, nds);
      const followed = followAggregateChildren(nds, applied, changes);
      const clamped = clampChildrenToAggregates(followed, changes, !removeKeyRef.current);
      return handleNodeRemovals(nds, clamped, changes);
    });
  }, []);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect = useCallback(
    (conn: Connection) =>
      setEdges((eds) => addEdge({ ...conn, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [],
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    setSelectedNodeIds(selectedNodes.map((n) => n.id));
  }, []);

  const updateNodeLabel = useCallback((id: string, label: string) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)));
  }, []);

  const actions = useMemo(() => ({ updateNodeLabel }), [updateNodeLabel]);

  const addElement = useCallback((type: ElementType) => {
    const center = { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 };
    setNodes((nds) => [...nds, createNode(type, center)]);
  }, []);

  const groupAsAggregate = useCallback(() => {
    if (selectedNodeIds.length < 2) return;

    const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
    if (selectedNodes.length === 0) return;

    const minX = Math.min(...selectedNodes.map((n) => n.position.x));
    const minY = Math.min(...selectedNodes.map((n) => n.position.y));
    const maxX = Math.max(...selectedNodes.map((n) => n.position.x + (n.width ?? 220)));
    const maxY = Math.max(...selectedNodes.map((n) => n.position.y + (n.height ?? 90)));

    const aggId = `aggregate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const aggNode: Node = {
      id: aggId,
      type: 'aggregate',
      position: { x: minX - AGGREGATE_PADDING, y: minY - AGGREGATE_PADDING },
      data: { label: 'New Aggregate', type: 'aggregate' },
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
  }, [selectedNodeIds, nodes]);

  const onNodeDragStop = useCallback<NodeDragHandler>(
    (event, node) => {
      if (node.type === 'aggregate') return;

      // Prefer the clamped position from state (a constrained child never leaves its box).
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

      if (!target) return;

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

  const onMoveEnd = useCallback<OnMoveEnd>((_event, vp) => {
    setViewport(vp);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveCanvas(DEFAULT_CANVAS_ID, { nodes, edges, viewport });
    }, 250);
    return () => clearTimeout(timer);
  }, [nodes, edges, viewport]);

  const handleExport = useCallback(() => {
    const state: EsCanvasState = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.type as ElementType,
        position: n.position,
        data: {
          label: n.data.label as string,
          type: n.data.type as ElementType,
          aggregateId: (n.data.aggregateId as string) || null,
        },
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
    };
    const cml = exportToCML(state);
    setExportedCml(cml);
    setShowExport(true);
  }, [nodes, edges]);

  const handleImport = useCallback((cml: string) => {
    const state = parseCML(cml);
    setNodes(state.nodes as Node[]);
    setEdges(state.edges as Edge[]);
  }, []);

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
    <div className="w-full h-full relative">
      <CanvasActionsContext.Provider value={actions}>
        <Toolbar
          onAddElement={addElement}
          onExport={handleExport}
          onImport={handleImport}
          onGroupAggregate={groupAsAggregate}
          canGroup={canGroup}
        />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={onMoveEnd}
          fitView={!snapshot}
          defaultViewport={snapshot?.viewport ?? undefined}
          elevateNodesOnSelect={false}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
          className="esboard-surface"
        >
          <Background variant={BackgroundVariant.Lines} gap={24} size={1} color="#cbd5e1" />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const type = node.type as ElementType;
              const colors: Record<string, string> = {
                event: '#f97316',
                command: '#3b82f6',
                aggregate: '#10b981',
                actor: '#eab308',
                policy: '#a855f7',
                external: '#ec4899',
              };
              return colors[type] || '#94a3b8';
            }}
            className="bg-white border border-gray-200 rounded"
          />
        </ReactFlow>
      </CanvasActionsContext.Provider>

      {showExport && <ExportModal cml={exportedCml} onClose={() => setShowExport(false)} />}
    </div>
  );
}

export default App;
