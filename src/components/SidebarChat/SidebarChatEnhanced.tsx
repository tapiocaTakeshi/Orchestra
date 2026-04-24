import React, { useCallback, useState } from 'react';
import ChatInput, { AttachedContext } from './ChatInput';
import MessageList, { ChatMessage } from './MessageList';

export interface SidebarChatEnhancedProps {
  initialMessages?: ChatMessage[];
  onSend: (text: string, context: AttachedContext[]) => Promise<void> | void;
  /** 外部から与える送信ブロック理由（indexing 中など） */
  externalDisableReason?: string | null;
  attachedContext?: AttachedContext[];
  onRemoveContext?: (id: string) => void;
}

/**
 * Phase 1 改善を統合したラッパ。
 * 既存 SidebarChat を壊さず、新規画面や差し替え先で利用する想定。
 */
export const SidebarChatEnhanced: React.FC<SidebarChatEnhancedProps> = ({
  initialMessages = [],
  onSend,
  externalDisableReason = null,
  attachedContext = [],
  onRemoveContext,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isSending, setIsSending] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (text: string, context: AttachedContext[]) => {
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);
      try {
        await onSend(text, context);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'error',
            content:
              err instanceof Error
                ? `送信に失敗しました: ${err.message}`
                : '送信に失敗しました。',
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [onSend],
  );

  return (
    <div
      className="sbc-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--void-bg-main, #181818)',
        color: 'var(--void-fg-1, #ccc)',
        fontFamily:
          'var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
        fontSize: 13,
      }}
    >
      <MessageList
        messages={messages}
        focusedId={focusedId}
        onFocusMessage={setFocusedId}
      />
      <ChatInput
        onSubmit={handleSubmit}
        isSending={isSending}
        externalDisableReason={externalDisableReason}
        context={attachedContext}
        onRemoveContext={onRemoveContext}
      />
    </div>
  );
};

export default SidebarChatEnhanced;
