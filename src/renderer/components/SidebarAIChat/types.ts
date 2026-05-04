export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export type ChatPhase = 'idle' | 'composing' | 'thinking' | 'done';
