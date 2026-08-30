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
  label: string;
  icon: string;
  shortcut?: string;
  description: string;
}

export const ELEMENT_STYLES: Record<ElementType, ElementStyle> = {
  event: {
    color: '#f97316',
    bgColor: '#fff7ed',
    borderColor: '#fb923c',
    label: 'Event',
    icon: '⚡',
    shortcut: 'E',
    description: '领域中发生的重要事情',
  },
  command: {
    color: '#3b82f6',
    bgColor: '#eff6ff',
    borderColor: '#60a5fa',
    label: 'Command',
    icon: '▶',
    shortcut: 'C',
    description: '触发事件的动作',
  },
  aggregate: {
    color: '#10b981',
    bgColor: '#ecfdf5',
    borderColor: '#34d399',
    label: 'Aggregate',
    icon: '◇',
    description: '通过框选一组 Event/Command 创建，显示为半透明边界框',
  },
  actor: {
    color: '#eab308',
    bgColor: '#fefce8',
    borderColor: '#facc15',
    label: 'Actor',
    icon: '👤',
    shortcut: 'A',
    description: '发起 Command 的角色（人或系统）',
  },
  policy: {
    color: '#a855f7',
    bgColor: '#faf5ff',
    borderColor: '#c084fc',
    label: 'Policy',
    icon: '⚙',
    shortcut: 'P',
    description: '由 Event 触发的反应逻辑（"当…时，则…"）',
  },
  external: {
    color: '#ec4899',
    bgColor: '#fdf2f8',
    borderColor: '#f472b6',
    label: 'External System',
    icon: '🌐',
    shortcut: 'X',
    description: '系统边界外的依赖',
  },
  hotspot: {
    color: '#991b1b',
    bgColor: '#fef2f2',
    borderColor: '#dc2626',
    label: 'Hot Spot',
    icon: '❗',
    shortcut: 'H',
    description: '冲突、问题或风险点',
  },
};
