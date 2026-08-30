import type { EsCanvasState, EsNode, EsEdge, ElementType } from './types';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter++;
  return `${prefix}_${idCounter}`;
}

export function parseCML(cml: string): EsCanvasState {
  idCounter = 0;
  const lines = cml.split('\n');
  const nodes: EsNode[] = [];
  const edges: EsEdge[] = [];
  const identifierMap = new Map<string, string>(); // CML identifier -> node id

  let xPos = 100;
  let yPos = 100;
  let currentAggregateId: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === '' || line.startsWith('/*') || line.startsWith('//')) continue;

    // Aggregate block start
    const aggMatch = line.match(/^Aggregate\s+(\w+)\s*\{/);
    if (aggMatch) {
      const id = nextId('agg');
      const node: EsNode = {
        id,
        type: 'aggregate',
        position: { x: xPos, y: yPos },
        data: { label: fromIdentifier(aggMatch[1]), type: 'aggregate' },
      };
      nodes.push(node);
      currentAggregateId = id;
      xPos += 300;
      continue;
    }

    // Block end
    if (line === '}') {
      currentAggregateId = null;
      yPos += 120;
      xPos = 100;
      continue;
    }

    // Flow block
    const flowMatch = line.match(/^Flow\s*\{/);
    if (flowMatch) {
      continue;
    }

    // Flow edge: A -> B
    const edgeMatch = line.match(/^(\w+)\s*->\s*(\w+)$/);
    if (edgeMatch) {
      const sourceId = identifierMap.get(edgeMatch[1]);
      const targetId = identifierMap.get(edgeMatch[2]);
      if (sourceId && targetId) {
        edges.push({
          id: nextId('edge'),
          source: sourceId,
          target: targetId,
        });
      }
      continue;
    }

    // DomainEvent
    const eventMatch = line.match(/^DomainEvent\s+(\w+)/);
    if (eventMatch) {
      const id = nextId('event');
      identifierMap.set(eventMatch[1], id);
      nodes.push({
        id,
        type: 'event',
        position: { x: xPos, y: yPos },
        data: { label: fromIdentifier(eventMatch[1]), type: 'event', aggregateId: currentAggregateId },
      });
      xPos += 200;
      continue;
    }

    // Command
    const cmdMatch = line.match(/^Command\s+(\w+)/);
    if (cmdMatch) {
      const id = nextId('cmd');
      identifierMap.set(cmdMatch[1], id);
      nodes.push({
        id,
        type: 'command',
        position: { x: xPos, y: yPos },
        data: { label: fromIdentifier(cmdMatch[1]), type: 'command', aggregateId: currentAggregateId },
      });
      xPos += 200;
      continue;
    }
  }

  return { nodes, edges };
}

function fromIdentifier(id: string): string {
  return id.replace(/_/g, ' ');
}

// Re-export for use in App
export function createNode(type: ElementType, position: { x: number; y: number }, label?: string): EsNode {
  const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const defaultLabels: Record<ElementType, string> = {
    event: 'New Event',
    command: 'New Command',
    aggregate: 'New Aggregate',
    actor: 'New Actor',
    policy: 'New Policy',
    external: 'New External System',
  };
  return {
    id,
    type,
    position,
    data: { label: label || defaultLabels[type], type },
  };
}
