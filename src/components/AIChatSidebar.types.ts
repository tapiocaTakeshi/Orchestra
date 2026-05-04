export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
  pending?: boolean;
}

export interface AIChatSidebarProps {
  /** Whether the sidebar is visible (controlled). */
  visible: boolean;
  /** Called when the user dismisses the sidebar. */
  onClose: () => void;
  /** Current chat history. */
  messages?: ChatMessage[];
  /** Called when the user sends a new message. */
  onSend?: (text: string) => void | Promise<void>;
  /** Optional title shown in the header. */
  title?: string;
  /** Optional subtitle (e.g. model name). */
  subtitle?: string;
  /** Quick prompt suggestions shown when the conversation is empty. */
  suggestions?: string[];
  /** Whether the assistant is currently generating a response. */
  isLoading?: boolean;
  /** Sidebar width in px. Defaults to 86% of screen width. */
  width?: number;
}
