import { FlowDefinition, Node, Edge } from '../types/flow';

export class FlowParser {
  static parseJSON(jsonString: string): FlowDefinition {
    try {
      const parsed = JSON.parse(jsonString);
      return FlowParser.validateStructure(parsed);
    } catch (error) {
      throw new Error(`Failed to parse flow JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static toJSON(flow: FlowDefinition): string {
    return JSON.stringify(flow, null, 2);
  }

  private static validateStructure(obj: unknown): FlowDefinition {
    if (typeof obj !== 'object' || obj === null) {
      throw new Error('Flow definition must be an object');
    }

    const flow = obj as Record<string, unknown>;

    if (typeof flow.id !== 'string') {
      throw new Error('Flow must have an id (string)');
    }
    if (typeof flow.name !== 'string') {
      throw new Error('Flow must have a name (string)');
    }
    if (typeof flow.version !== 'string') {
      throw new Error('Flow must have a version (string)');
    }
    if (!Array.isArray(flow.nodes)) {
      throw new Error('Flow must have nodes (array)');
    }
    if (!Array.isArray(flow.edges)) {
      throw new Error('Flow must have edges (array)');
    }

    return {
      id: flow.id,
      name: flow.name,
      version: flow.version,
      description: typeof flow.description === 'string' ? flow.description : undefined,
      nodes: (flow.nodes as Node[]).map(FlowParser.validateNode),
      edges: (flow.edges as Edge[]).map(FlowParser.validateEdge),
      metadata: typeof flow.metadata === 'object' && flow.metadata !== null ? flow.metadata as Record<string, unknown> : undefined,
    };
  }

  private static validateNode(node: unknown): Node {
    if (typeof node !== 'object' || node === null) {
      throw new Error('Node must be an object');
    }

    const n = node as Record<string, unknown>;

    if (typeof n.id !== 'string') {
      throw new Error('Node must have an id');
    }
    if (typeof n.type !== 'string' || !['start', 'end', 'task', 'decision', 'parallel', 'merge'].includes(n.type)) {
      throw new Error(`Node type must be one of: start, end, task, decision, parallel, merge`);
    }
    if (typeof n.label !== 'string') {
      throw new Error('Node must have a label');
    }
    if (typeof n.position !== 'object' || n.position === null) {
      throw new Error('Node must have a position');
    }

    const pos = n.position as Record<string, unknown>;
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number') {
      throw new Error('Position must have x and y coordinates');
    }

    return {
      id: n.id,
      type: n.type as any,
      label: n.label,
      position: { x: pos.x, y: pos.y },
      config: typeof n.config === 'object' && n.config !== null ? n.config as Record<string, unknown> : undefined,
      metadata: typeof n.metadata === 'object' && n.metadata !== null ? n.metadata as Record<string, unknown> : undefined,
    };
  }

  private static validateEdge(edge: unknown): Edge {
    if (typeof edge !== 'object' || edge === null) {
      throw new Error('Edge must be an object');
    }

    const e = edge as Record<string, unknown>;

    if (typeof e.id !== 'string') {
      throw new Error('Edge must have an id');
    }
    if (typeof e.source !== 'string') {
      throw new Error('Edge must have a source node id');
    }
    if (typeof e.target !== 'string') {
      throw new Error('Edge must have a target node id');
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
      condition: typeof e.condition === 'string' ? e.condition : undefined,
      metadata: typeof e.metadata === 'object' && e.metadata !== null ? e.metadata as Record<string, unknown> : undefined,
    };
  }
}
