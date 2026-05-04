export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

/** AI 応答のフロー段階 */
export type ChatPhase = 'idle' | 'sending' | 'thinking' | 'done';
