import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import './AIChat.css';

/**
 * AIChat — Minimal sidebar AI chat panel for Electron renderer.
 *
 * Goals:
 *  - Make the conversation flow obvious (idle → typing → sending → awaiting → done).
 *  - Keep the visual language minimal: generous whitespace, hairline borders,
 *    monochrome surface + a single accent color.
 *  - Be self-contained: works even if no IPC bridge is wired yet (falls back to a
 *    local mock responder), but uses window.electronAPI.chat if available.
 */

type Role = 'user' | 'assistant' | 'system';

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
}

type FlowPhase = 'idle' | 'typing' | 'sending' | 'awaiting' | 'done';

interface AIChatProps {
  title?: string;
  /** Optional override; if not provided, will try window.electronAPI.chat then fallback. */
  onSend?: (message: string, history: ChatMessage[]) => Promise<string>;
  /** Initial suggestions shown in empty state. */
  suggestions?: string[];
}

declare global {
  interface Window {
    electronAPI?: {
      chat?: (message: string, history: ChatMessage[]) => Promise<string>;
    };
  }
}

const DEFAULT_SUGGESTIONS = [
  'このプロジェクトの構成を要約して',
  '今開いているファイルをレビューして',
  'TODO コメントを一覧化して',
];

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const PHASES: { key: FlowPhase; label: string }[] = [
  { key: 'idle', label: '待機' },
  { key: 'typing', label: '入力中' },
  { key: 'sending', label: '送信' },
  { key: 'awaiting', label: '応答中' },
  { key: 'done', label: '完了' },
];

const AIChat: React.FC<AIChatProps> = ({
  title = 'AI Chat',
  onSend,
  suggestions = DEFAULT_SUGGESTIONS,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<FlowPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isBusy = phase === 'sending' || phase === 'awaiting';

  // Auto-scroll to the bottom whenever messages change or typing indicator toggles.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  // Auto-grow textarea.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, 180);
    ta.style.height = `${next}px`;
  }, [input]);

  // Reset phase to idle a moment after "done", so the indicator settles.
  useEffect(() => {
    if (phase !== 'done') return;
    const t = window.setTimeout(() => setPhase('idle'), 1200);
    return () => window.clearTimeout(t);
  }, [phase]);

  const resolveResponder = useCallback(
    async (text: string, history: ChatMessage[]): Promise<string> => {
      if (onSend) return onSend(text, history);
      if (typeof window !== 'undefined' && window.electronAPI?.chat) {
        return window.electronAPI.chat(text, history);
      }
      // Local fallback so the UI is testable without a backend.
      await new Promise((r) => setTimeout(r, 700));
      return `（モック応答）「${text}」を受け取りました。`;
    },
    [onSend],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || isBusy) return;

      setError(null);
      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
      };
      const nextHistory = [...messages, userMsg];
      setMessages(nextHistory);
      setInput('');
      setPhase('sending');

      try {
        // Brief "sending" frame so users see the transition.
        await new Promise((r) => setTimeout(r, 120));
        setPhase('awaiting');
        const reply = await resolveResponder(text, nextHistory);
        const aiMsg: ChatMessage = {
          id: uid(),
          role: 'assistant',
          content: reply,
          createdAt: Date.now(),
        };
        setMessages((m) => [...m, aiMsg]);
        setPhase('done');
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : '応答の取得に失敗しました。';
        setError(msg);
        setPhase('idle');
      }
    },
    [messages, isBusy, resolveResponder],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInput(v);
    if (!isBusy) {
      setPhase(v.trim().length > 0 ? 'typing' : 'idle');
    }
  };

  const clearAll = () => {
    if (isBusy) return;
    setMessages([]);
    setError(null);
    setPhase('idle');
    textareaRef.current?.focus();
  };

  const activePhaseIndex = useMemo(
    () => PHASES.findIndex((p) => p.key === phase),
    [phase],
  );

  return (
    <section className="aichat" aria-label={title}>
      {/* Header */}
      <header className="aichat__header">
        <div className="aichat__header-left">
          <span className="aichat__dot" data-phase={phase} aria-hidden />
          <h2 className="aichat__title">{title}</h2>
        </div>
        <button
          type="button"
          className="aichat__icon-btn"
          onClick={clearAll}
          disabled={isBusy || messages.length === 0}
          title="会話をクリア"
          aria-label="会話をクリア"
        >
          {/* trash icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
          </svg>
        </button>
      </header>

      {/* Flow indicator */}
      <ol className="aichat__flow" aria-label="進行状況">
        {PHASES.map((p, i) => {
          const state =
            i < activePhaseIndex
              ? 'done'
              : i === activePhaseIndex
                ? 'active'
                : 'pending';
          return (
            <li key={p.key} className="aichat__flow-step" data-state={state}>
              <span className="aichat__flow-bullet" aria-hidden />
              <span className="aichat__flow-label">{p.label}</span>
            </li>
          );
        })}
      </ol>

      {/* Messages */}
      <div className="aichat__list" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="aichat__empty">
            <p className="aichat__empty-title">何から始めますか？</p>
            <p className="aichat__empty-sub">
              質問を入力するか、下のサジェストから選んでください。
            </p>
            <div className="aichat__suggestions">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="aichat__suggestion"
                  onClick={() => void send(s)}
                  disabled={isBusy}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <article
              key={m.id}
              className={`aichat__msg aichat__msg--${m.role}`}
            >
              <div className="aichat__msg-head">
                <span className="aichat__avatar" aria-hidden>
                  {m.role === 'user' ? 'You' : 'AI'}
                </span>
                <span className="aichat__role">
                  {m.role === 'user' ? 'You' : 'Assistant'}
                </span>
                <time className="aichat__time" dateTime={new Date(m.createdAt).toISOString()}>
                  {formatTime(m.createdAt)}
                </time>
              </div>
              <div className="aichat__msg-body">{m.content}</div>
            </article>
          ))
        )}

        {phase === 'awaiting' && (
          <div className="aichat__msg aichat__msg--assistant aichat__msg--typing" aria-label="応答を生成中">
            <div className="aichat__msg-head">
              <span className="aichat__avatar" aria-hidden>AI</span>
              <span className="aichat__role">Assistant</span>
            </div>
            <div className="aichat__msg-body">
              <span className="aichat__typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="aichat__error" role="alert">
          {error}
        </div>
      )}

      {/* Composer */}
      <form
        className="aichat__composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          ref={textareaRef}
          className="aichat__textarea"
          placeholder={isBusy ? '応答を待っています…' : 'メッセージを入力 (Enter で送信 / Shift+Enter で改行)'}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isBusy}
          rows={1}
        />
        <div className="aichat__composer-row">
          <span className="aichat__hint">
            {isBusy ? '送信中…' : `${input.trim().length} 文字`}
          </span>
          <button
            type="submit"
            className="aichat__send"
            disabled={isBusy || input.trim().length === 0}
          >
            {isBusy ? (
              <>
                <span className="aichat__spinner" aria-hidden />
                送信中
              </>
            ) : (
              <>
                送信
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
};

export default AIChat;
