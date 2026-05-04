export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatStatus = 'idle' | 'thinking' | 'streaming' | 'error';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
}
