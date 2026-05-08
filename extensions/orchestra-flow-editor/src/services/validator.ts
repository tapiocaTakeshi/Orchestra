import { FlowDefinition, ValidationError, ValidationResult } from '../types/flow';

export class FlowValidator {
  static validate(flow: FlowDefinition): ValidationResult {
    const errors: ValidationError[] = [];

    // Check for start and end nodes
    errors.push(...this.validateNodeTypes(flow));

    // Check for orphaned nodes
    errors.push(...this.validateConnectivity(flow));

    // Check for cycles
    errors.push(...this.validateNoCycles(flow));

    // Check node uniqueness
    errors.push(...this.validateUniqueNodes(flow));

    // Check edge references
    errors.push(...this.validateEdgeReferences(flow));

    // Check decision nodes have conditions
    errors.push(...this.validateDecisionConditions(flow));

    return {
      valid: errors.filter(e => e.type === 'error').length === 0,
      errors,
    };
  }

  private static validateNodeTypes(flow: FlowDefinition): ValidationError[] {
    const errors: ValidationError[] = [];
    const nodeTypes = new Set(flow.nodes.map(n => n.type));

    if (!nodeTypes.has('start')) {
      errors.push({
        type: 'error',
        message: 'Flow must have at least one start node',
      });
    }

    if (!nodeTypes.has('end')) {
      errors.push({
        type: 'error',
        message: 'Flow must have at least one end node',
      });
    }

    return errors;
  }

  private static validateConnectivity(flow: FlowDefinition): ValidationError[] {
    const errors: ValidationError[] = [];
    const nodeIds = new Set(flow.nodes.map(n => n.id));
    const inEdges = new Map<string, number>();
    const outEdges = new Map<string, number>();

    // Initialize edge counts
    flow.nodes.forEach(n => {
      inEdges.set(n.id, 0);
      outEdges.set(n.id, 0);
    });

    // Count edges
    flow.edges.forEach(e => {
      if (inEdges.has(e.target)) {
        inEdges.set(e.target, (inEdges.get(e.target) || 0) + 1);
      }
      if (outEdges.has(e.source)) {
        outEdges.set(e.source, (outEdges.get(e.source) || 0) + 1);
      }
    });

    // Check connectivity rules
    flow.nodes.forEach(node => {
      if (node.type === 'start') {
        if ((outEdges.get(node.id) || 0) === 0) {
          errors.push({
            type: 'error',
            message: 'Start node must have an outgoing edge',
            nodeId: node.id,
          });
        }
        if ((inEdges.get(node.id) || 0) > 0) {
          errors.push({
            type: 'error',
            message: 'Start node cannot have incoming edges',
            nodeId: node.id,
          });
        }
      } else if (node.type === 'end') {
        if ((inEdges.get(node.id) || 0) === 0) {
          errors.push({
            type: 'error',
            message: 'End node must have an incoming edge',
            nodeId: node.id,
          });
        }
        if ((outEdges.get(node.id) || 0) > 0) {
          errors.push({
            type: 'error',
            message: 'End node cannot have outgoing edges',
            nodeId: node.id,
          });
        }
      } else if (node.type !== 'parallel' && node.type !== 'merge') {
        if ((inEdges.get(node.id) || 0) === 0 && node.type !== 'start') {
          errors.push({
            type: 'warning',
            message: `Node "${node.label}" has no incoming edges`,
            nodeId: node.id,
          });
        }
        if ((outEdges.get(node.id) || 0) === 0 && node.type !== 'end') {
          errors.push({
            type: 'warning',
            message: `Node "${node.label}" has no outgoing edges`,
            nodeId: node.id,
          });
        }
      }
    });

    return errors;
  }

  private static validateNoCycles(flow: FlowDefinition): ValidationError[] {
    const errors: ValidationError[] = [];
    const adjList = new Map<string, string[]>();

    // Build adjacency list
    flow.nodes.forEach(n => adjList.set(n.id, []));
    flow.edges.forEach(e => {
      const sources = adjList.get(e.source) || [];
      sources.push(e.target);
      adjList.set(e.source, sources);
    });

    // DFS to detect cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleDFS = (nodeId: string, path: string[] = []): string[] | null => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const cyclePath = hasCycleDFS(neighbor, [...path]);
          if (cyclePath) return cyclePath;
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          return path.slice(cycleStart).concat(neighbor);
        }
      }

      recursionStack.delete(nodeId);
      return null;
    };

    for (const nodeId of flow.nodes.map(n => n.id)) {
      if (!visited.has(nodeId)) {
        const cycle = hasCycleDFS(nodeId);
        if (cycle) {
          errors.push({
            type: 'error',
            message: `Cycle detected: ${cycle.join(' -> ')}`,
          });
          break;
        }
      }
    }

    return errors;
  }

  private static validateUniqueNodes(flow: FlowDefinition): ValidationError[] {
    const errors: ValidationError[] = [];
    const nodeIds = new Set<string>();

    flow.nodes.forEach(node => {
      if (nodeIds.has(node.id)) {
        errors.push({
          type: 'error',
          message: `Duplicate node id: "${node.id}"`,
          nodeId: node.id,
        });
      }
      nodeIds.add(node.id);
    });

    return errors;
  }

  private static validateEdgeReferences(flow: FlowDefinition): ValidationError[] {
    const errors: ValidationError[] = [];
    const nodeIds = new Set(flow.nodes.map(n => n.id));
    const edgeIds = new Set<string>();

    flow.edges.forEach(edge => {
      if (edgeIds.has(edge.id)) {
        errors.push({
          type: 'error',
          message: `Duplicate edge id: "${edge.id}"`,
          edgeId: edge.id,
        });
      }
      edgeIds.add(edge.id);

      if (!nodeIds.has(edge.source)) {
        errors.push({
          type: 'error',
          message: `Edge references non-existent source node: "${edge.source}"`,
          edgeId: edge.id,
        });
      }

      if (!nodeIds.has(edge.target)) {
        errors.push({
          type: 'error',
          message: `Edge references non-existent target node: "${edge.target}"`,
          edgeId: edge.id,
        });
      }
    });

    return errors;
  }

  private static validateDecisionConditions(flow: FlowDefinition): ValidationError[] {
    const errors: ValidationError[] = [];

    flow.nodes.forEach(node => {
      if (node.type === 'decision') {
        const outgoingEdges = flow.edges.filter(e => e.source === node.id);
        if (outgoingEdges.length < 2) {
          errors.push({
            type: 'warning',
            message: 'Decision node should have at least 2 outgoing edges',
            nodeId: node.id,
          });
        }

        outgoingEdges.forEach(edge => {
          if (!edge.condition) {
            errors.push({
              type: 'warning',
              message: 'Decision edges should have conditions',
              edgeId: edge.id,
            });
          }
        });
      }
    });

    return errors;
  }
}
