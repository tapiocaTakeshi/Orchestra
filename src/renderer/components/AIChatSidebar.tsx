import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './AIChatSidebar.module.css';
import { useAIChat } from './aiChat/useAIChat';
import type { ChatMessage, ChatStatus } from './aiChat/types';

const SUGGESTIONS = [
  { label: '要約する', prompt: '次の文章を3行で要約してください：\n' },
  { label: 'コードを書く', prompt: 'TypeScript で次の処理を書いてください：' },
  { label: 'アイデア出し', prompt: '次のテーマでアイデアを5つ提案して：' },
  { label: '翻訳する', prompt: '次の文を自然な日本語に翻訳して：' },
];

interface Props {
  /** サイドバーを開閉する必要がある場合に外部から制御 */
  open?: boolean;
  onClose?: () => void;
  className?: string;
}

export const AIChatSidebar: React.FC<Props> = ({ open = true, onClose, className }) => {
  const {
    sessions,
    active,
    status,
    error,
    send,
    stop,
    createSession,
    selectSession,
    deleteSession,
  } = useAIChat();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // textarea 自動リサイズ
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  // 末尾までスクロール
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [active.messages, status]);

  if (!open) return null;

  const handleSend = () => {
    if (!input.trim()) return;
    send(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const isBusy = status === 'thinking' || status === 'streaming';

  return (
    <aside className={[styles.sidebar, className].filter(Boolean).join(' ')} aria-label="AI チャット">
      {/* ── ヘッダー ───────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo} aria-hidden>✦</span>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>AI チャット</h2>
            <StatusBadge status={status} />
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            onClick={() => setHistoryOpen((v) => !v)}
            aria-label="履歴"
            title="履歴"
          >
            <IconHistory />
          </button>
          <button
            className={styles.iconBtn}
            onClick={createSession}
            aria-label="新しい会話"
            title="新しい会話"
          >
            <IconPlus />
          </button>
          {onClose && (
            <button
              className={styles.iconBtn}
              onClick={onClose}
              aria-label="閉じる"
              title="閉じる"
            >
              <IconClose />
            </button>
          )}
        </div>
      </header>

      {/* ── 履歴ドロワー ─────────────── */}
      {historyOpen && (
        <div className={styles.history}>
          <div className={styles.historyHead}>
            <span>履歴</span>
            <button className={styles.linkBtn} onClick={createSession}>+ 新規</button>
          </div>
          <ul className={styles.historyList}>
            {sessions.map((s) => (
              <li
                key={s.id}
                className={[
                  styles.historyItem,
                  s.id === active.id ? styles.historyItemActive : '',
                ].join(' ')}
              >
                <button
                  className={styles.historyMain}
                  onClick={() => {
                    selectSession(s.id);
                    setHistoryOpen(false);
                  }}
                >
                  <span className={styles.historyTitle}>{s.title || '無題'}</span>
                  <span className={styles.historyMeta}>
                    {s.messages.length} 件
                  </span>
                </button>
                <button
                  className={styles.historyDel}
                  onClick={() => deleteSession(s.id)}
                  aria-label="削除"
                  title="削除"
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── メッセージ一覧 ───────────── */}
      <div className={styles.messages} ref={listRef}>
        {active.messages.length === 0 ? (
          <EmptyState
            onPick={(p) => {
              setInput(p);
              setTimeout(() => taRef.current?.focus(), 0);
            }}
          />
        ) : (
          <>
            {active.messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
            {status === 'thinking' && <ThinkingRow />}
          </>
        )}
      </div>

      {/* ── エラー表示 ───────────────── */}
      {error && (
        <div className={styles.errorBar} role="alert">
          <IconAlert />
          <span>{error}</span>
        </div>
      )}

      {/* ── 入力欄 ────────────────────── */}
      <div className={styles.composer}>
        <div className={styles.composerInner}>
          <textarea
            ref={taRef}
            className={styles.textarea}
            placeholder={isBusy ? 'AI が応答中…' : 'メッセージを入力（Enter で送信 / Shift+Enter で改行）'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isBusy}
          />
          <div className={styles.composerActions}>
            <span className={styles.hint}>
              {input.length > 0 ? `${input.length} 字` : ''}
            </span>
            {isBusy ? (
              <button
                className={`${styles.primaryBtn} ${styles.stopBtn}`}
                onClick={stop}
                aria-label="停止"
              >
                <IconStop />
                <span>停止</span>
              </button>
            ) : (
              <button
                className={styles.primaryBtn}
                onClick={handleSend}
                disabled={!input.trim()}
                aria-label="送信"
              >
                <span>送信</span>
                <IconSend />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

/* ─────────────────────────────────────
 *  Sub components
 * ───────────────────────────────────── */

const StatusBadge: React.FC<{ status: ChatStatus }> = ({ status }) => {
  const map: Record<ChatStatus, { dot: string; label: string }> = {
    idle: { dot: styles.dotIdle, label: '待機中' },
    thinking: { dot: styles.dotBusy, label: '考え中…' },
    streaming: { dot: styles.dotBusy, label: '応答中…' },
    error: { dot: styles.dotError, label: 'エラー' },
  };
  const v = map[status];
  return (
    <span className={styles.badge}>
      <span className={`${styles.dot} ${v.dot}`} />
      {v.label}
    </span>
  );
};

const EmptyState: React.FC<{ onPick: (prompt: string) => void }> = ({ onPick }) => (
  <div className={styles.empty}>
    <div className={styles.emptyIcon} aria-hidden>✦</div>
    <h3 className={styles.emptyTitle}>何でも聞いてください</h3>
    <p className={styles.emptyDesc}>
      要約・翻訳・コード生成・アイデア出しなど。<br />
      下の候補から始めるか、自由に入力できます。
    </p>
    <div className={styles.suggestions}>
      {SUGGESTIONS.map((s) => (
        <button
          key={s.label}
          className={styles.suggestion}
          onClick={() => onPick(s.prompt)}
        >
          {s.label}
        </button>
      ))}
    </div>
    <ol className={styles.flow}>
      <li><span>1</span>質問を入力</li>
      <li><span>2</span>AI が考える</li>
      <li><span>3</span>回答を受け取る</li>
    </ol>
  </div>
);

const MessageRow: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : styles.rowAssistant}`}>
      <div className={styles.avatar} aria-hidden>
        {isUser ? 'You' : 'AI'}
      </div>
      <div className={styles.bubbleWrap}>
        <div className={styles.roleLabel}>
          {isUser ? 'あなた' : 'アシスタント'}
        </div>
        <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}>
          {message.content || (message.pending ? <Caret /> : null)}
          {message.pending && message.content && <Caret inline />}
        </div>
        {message.error && (
          <div className={styles.msgError}>
            <IconAlert /> {message.error}
          </div>
        )}
      </div>
    </div>
  );
};

const ThinkingRow: React.FC = () => (
  <div className={`${styles.row} ${styles.rowAssistant}`}>
    <div className={styles.avatar} aria-hidden>AI</div>
    <div className={styles.bubbleWrap}>
      <div className={styles.roleLabel}>アシスタント</div>
      <div className={`${styles.bubble} ${styles.bubbleAssistant} ${styles.thinking}`}>
        <span className={styles.tdot} />
        <span className={styles.tdot} />
        <span className={styles.tdot} />
      </div>
    </div>
  </div>
);

const Caret: React.FC<{ inline?: boolean }> = ({ inline }) => (
  <span className={`${styles.caret} ${inline ? styles.caretInline : ''}`} aria-hidden />
);

/* ─────────────────────────────────────
 *  Icons (inline SVG, currentColor)
 * ───────────────────────────────────── */

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconHistory = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IconStop = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);
const IconAlert = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
  </svg>
);

export default AIChatSidebar;
