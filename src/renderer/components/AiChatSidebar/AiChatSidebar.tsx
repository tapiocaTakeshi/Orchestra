import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  User,
  Send,
  Square,
  RotateCcw,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import styles from './AiChatSidebar.module.css';
import { useAiChat } from './useAiChat';
import type { ChatMessage, ChatStatus } from './types';

export interface AiChatSidebarProps {
  title?: string;
  placeholder?: string;
  className?: string;
}

const statusLabel: Record<ChatStatus, string> = {
  idle: '待機中',
  thinking: '考えています',
  streaming: '回答中',
  error: 'エラー',
};

export const AiChatSidebar: React.FC<AiChatSidebarProps> = ({
  title = 'AI アシスタント',
  placeholder = 'メッセージを入力…  (⌘/Ctrl + Enter で送信)',
  className,
}) => {
  const { messages, status, error, send, cancel, regenerate, clear } =
    useAiChat();
  const [input, setInput] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 自動高さ
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  // 自動スクロール
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const busy = status === 'thinking' || status === 'streaming';

  const handleSend = () => {
    if (busy || !input.trim()) return;
    void send(input);
    setInput('');
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <aside
      className={[styles.root, className].filter(Boolean).join(' ')}
      aria-label="AI チャット"
    >
      {/* ヘッダ */}
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <Sparkles size={14} className={styles.titleIcon} aria-hidden />
          <h2 className={styles.title}>{title}</h2>
        </div>
        <div className={styles.headerRight}>
          <StatusBadge status={status} />
          <button
            type="button"
            className={styles.iconBtn}
            onClick={clear}
            disabled={messages.length === 0 || busy}
            title="会話をクリア"
            aria-label="会話をクリア"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>

      {/* メッセージ */}
      <div
        ref={listRef}
        className={styles.list}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <ol className={styles.timeline}>
            {messages.map((m) => (
              <MessageItem key={m.id} message={m} />
            ))}
            {status === 'thinking' && <ThinkingItem />}
          </ol>
        )}

        {error && (
          <div className={styles.errorBox} role="alert">
            <AlertTriangle size={14} aria-hidden />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* フッタ操作 */}
      {messages.some((m) => m.role === 'assistant' && m.content) && !busy && (
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={regenerate}
            title="最後の回答を再生成"
          >
            <RotateCcw size={13} />
            <span>再生成</span>
          </button>
        </div>
      )}

      {/* 入力 */}
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <textarea
          ref={taRef}
          className={styles.textarea}
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={status === 'error' && !input}
        />
        <div className={styles.composerBar}>
          <span className={styles.hint}>
            {busy ? '応答を待っています…' : '⌘/Ctrl + Enter で送信'}
          </span>
          {busy ? (
            <button
              type="button"
              onClick={cancel}
              className={styles.stopBtn}
              title="停止"
              aria-label="停止"
            >
              <Square size={12} />
              <span>停止</span>
            </button>
          ) : (
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={!input.trim()}
              title="送信"
              aria-label="送信"
            >
              <Send size={12} />
              <span>送信</span>
            </button>
          )}
        </div>
      </form>
    </aside>
  );
};

/* ---------- sub components ---------- */

const StatusBadge: React.FC<{ status: ChatStatus }> = ({ status }) => {
  return (
    <span
      className={[styles.badge, styles[`badge_${status}`]].join(' ')}
      aria-live="polite"
    >
      <span className={styles.badgeDot} aria-hidden />
      {statusLabel[status]}
    </span>
  );
};

const EmptyState: React.FC = () => (
  <div className={styles.empty}>
    <Sparkles size={18} className={styles.emptyIcon} aria-hidden />
    <p className={styles.emptyTitle}>何でも聞いてください</p>
    <p className={styles.emptySub}>
      コードの説明、リファクタ案、要約など。
      <br />
      下の入力欄から始めましょう。
    </p>
    <ul className={styles.suggestions}>
      <li>このファイルを要約して</li>
      <li>関数を TypeScript に書き換えて</li>
      <li>テストケースを提案して</li>
    </ul>
  </div>
);

const ThinkingItem: React.FC = () => (
  <li className={[styles.item, styles.itemAssistant].join(' ')}>
    <span className={styles.avatar} aria-hidden>
      <Sparkles size={12} />
    </span>
    <div className={styles.bubble}>
      <span className={styles.thinkingDots} aria-label="考え中">
        <i />
        <i />
        <i />
      </span>
    </div>
  </li>
);

const MessageItem: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };

  const time = useMemo(
    () =>
      new Date(message.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [message.createdAt],
  );

  return (
    <li
      className={[
        styles.item,
        isUser ? styles.itemUser : styles.itemAssistant,
      ].join(' ')}
    >
      <span className={styles.avatar} aria-hidden>
        {isUser ? <User size={12} /> : <Sparkles size={12} />}
      </span>

      <div className={styles.itemBody}>
        <div className={styles.metaRow}>
          <span className={styles.role}>{isUser ? 'あなた' : 'AI'}</span>
          <span className={styles.time}>{time}</span>
        </div>

        {message.steps && message.steps.length > 0 && (
          <details className={styles.steps}>
            <summary>
              手順 {message.steps.filter((s) => s.state === 'done').length}/
              {message.steps.length}
            </summary>
            <ol>
              {message.steps.map((s) => (
                <li key={s.id} data-state={s.state}>
                  <span className={styles.stepDot} aria-hidden />
                  <span className={styles.stepLabel}>{s.label}</span>
                  {s.detail && (
                    <span className={styles.stepDetail}>{s.detail}</span>
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}

        <div className={styles.bubble}>
          {message.content || (
            <span className={styles.placeholder}>…</span>
          )}
        </div>

        {!isUser && message.content && (
          <div className={styles.msgActions}>
            <button
              type="button"
              className={styles.tinyBtn}
              onClick={onCopy}
              title="コピー"
              aria-label="コピー"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? 'コピー済' : 'コピー'}</span>
            </button>
          </div>
        )}
      </div>
    </li>
  );
};

export default AiChatSidebar;
