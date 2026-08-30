export type ElementType = 'event' | 'command' | 'aggregate' | 'actor' | 'policy' | 'external';

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

export const ELEMENT_STYLES: Record<ElementType, {
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  icon: string;
}> = {
  event: {
    color: '#f97316',
    bgColor: '#fff7ed',
    borderColor: '#fb923c',
    label: 'Event',
    icon: '⚡',
  },
  command: {
    color: '#3b82f6',
    bgColor: '#eff6ff',
    borderColor: '#60a5fa',
    label: 'Command',
    icon: '▶',
  },
  aggregate: {
    color: '#10b981',
    bgColor: '#ecfdf5',
    borderColor: '#34d399',
    label: 'Aggregate',
    icon: '◇',
  },
  actor: {
    color: '#eab308',
    bgColor: '#fefce8',
    borderColor: '#facc15',
    label: 'Actor',
    icon: '👤',
  },
  policy: {
    color: '#a855f7',
    bgColor: '#faf5ff',
    borderColor: '#c084fc',
    label: 'Policy',
    icon: '⚙',
  },
  external: {
    color: '#ec4899',
    bgColor: '#fdf2f8',
    borderColor: '#f472b6',
    label: 'External System',
    icon: '🌐',
  },
};
