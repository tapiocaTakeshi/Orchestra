import React, { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import { EmptyState } from './EmptyState';
import { StatusIndicator } from './StatusIndicator';
import { useChat } from './useChat';
import './chat.css';

export interface ChatSidebarProps {
  /** タイトル（既定: AI Assistant） */
  title?: string;
  /** 折りたたみ時に閉じるハンドラ（既存サイドバーと連携する場合に使用） */
  onClose?: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  title = 'AI Assistant',
  onClose,
}) => {
  const {
    messages,
    status,
    error,
    send,
    regenerate,
    clear,
  } = useChat();

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 新着メッセージで一番下へスクロール
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  const isEmpty = messages.length === 0;

  return (
    <aside className="chat-sidebar" aria-label="AI Chat">
      <header className="chat-sidebar__header">
        <div className="chat-sidebar__title-group">
          <span className="chat-sidebar__logo" aria-hidden>
            {/* Minimal: 線画のスパークアイコン */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <h2 className="chat-sidebar__title">{title}</h2>
        </div>
        <div className="chat-sidebar__header-actions">
          <StatusIndicator status={status} />
          <button
            type="button"
            className="chat-sidebar__icon-btn"
            onClick={clear}
            aria-label="会話をクリア"
            title="会話をクリア"
            disabled={isEmpty || status === 'thinking'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {onClose && (
            <button
              type="button"
              className="chat-sidebar__icon-btn"
              onClick={onClose}
              aria-label="サイドバーを閉じる"
              title="閉じる"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M6 18L18 6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="chat-sidebar__messages" ref={scrollRef}>
        {isEmpty ? (
          <EmptyState onPick={(prompt) => send(prompt)} />
        ) : (
          <ul className="chat-sidebar__list" role="log" aria-live="polite">
            {messages.map((m) => (
              <li key={m.id} className={`chat-sidebar__item chat-sidebar__item--${m.role}`}>
                <MessageBubble
                  message={m}
                  onRegenerate={m.role === 'assistant' ? () => regenerate(m.id) : undefined}
                />
              </li>
            ))}
            {status === 'thinking' && (
              <li className="chat-sidebar__item chat-sidebar__item--assistant">
                <div className="chat-bubble chat-bubble--assistant chat-bubble--typing" aria-label="AI が応答を生成中">
                  <span className="chat-typing">
                    <i /><i /><i />
                  </span>
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      {error && (
        <div role="alert" className="chat-sidebar__error">
          {error}
        </div>
      )}

      <ChatComposer
        disabled={status === 'thinking'}
        onSubmit={(text) => send(text)}
      />
    </aside>
  );
};

export default ChatSidebar;
