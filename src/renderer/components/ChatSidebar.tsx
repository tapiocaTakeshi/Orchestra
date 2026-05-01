import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styles from './ChatSidebar.module.css';
import type { ChatMessage, ChatPhase } from './ChatSidebar.types';

type Props = {
  /** サイドバーのタイトル (デフォルト: "AI アシスタント") */
  title?: string;
  /** 初期メッセージ (空配列で開始可) */
  initialMessages?: ChatMessage[];
  /** 任意: 送信時のハンドラ。未指定なら window.electronAPI.chat を呼ぶ */
  onSend?: (input: string, history: ChatMessage[]) => Promise<string>;
  /** 任意: 折りたたみ制御 */
  collapsed?: boolean;
  onToggleCollapsed?: (next: boolean) => void;
};

const PHASES: { key: ChatPhase; label: string }[] = [
  { key: 'idle', label: '入力' },
  { key: 'sending', label: '送信' },
  { key: 'thinking', label: '思考中' },
  { key: 'done', label: '回答' },
];

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const ChatSidebar: React.FC<Props> = ({
  title = 'AI アシスタント',
  initialMessages = [],
  onSend,
  collapsed = false,
  onToggleCollapsed,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  // 自動スクロール
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, phase]);

  // 入力欄の自動高さ調整
  useEffect(() => {
    const ta = textAreaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const callBackend = useCallback(
    async (text: string, history: ChatMessage[]): Promise<string> => {
      if (onSend) return onSend(text, history);
      const api = (window as unknown as {
        electronAPI?: {
          chat?: (payload: {
            input: string;
            history: ChatMessage[];
          }) => Promise<string>;
        };
      }).electronAPI;
      if (api?.chat) return api.chat({ input: text, history });
      // フォールバック (開発時用)
      await new Promise((r) => setTimeout(r, 600));
      return `（モック応答）「${text}」を受け取りました。`;
    },
    [onSend]
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || phase === 'sending' || phase === 'thinking') return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setError(null);
    setPhase('sending');

    try {
      // 送信フェーズの可視化のため意図的に短い遅延
      await new Promise((r) => setTimeout(r, 120));
      setPhase('thinking');
      const reply = await callBackend(text, nextHistory);
      const aiMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: reply,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setPhase('done');
      // 一定時間後に idle に戻す
      window.setTimeout(() => setPhase('idle'), 800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '送信に失敗しました';
      setError(msg);
      setPhase('idle');
    }
  }, [input, messages, phase, callBackend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  const clearAll = useCallback(() => {
    setMessages([]);
    setError(null);
    setPhase('idle');
  }, []);

  const activePhaseIndex = useMemo(
    () => Math.max(0, PHASES.findIndex((p) => p.key === phase)),
    [phase]
  );

  if (collapsed) {
    return (
      <aside className={`${styles.sidebar} ${styles.sidebarCollapsed}`}>
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={() => onToggleCollapsed?.(false)}
          aria-label="AI チャットを開く"
          title="AI チャットを開く"
        >
          ◂
        </button>
      </aside>
    );
  }

  return (
    <aside className={styles.sidebar} aria-label="AI チャット">
      {/* ── ヘッダー ───────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerTitleWrap}>
          <span className={styles.statusDot} data-phase={phase} aria-hidden />
          <h2 className={styles.title}>{title}</h2>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={clearAll}
            disabled={messages.length === 0}
            aria-label="会話をクリア"
            title="会話をクリア"
          >
            クリア
          </button>
          {onToggleCollapsed && (
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => onToggleCollapsed(true)}
              aria-label="サイドバーを閉じる"
              title="サイドバーを閉じる"
            >
              ▸
            </button>
          )}
        </div>
      </header>

      {/* ── ステッパー (フロー可視化) ──────────────── */}
      <ol className={styles.stepper} aria-label="処理フロー">
        {PHASES.map((p, i) => {
          const state =
            i < activePhaseIndex
              ? 'done'
              : i === activePhaseIndex
              ? 'active'
              : 'pending';
          return (
            <li key={p.key} className={styles.stepItem} data-state={state}>
              <span className={styles.stepIndex}>{i + 1}</span>
              <span className={styles.stepLabel}>{p.label}</span>
              {i < PHASES.length - 1 && (
                <span className={styles.stepConnector} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {/* ── メッセージ一覧 ───────────────────────── */}
      <div ref={listRef} className={styles.list} role="log" aria-live="polite">
        {messages.length === 0 && phase === 'idle' && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>会話を始めましょう</p>
            <p className={styles.emptyHint}>
              下のテキスト欄に質問を入力して Enter で送信します。
              <br />
              Shift + Enter で改行できます。
            </p>
          </div>
        )}

        {messages.map((m) => (
          <article
            key={m.id}
            className={`${styles.bubble} ${
              m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant
            }`}
          >
            <div className={styles.bubbleMeta}>
              <span className={styles.bubbleRole}>
                {m.role === 'user' ? 'You' : 'AI'}
              </span>
              <time className={styles.bubbleTime}>
                {new Date(m.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
            <div className={styles.bubbleBody}>{m.content}</div>
          </article>
        ))}

        {(phase === 'sending' || phase === 'thinking') && (
          <div
            className={`${styles.bubble} ${styles.bubbleAssistant} ${styles.bubbleThinking}`}
            aria-label="AI が考えています"
          >
            <div className={styles.bubbleMeta}>
              <span className={styles.bubbleRole}>AI</span>
              <span className={styles.bubbleTime}>
                {phase === 'sending' ? '送信中…' : '思考中…'}
              </span>
            </div>
            <div className={styles.dots} aria-hidden>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {error && (
          <div className={styles.errorBox} role="alert">
            {error}
          </div>
        )}
      </div>

      {/* ── 入力エリア ──────────────────────────── */}
      <form
        className={styles.inputArea}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <textarea
          ref={textAreaRef}
          className={styles.textarea}
          placeholder="メッセージを入力…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={phase === 'sending' || phase === 'thinking'}
        />
        <div className={styles.inputFooter}>
          <span className={styles.inputHint}>
            Enter で送信 / Shift + Enter で改行
          </span>
          <button
            type="submit"
            className={styles.sendButton}
            disabled={
              !input.trim() || phase === 'sending' || phase === 'thinking'
            }
          >
            送信
          </button>
        </div>
      </form>
    </aside>
  );
};

export default ChatSidebar;
