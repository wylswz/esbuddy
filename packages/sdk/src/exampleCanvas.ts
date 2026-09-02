import type { CanvasSnapshot } from './domain.js';

/*
 * A complete EventStorming "design-level" model of an e-commerce order-fulfillment
 * flow, seeded into every new workspace. It exercises every element type so users
 * have a worked DDD example to explore. Read left-to-right along the event timeline.
 *
 * Nodes carry a React Flow `style` (width/height) so the web editor renders them at
 * the right size — the persisted snapshot mirrors what the editor itself saves.
 */
const NOTE = 160;

interface Seed {
  id: string;
  type: string;
  x: number;
  y: number;
  label: string;
  aggregateId?: string;
  description?: string;
  w?: number;
  h?: number;
}

/*
 * Positions are deliberately a little uneven — like notes slapped on a wall by hand.
 * Array order is the stacking order (later nodes render on top), so small notes that
 * are stuck onto the corner of another note come after the note they overlap.
 */
const NODES: Seed[] = [
  // Aggregates (translucent boundaries drawn behind their member events).
  { id: 'agg_order', type: 'aggregate', x: 70, y: 405, label: 'Order', w: 520, h: 260 },
  { id: 'agg_payment', type: 'aggregate', x: 640, y: 415, label: 'Payment', w: 500, h: 250 },
  { id: 'agg_shipment', type: 'aggregate', x: 1190, y: 400, label: 'Shipment', w: 760, h: 270 },

  // Commands — intents that (may) produce events.
  { id: 'cmd_place_order', type: 'command', x: 118, y: 232, label: 'Place Order', w: 165, h: 155 },
  { id: 'cmd_confirm_payment', type: 'command', x: 905, y: 218, label: 'Confirm Payment', w: 160, h: 165 },
  { id: 'cmd_prepare_shipment', type: 'command', x: 1232, y: 246, label: 'Prepare Shipment', w: 158, h: 150 },
  { id: 'cmd_ship_order', type: 'command', x: 1520, y: 226, label: 'Ship Order', w: 170, h: 158 },

  // Actors — small notes stuck onto the corner of the command they issue (no arrow needed).
  { id: 'actor_customer', type: 'actor', x: 62, y: 308, label: 'Customer', w: 120, h: 92 },
  { id: 'actor_warehouse', type: 'actor', x: 1462, y: 298, label: 'Warehouse Staff', w: 128, h: 96 },

  // Events — facts on the timeline, grouped into their aggregates.
  {
    id: 'ev_order_placed',
    type: 'event',
    x: 112,
    y: 452,
    label: 'Order Placed',
    aggregateId: 'agg_order',
    description: 'The customer submitted a valid order with items and address.',
    w: 168,
    h: 172,
  },
  { id: 'ev_order_confirmed', type: 'event', x: 388, y: 468, label: 'Order Confirmed', aggregateId: 'agg_order', w: 158, h: 152 },
  { id: 'ev_payment_requested', type: 'event', x: 684, y: 458, label: 'Payment Requested', aggregateId: 'agg_payment', w: 162, h: 160 },
  { id: 'ev_payment_confirmed', type: 'event', x: 928, y: 470, label: 'Payment Confirmed', aggregateId: 'agg_payment', w: 166, h: 150 },
  { id: 'ev_shipment_prepared', type: 'event', x: 1236, y: 448, label: 'Shipment Prepared', aggregateId: 'agg_shipment', w: 156, h: 168 },
  { id: 'ev_order_shipped', type: 'event', x: 1512, y: 464, label: 'Order Shipped', aggregateId: 'agg_shipment', w: 170, h: 156 },
  { id: 'ev_order_delivered', type: 'event', x: 1748, y: 452, label: 'Order Delivered', aggregateId: 'agg_shipment', w: 160, h: 164 },

  // Hot spot — slapped diagonally over the corner of the event it questions.
  {
    id: 'hot_payment_failure',
    type: 'hotspot',
    x: 788,
    y: 566,
    label: 'Payment failure?',
    description: 'Timeouts, declines, partial captures?',
    w: 138,
    h: 118,
  },

  // Read models — tucked right under the event they project from (no arrow, just proximity).
  { id: 'rm_order_summary', type: 'readmodel', x: 412, y: 578, label: 'Order Summary', w: 150, h: 120 },
  { id: 'rm_shipment_tracking', type: 'readmodel', x: 1782, y: 574, label: 'Shipment Tracking', w: 150, h: 124 },

  // Policies — reactive "when X, then Y" rules.
  {
    id: 'pol_request_payment',
    type: 'policy',
    x: 402,
    y: 752,
    label: 'When Order Placed → Request Payment',
    description: 'Whenever an order is placed, ask the customer to pay.',
    w: 172,
    h: 168,
  },
  { id: 'pol_confirm_order', type: 'policy', x: 706, y: 774, label: 'When Payment Confirmed → Confirm Order', w: 160, h: 160 },
  { id: 'pol_prepare_shipment', type: 'policy', x: 964, y: 742, label: 'When Order Confirmed → Prepare Shipment', w: 166, h: 172 },

  // External systems.
  { id: 'ext_payment_gateway', type: 'external', x: 662, y: 1004, label: 'Payment Gateway', w: 158, h: 148 },
  { id: 'ext_shipping_provider', type: 'external', x: 1536, y: 748, label: 'Shipping Provider', w: 164, h: 152 },
];

/*
 * Arrows are used sparingly — only where a causal flow isn't obvious from placement.
 * Actors sit on their command, read models sit under their event, and the hot spot
 * is stuck onto the event it questions, so none of those need an edge.
 */
const EDGES: [string, string][] = [
  ['cmd_place_order', 'ev_order_placed'],
  ['ev_order_placed', 'pol_request_payment'],
  ['pol_request_payment', 'ev_payment_requested'],
  ['ev_payment_requested', 'ext_payment_gateway'],
  ['ext_payment_gateway', 'cmd_confirm_payment'],
  ['cmd_confirm_payment', 'ev_payment_confirmed'],
  ['ev_payment_confirmed', 'pol_confirm_order'],
  ['pol_confirm_order', 'ev_order_confirmed'],
  ['ev_order_confirmed', 'pol_prepare_shipment'],
  ['pol_prepare_shipment', 'cmd_prepare_shipment'],
  ['cmd_prepare_shipment', 'ev_shipment_prepared'],
  ['cmd_ship_order', 'ev_order_shipped'],
  ['ev_order_shipped', 'ext_shipping_provider'],
  ['ext_shipping_provider', 'ev_order_delivered'],
];

export const EXAMPLE_CANVAS_NAME = 'Example: Order Fulfillment';

/** Build a fresh copy of the example board snapshot (safe to JSON.stringify). */
export function exampleCanvasSnapshot(): CanvasSnapshot {
  const nodes = NODES.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    style: { width: n.w ?? NOTE, height: n.h ?? NOTE },
    data: {
      label: n.label,
      type: n.type,
      ...(n.aggregateId ? { aggregateId: n.aggregateId } : {}),
      ...(n.description ? { description: n.description } : {}),
    },
  }));

  const edges = EDGES.map(([source, target]) => ({
    id: `e_${source}_${target}`,
    source,
    target,
    markerEnd: { type: 'arrowclosed' },
  }));

  return { nodes, edges, viewport: null } as unknown as CanvasSnapshot;
}
