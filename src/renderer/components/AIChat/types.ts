export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** 生成中かどうか（ストリーミング表示用） */
  pending?: boolean;
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

export type ChatStatus = 'idle' | 'thinking' | 'streaming' | 'error';

export interface SendOptions {
  content: string;
}
