import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './AIChatSidebar.module.css';
import { MessageBubble } from './parts/MessageBubble';
import { EmptyState } from './parts/EmptyState';
import { Composer } from './parts/Composer';
import { TypingIndicator } from './parts/TypingIndicator';
import { IconSparkle, IconPlus, IconHistory } from './parts/icons';

// 既存 useChat フックの I/F を踏襲。プロジェクトのパスに合わせて調整可。
import { useChat } from '../../hooks/useChat';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
}

export interface AIChatSidebarProps {
  className?: string;
  /** タイトル（デフォルト: "AI Chat"） */
  title?: string;
  /** 新規会話開始ハンドラ（任意） */
  onNewChat?: () => void;
  /** 履歴を開くハンドラ（任意） */
  onOpenHistory?: () => void;
}

const SUGGESTIONS: string[] = [
  '選択中のコードをレビューして',
  'このファイルの要約を教えて',
  'TODO を一覧化して',
];

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
  className,
  title = 'AI Chat',
  onNewChat,
  onOpenHistory,
}) => {
  const {
    messages,
    input,
    setInput,
    send,
    stop,
    isStreaming,
  } = useChat();

  const listRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // 自動スクロール（末尾追随）
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  // ヘッダ影制御
  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setScrolled(el.scrollTop > 4);
  };

  const handleSubmit = (text: string) => {
    const value = text.trim();
    if (!value || isStreaming) return;
    send(value);
    setInput('');
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    handleSubmit(text);
  };

  const showEmpty = useMemo(
    () => messages.filter((m) => m.role !== 'system').length === 0,
    [messages],
  );

  return (
    <aside
      className={[styles.sidebar, className].filter(Boolean).join(' ')}
      aria-label="AI チャット"
    >
      <header className={[styles.header, scrolled ? styles.headerScrolled : ''].join(' ')}>
        <div className={styles.headerTitle}>
          <span className={styles.headerIcon} aria-hidden>
            <IconSparkle />
          </span>
          <h2 className={styles.title}>{title}</h2>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onNewChat}
            title="新しい会話"
            aria-label="新しい会話"
          >
            <IconPlus />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onOpenHistory}
            title="履歴"
            aria-label="履歴"
          >
            <IconHistory />
          </button>
        </div>
      </header>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className={styles.messageList}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {showEmpty ? (
          <EmptyState
            suggestions={SUGGESTIONS}
            onPick={handleSuggestion}
          />
        ) : (
          <ol className={styles.thread}>
            {messages
              .filter((m) => m.role !== 'system')
              .map((m) => (
                <li key={m.id} className={styles.threadItem}>
                  <MessageBubble role={m.role} content={m.content} />
                </li>
              ))}
            {isStreaming && (
              <li className={styles.threadItem}>
                <TypingIndicator />
              </li>
            )}
          </ol>
        )}
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onStop={stop}
        isStreaming={isStreaming}
      />
    </aside>
  );
};

export default AIChatSidebar;
