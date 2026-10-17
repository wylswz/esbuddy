import type { CanvasEdge, CanvasNode, CanvasSnapshot, CanvasStructure } from './domain.js';
import { ELEMENT_DEFAULT_SIZE, NOTE_DEFAULT_SIZE } from './grammar.js';

/*
 * Read-only example boards for the in-app guide, one per workshop step. They
 * tell one small story (an order is placed, paid and shipped) that grows from
 * step to step, and are rendered with the real canvas, so they look exactly
 * like the editor. Labels come from a lookup so the UI can localise them.
 *
 * `compile` is the whole story; it must compile with zero diagnostics (see
 * apps/server/test/unit/guideBoards.test.ts).
 */

export type GuideLabel =
  | 'customer'
  | 'paymentProvider'
  | 'warehouse'
  | 'placeOrder'
  | 'orderPlaced'
  | 'paymentReceived'
  | 'shipOrder'
  | 'orderShipped'
  | 'shipWhenPaid'
  | 'cart'
  | 'order'
  | 'paymentFails'
  | 'day0'
  | 'day3';

export type GuideBoardId = 'events' | 'people' | 'hotspots' | 'structure' | 'process' | 'aggregates' | 'compile';

type Label = (key: GuideLabel) => string;

interface Extra {
  w?: number;
  h?: number;
  boundTo?: string;
  aggregateId?: string;
}

function node(id: string, type: string, label: string, x: number, y: number, extra: Extra = {}): CanvasNode {
  const size = ELEMENT_DEFAULT_SIZE[type as keyof typeof ELEMENT_DEFAULT_SIZE] ?? { width: NOTE_DEFAULT_SIZE, height: NOTE_DEFAULT_SIZE };
  return {
    id,
    type,
    position: { x, y },
    width: extra.w ?? size.width,
    height: extra.h ?? size.height,
    data: {
      label,
      type,
      ...(extra.boundTo ? { boundTo: extra.boundTo } : {}),
      ...(extra.aggregateId ? { aggregateId: extra.aggregateId } : {}),
    },
  };
}

const edge = (source: string, target: string): CanvasEdge => ({ id: `${source}->${target}`, source, target });

const board = (nodes: CanvasNode[], edges: CanvasEdge[] = [], structure?: CanvasStructure): CanvasSnapshot => ({
  nodes,
  edges,
  viewport: null,
  ...(structure ? { structure } : {}),
});

const SMALL = { w: 150, h: 110 };

/** The process: an actor decides on a read model; a policy reacts to the payment. */
function processNodes(l: Label): CanvasNode[] {
  return [
    node('place', 'command', l('placeOrder'), 0, 0),
    node('customer', 'actor', l('customer'), 20, -50, { boundTo: 'place' }),
    node('cart', 'readmodel', l('cart'), 60, 120, { ...SMALL, boundTo: 'place' }),
    node('placed', 'event', l('orderPlaced'), 260, 0),
    node('paid', 'event', l('paymentReceived'), 0, 340),
    node('policy', 'policy', l('shipWhenPaid'), 260, 340),
    node('ship', 'command', l('shipOrder'), 520, 340),
    node('shipped', 'event', l('orderShipped'), 780, 340),
  ];
}

const processEdges = [edge('place', 'placed'), edge('paid', 'policy'), edge('policy', 'ship'), edge('ship', 'shipped')];

export function guideBoards(l: Label): Record<GuideBoardId, CanvasSnapshot> {
  return {
    // Chaotic exploration: just events, roughly on a timeline.
    events: board([
      node('placed', 'event', l('orderPlaced'), 0, 0),
      node('paid', 'event', l('paymentReceived'), 240, 30),
      node('shipped', 'event', l('orderShipped'), 480, 0),
    ]),

    // Who or what makes each event happen.
    people: board(
      [
        node('customer', 'actor', l('customer'), 20, -130),
        node('placed', 'event', l('orderPlaced'), 0, 0),
        node('provider', 'external', l('paymentProvider'), 260, 0),
        node('paid', 'event', l('paymentReceived'), 500, 0),
      ],
      [edge('provider', 'paid')],
    ),

    // An open question stuck right where it happens.
    hotspots: board([
      node('placed', 'event', l('orderPlaced'), 0, 0),
      node('paid', 'event', l('paymentReceived'), 240, 0),
      node('question', 'hotspot', l('paymentFails'), 320, 120, { ...SMALL, boundTo: 'paid' }),
    ]),

    // Swimlanes, temporal milestones and a pivotal event.
    structure: board(
      [
        node('placed', 'event', l('orderPlaced'), 0, 0),
        node('paid', 'event', l('paymentReceived'), 240, 0),
        node('tape', 'pivotal', '', 312, -50, { h: 280, boundTo: 'paid' }),
        node('shipped', 'event', l('orderShipped'), 520, 280),
      ],
      [],
      {
        lanes: [
          { id: 'lane_customer', label: l('customer'), y: -60, height: 300 },
          { id: 'lane_warehouse', label: l('warehouse'), y: 240, height: 260 },
        ],
        milestones: [
          { id: 'ms_day0', label: l('day0'), x: -40 },
          { id: 'ms_day3', label: l('day3'), x: 470 },
        ],
      },
    ),

    process: board(processNodes(l), processEdges),

    // Commands and the events they produce, grouped around the decision maker.
    aggregates: board(
      [
        node('order', 'aggregate', l('order'), -40, -40, { w: 980, h: 260 }),
        node('place', 'command', l('placeOrder'), 0, 0, { aggregateId: 'order' }),
        node('placed', 'event', l('orderPlaced'), 240, 0, { aggregateId: 'order' }),
        node('ship', 'command', l('shipOrder'), 480, 0, { aggregateId: 'order' }),
        node('shipped', 'event', l('orderShipped'), 720, 0, { aggregateId: 'order' }),
      ],
      [edge('place', 'placed'), edge('ship', 'shipped')],
    ),

    // The whole story: the process, plus who emits the payment and what is pivotal.
    compile: board(
      [
        ...processNodes(l),
        node('provider', 'external', l('paymentProvider'), -260, 340),
        node('tape', 'pivotal', '', 72, 290, { h: 280, boundTo: 'paid' }),
      ],
      [...processEdges, edge('provider', 'paid')],
    ),
  };
}
