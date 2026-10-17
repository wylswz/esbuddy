import type { ElementType } from '@esbuddy/sdk';

export type { ElementType } from '@esbuddy/sdk';
// Shared with the compiler, which needs the same sizes to detect overlaps.
export { NOTE_DEFAULT_SIZE, ELEMENT_DEFAULT_SIZE } from '@esbuddy/sdk';

export const NOTE_MIN_SIZE = 120;

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

/** First-class notes, in palette order. Structure (pivotal tape) is reached through search instead. */
export const ELEMENT_ORDER: ElementType[] = ['event', 'command', 'actor', 'policy', 'external', 'hotspot', 'readmodel', 'note'];

export const ELEMENT_STYLES: Record<ElementType, ElementStyle> = {
  event: elementStyle('event', 'E'),
  command: elementStyle('command', 'C'),
  aggregate: elementStyle('aggregate'),
  actor: elementStyle('actor', 'A'),
  policy: elementStyle('policy', 'P'),
  external: elementStyle('external', 'X'),
  hotspot: elementStyle('hotspot', 'H'),
  readmodel: elementStyle('readmodel', 'R'),
  note: elementStyle('note', 'N'),
  // Structure, not a first-class note: no shortcut, reached through search (⌘K).
  pivotal: elementStyle('pivotal'),
};
