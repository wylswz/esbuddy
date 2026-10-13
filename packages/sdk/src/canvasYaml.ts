import type { CanvasSnapshot } from './domain.js';

/*
 * Canvas → YAML: the raw board (nodes and edges, as stored), for backups,
 * diffs and tooling. Not the compiled model — every note and edge is kept,
 * legal or not.
 *
 * A small emitter for JSON-like values, no dependency: strings are always
 * double-quoted (JSON escaping is valid YAML), so labels like `yes`, `1.0` or
 * `key: value` can never change type or break the document.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined };

const PLAIN_KEY = /^[A-Za-z_][\w-]*$/;

function key(k: string): string {
  return PLAIN_KEY.test(k) ? k : JSON.stringify(k);
}

function isObject(v: unknown): v is { [key: string]: Json | undefined } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Inline form for scalars and empty collections; null if the value needs a block. */
function inline(v: Json): string | null {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length === 0 ? '[]' : null;
  return Object.values(v).some((x) => x !== undefined) ? null : '{}';
}

function block(v: Json, indent: number): string[] {
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) {
    return v.flatMap((item) => {
      const flat = inline(item);
      if (flat !== null) return [`${pad}- ${flat}`];
      // First line of the nested block shares the dash: "- key: value".
      const lines = block(item, indent + 2);
      return [`${pad}- ${lines[0].trimStart()}`, ...lines.slice(1)];
    });
  }
  if (!isObject(v)) return [`${pad}${inline(v)}`];
  return Object.entries(v).flatMap(([k, val]) => {
    if (val === undefined) return [];
    const flat = inline(val);
    return flat !== null ? [`${pad}${key(k)}: ${flat}`] : [`${pad}${key(k)}:`, ...block(val, indent + 2)];
  });
}

export function toYaml(value: Json): string {
  const flat = inline(value);
  return (flat !== null ? flat : block(value, 0).join('\n')) + '\n';
}

export interface CanvasYamlOptions {
  /** Canvas name, written as the `name` field when given. */
  name?: string;
}

/** Serialise a canvas (nodes + edges) as YAML. The per-user viewport is left out. */
export function canvasToYaml(snapshot: Pick<CanvasSnapshot, 'nodes' | 'edges'>, options: CanvasYamlOptions = {}): string {
  const doc = {
    ...(options.name?.trim() ? { name: options.name.trim() } : {}),
    nodes: snapshot.nodes.map((n) => {
      // Legacy snapshots carry the size in a React Flow `style` instead.
      const style = (n as { style?: { width?: unknown; height?: unknown } }).style;
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      return {
        id: n.id,
        type: n.type,
        position: { x: n.position.x, y: n.position.y },
        width: num(n.width) ?? num(style?.width),
        height: num(n.height) ?? num(style?.height),
        data: n.data as Json,
      };
    }),
    edges: snapshot.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      // Handles are almost always unset; only written when present.
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  };
  return `# Esbuddy canvas\n${toYaml(doc)}`;
}
