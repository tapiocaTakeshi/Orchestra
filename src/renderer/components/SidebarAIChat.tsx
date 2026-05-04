import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import styles from './SidebarAIChat.module.css';
import type { ChatMessage, ChatRole } from './SidebarAIChat/types';
import { useChatFlow } from './SidebarAIChat/useChatFlow';

export interface SidebarAIChatProps {
  /** 任意。送信時のハンドラ。未指定ならダミー応答を返します。 */
  onSend?: (text: string, history: ChatMessage[]) => Promise<string> | string;
  /** 初期メッセージ（任意） */
  initialMessages?: ChatMessage[];
  /** タイトル */
  title?: string;
  /** 提案プロンプト（空状態で表示） */
  suggestions?: string[];
  className?: string;
}

const DEFAULT_SUGGESTIONS = [
  '選択中のコードを要約して',
  'このファイルにテストを追加して',
  'バグの原因を一緒に探して',
  'リファクタの案を3つ出して',
];

const uid = () => Math.random().toString(36).slice(2, 10);

export const SidebarAIChat: React.FC<SidebarAIChatProps> = ({
  onSend,
  initialMessages = [],
  title = 'AI Assistant',
  suggestions = DEFAULT_SUGGESTIONS,
  className,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const { phase, setPhase } = useChatFlow();
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEmpty = messages.length === 0;
  const canSend = input.trim().length > 0 && phase !== 'thinking';

  // 自動スクロール
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, phase]);

  // textarea auto resize
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [input]);

  // ショートカット: Cmd/Ctrl + K で新規チャット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushMessage = (role: ChatRole, content: string): ChatMessage => {
    const msg: ChatMessage = {
      id: uid(),
      role,
      content,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || phase === 'thinking') return;

      pushMessage('user', text);
      setInput('');
      setPhase('thinking');

      try {
        const reply = onSend
          ? await onSend(text, messages)
          : await fakeReply(text);
        pushMessage('assistant', reply);
        setPhase('done');
      } catch (err) {
        pushMessage(
          'assistant',
          `⚠️ エラーが発生しました: ${(err as Error).message ?? 'unknown'}`,
        );
        setPhase('done');
      }
    },
    [input, messages, onSend, phase, setPhase],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
    setPhase('idle');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      /* noop */
    }
  };

  const handleRegenerate = async () => {
    // 直近の user メッセージを再送
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    // 直近の assistant を消す
    setMessages((prev) => {
      const idx = prev.map((m) => m.role).lastIndexOf('assistant');
      if (idx < 0) return prev;
      return prev.slice(0, idx);
    });
    await handleSend(lastUser.content);
  };

  const phaseLabel = useMemo(() => {
    switch (phase) {
      case 'idle':
        return 'Ready';
      case 'composing':
        return 'Composing';
      case 'thinking':
        return 'Thinking…';
      case 'done':
        return 'Idle';
      default:
        return '';
    }
  }, [phase]);

  return (
    <aside
      className={[styles.root, className].filter(Boolean).join(' ')}
      aria-label="AI Chat Sidebar"
    >
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.dot} data-phase={phase} aria-hidden />
          <h2 className={styles.title}>{title}</h2>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.phase} aria-live="polite">
            {phaseLabel}
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handleNewChat}
            title="新規チャット (⌘/Ctrl+K)"
            aria-label="新規チャット"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </header>

      {/* Body */}
      <div
        ref={listRef}
        className={styles.list}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {isEmpty ? (
          <EmptyState
            suggestions={suggestions}
            onPick={(s) => {
              setInput(s);
              setPhase('composing');
              requestAnimationFrame(() => textareaRef.current?.focus());
            }}
          />
        ) : (
          <>
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDivider =
                !!prev && new Date(prev.createdAt).getMinutes() !== new Date(m.createdAt).getMinutes() && i % 4 === 0;
              return (
                <React.Fragment key={m.id}>
                  {showDivider && <div className={styles.divider} aria-hidden />}
                  <MessageBubble
                    message={m}
                    onCopy={() => handleCopy(m.content)}
                  />
                </React.Fragment>
              );
            })}
            {phase === 'thinking' && <ThinkingIndicator />}
            {phase === 'done' && messages[messages.length - 1]?.role === 'assistant' && (
              <div className={styles.afterActions}>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={handleRegenerate}
                >
                  ↻ 再生成
                </button>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() =>
                    handleCopy(messages[messages.length - 1].content)
                  }
                >
                  ⧉ コピー
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Composer */}
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) handleSend();
        }}
      >
        <div
          className={styles.composerInner}
          data-active={phase === 'composing'}
        >
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder="メッセージを入力…  (Enter で送信 / Shift+Enter で改行)"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setPhase(e.target.value ? 'composing' : 'idle');
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="メッセージ入力"
          />
          <div className={styles.composerFooter}>
            <span className={styles.hint}>
              {phase === 'thinking' ? '応答を生成中…' : `${input.length} / 4000`}
            </span>
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={!canSend}
              aria-label="送信"
            >
              {phase === 'thinking' ? (
                <span className={styles.spinner} aria-hidden />
              ) : (
                <>
                  送信
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
};

/* ---------- Sub components ---------- */

const EmptyState: React.FC<{
  suggestions: string[];
  onPick: (s: string) => void;
}> = ({ suggestions, onPick }) => (
  <div className={styles.empty}>
    <div className={styles.emptyBadge}>AI</div>
    <h3 className={styles.emptyTitle}>何から始めますか？</h3>
    <p className={styles.emptyDesc}>
      下のサジェストから選ぶか、自由に質問を入力してください。
    </p>
    <ul className={styles.suggestList}>
      {suggestions.map((s) => (
        <li key={s}>
          <button
            type="button"
            className={styles.suggestBtn}
            onClick={() => onPick(s)}
          >
            <span className={styles.suggestArrow} aria-hidden>›</span>
            {s}
          </button>
        </li>
      ))}
    </ul>
  </div>
);

const MessageBubble: React.FC<{
  message: ChatMessage;
  onCopy: () => void;
}> = ({ message, onCopy }) => {
  const isUser = message.role === 'user';
  return (
    <div
      className={[styles.row, isUser ? styles.rowUser : styles.rowAssistant].join(' ')}
    >
      <div className={styles.meta}>
        <span className={styles.role}>{isUser ? 'You' : 'Assistant'}</span>
        <span className={styles.time}>
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <div className={styles.bubble}>
        {message.content.split('\n').map((line, i) => (
          <p key={i} className={styles.line}>
            {line || '\u00A0'}
          </p>
        ))}
      </div>
      {!isUser && (
        <button
          type="button"
          className={styles.copyBtn}
          onClick={onCopy}
          aria-label="コピー"
          title="コピー"
        >
          ⧉
        </button>
      )}
    </div>
  );
};

const ThinkingIndicator: React.FC = () => (
  <div className={[styles.row, styles.rowAssistant].join(' ')}>
    <div className={styles.meta}>
      <span className={styles.role}>Assistant</span>
      <span className={styles.time}>…</span>
    </div>
    <div className={[styles.bubble, styles.bubbleThinking].join(' ')}>
      <span className={styles.typingDot} />
      <span className={styles.typingDot} />
      <span className={styles.typingDot} />
    </div>
  </div>
);

/* ---------- Helpers ---------- */

async function fakeReply(text: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 700));
  return `（デモ応答）「${text}」について確認しました。実際の応答は onSend を実装すると返せます。`;
}

export default SidebarAIChat;
