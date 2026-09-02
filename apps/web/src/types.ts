import type { ElementType } from '@esbuddy/sdk';

export type { ElementType } from '@esbuddy/sdk';

export const NOTE_DEFAULT_SIZE = 180;
export const NOTE_MIN_SIZE = 120;

export const ELEMENT_DEFAULT_SIZE: Partial<Record<ElementType, { width: number; height: number }>> = {
  actor: { width: 140, height: 100 },
};

export interface ElementData {
  label: string;
  type: ElementType;
  description?: string;
  aggregateId?: string | null;
}

export interface EsNode {
  id: string;
  type: ElementType;
  position: { x: number; y: number };
  data: ElementData;
  style?: { width: number; height: number };
}

export interface EsEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface EsCanvasState {
  nodes: EsNode[];
  edges: EsEdge[];
}

export interface ElementStyle {
  color: string;
  bgColor: string;
  borderColor: string;
  shortcut?: string;
}

/*
 * Element palette. The actual colour values live in the `@theme` block of index.css
 * (single source of truth, shared with Tailwind utilities like `bg-event-bg`); here we
 * only reference the CSS variables so inline styles and SVG fills stay in sync.
 */
const elementStyle = (type: ElementType, shortcut?: string): ElementStyle => ({
  color: `var(--color-${type})`,
  bgColor: `var(--color-${type}-bg)`,
  borderColor: `var(--color-${type}-border)`,
  ...(shortcut ? { shortcut } : {}),
});

export const ELEMENT_STYLES: Record<ElementType, ElementStyle> = {
  event: elementStyle('event', 'E'),
  command: elementStyle('command', 'C'),
  aggregate: elementStyle('aggregate'),
  actor: elementStyle('actor', 'A'),
  policy: elementStyle('policy', 'P'),
  external: elementStyle('external', 'X'),
  hotspot: elementStyle('hotspot', 'H'),
  readmodel: elementStyle('readmodel', 'R'),
};
