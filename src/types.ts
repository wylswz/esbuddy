export type ElementType = 'event' | 'command' | 'aggregate' | 'actor' | 'policy' | 'external' | 'hotspot';

export const NOTE_DEFAULT_SIZE = 180;
export const NOTE_MIN_SIZE = 120;

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

export const ELEMENT_STYLES: Record<ElementType, ElementStyle> = {
  event: {
    color: '#f97316',
    bgColor: '#fff7ed',
    borderColor: '#fb923c',
    shortcut: 'E',
  },
  command: {
    color: '#3b82f6',
    bgColor: '#eff6ff',
    borderColor: '#60a5fa',
    shortcut: 'C',
  },
  aggregate: {
    color: '#10b981',
    bgColor: '#ecfdf5',
    borderColor: '#34d399',
  },
  actor: {
    color: '#eab308',
    bgColor: '#fefce8',
    borderColor: '#facc15',
    shortcut: 'A',
  },
  policy: {
    color: '#a855f7',
    bgColor: '#faf5ff',
    borderColor: '#c084fc',
    shortcut: 'P',
  },
  external: {
    color: '#ec4899',
    bgColor: '#fdf2f8',
    borderColor: '#f472b6',
    shortcut: 'X',
  },
  hotspot: {
    color: '#991b1b',
    bgColor: '#fef2f2',
    borderColor: '#dc2626',
    shortcut: 'H',
  },
};
