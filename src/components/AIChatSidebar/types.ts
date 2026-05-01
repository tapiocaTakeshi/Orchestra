export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number; // epoch ms
}

export interface AIChatSidebarProps {
  /** Initial conversation; if omitted a small welcome message is shown. */
  initialMessages?: Message[];
  /**
   * Called when the user sends a message.
   * Should return the assistant reply (string or Promise<string>).
   * If omitted, a local echo reply is generated for preview purposes.
   */
  onSend?: (text: string) => Promise<string> | string;
  /** Optional title shown in the header. */
  title?: string;
  /** Whether the AI is currently considered online. */
  online?: boolean;
}
