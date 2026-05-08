export type NodeType = 'start' | 'end' | 'task' | 'decision' | 'parallel' | 'merge';

export interface Position {
  x: number;
  y: number;
}

export interface Node {
  id: string;
  type: NodeType;
  label: string;
  position: Position;
  config?: Record<string, unknown>;
  metadata?: {
    description?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
  metadata?: {
    [key: string]: unknown;
  };
}

export interface FlowDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  nodes: Node[];
  edges: Edge[];
  metadata?: {
    created?: string;
    modified?: string;
    author?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  nodeId?: string;
  edgeId?: string;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ExecutionTrace {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: number;
  endTime?: number;
  result?: unknown;
  error?: string;
}

export interface FlowExecution {
  id: string;
  flowId: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
  traces: ExecutionTrace[];
}
