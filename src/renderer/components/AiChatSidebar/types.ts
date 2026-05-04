export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatStatus = 'idle' | 'thinking' | 'streaming' | 'error';

export interface ChatStep {
  id: string;
  label: string;
  detail?: string;
  state: 'pending' | 'running' | 'done' | 'failed';
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  steps?: ChatStep[];
  error?: string;
}
