import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styles from './AIChat.module.css';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

/** チャットの進行フェーズ。ヘッダーのステッパーで可視化する */
export type ChatPhase = 'idle' | 'composing' | 'sending' | 'thinking' | 'answered';

export interface AIChatProps {
  /** 任意の初期メッセージ */
  initialMessages?: ChatMessage[];
  /** 実際の送信処理（差し替え可能）。省略時はモックで動作する */
  onSend?: (input: string, history: ChatMessage[]) => Promise<string>;
  /** UI上のタイトル */
  title?: string;
  /** プレースホルダ */
  placeholder?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
};

const PHASES: { key: ChatPhase; label: string }[] = [
  { key: 'composing', label: '入力' },
  { key: 'sending', label: '送信' },
  { key: 'thinking', label: '思考' },
  { key: 'answered', label: '応答' },
];

/** 既定のモック応答（onSend 未指定時のみ使用） */
const mockSend = async (input: string): Promise<string> => {
  await new Promise((r) => setTimeout(r, 700));
  return `「${input}」について確認しました。\n\n要点を整理してお答えします。\n（これはサンプル応答です。onSend を渡すと実 API に接続できます）`;
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export const AIChat: React.FC<AIChatProps> = ({
  initialMessages,
  onSend,
  title = 'AI Assistant',
  placeholder = 'メッセージを入力 ( Enter で送信 / Shift+Enter で改行 )',
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? [],
  );
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<{ aborted: boolean } | null>(null);

  /* ------ auto scroll ----------------------------------------- */
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  /* ------ textarea auto resize -------------------------------- */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  /* ------ phase derivation on input --------------------------- */
  useEffect(() => {
    if (phase === 'sending' || phase === 'thinking') return;
    if (input.trim().length > 0) {
      setPhase('composing');
    } else if (phase === 'composing') {
      setPhase('idle');
    }
  }, [input, phase]);

  /* ------ send -------------------------------------------------*/
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || phase === 'sending' || phase === 'thinking') return;

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

    const token = { aborted: false };
    abortRef.current = token;

    try {
      // 「送信」フェーズを一瞬見せる（フローをユーザーに認知させる）
      await new Promise((r) => setTimeout(r, 200));
      if (token.aborted) return;
      setPhase('thinking');

      const reply = onSend
        ? await onSend(text, nextHistory)
        : await mockSend(text);

      if (token.aborted) return;

      const aiMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: reply,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setPhase('answered');

      // 少し見せたあと idle に落とす
      setTimeout(() => {
        setPhase((p) => (p === 'answered' ? 'idle' : p));
      }, 1200);
    } catch (e) {
      if (token.aborted) return;
      setError(
        e instanceof Error ? e.message : '応答の取得中にエラーが発生しました',
      );
      setPhase('idle');
    } finally {
      abortRef.current = null;
    }
  }, [input, messages, onSend, phase]);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.aborted = true;
      abortRef.current = null;
    }
    setPhase('idle');
  }, []);

  const clear = useCallback(() => {
    if (phase === 'sending' || phase === 'thinking') return;
    setMessages([]);
    setError(null);
    setPhase('idle');
  }, [phase]);

  /* ------ keyboard ------------------------------------------- */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  /* ------ derived -------------------------------------------- */
  const activePhaseIndex = useMemo(() => {
    const idx = PHASES.findIndex((p) => p.key === phase);
    return idx; // -1 のときは未開始
  }, [phase]);

  const isBusy = phase === 'sending' || phase === 'thinking';
  const canSend = input.trim().length > 0 && !isBusy;

  /* ------------------------------------------------------------ */
  return (
    <section className={styles.root} aria-label="AI Chat">
      {/* Header --------------------------------------------------- */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.dot} aria-hidden />
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={clear}
            disabled={isBusy || messages.length === 0}
            title="会話をクリア"
          >
            Clear
          </button>
        </div>

        {/* Stepper：フローを可視化 */}
        <ol className={styles.stepper} aria-label="chat flow">
          {PHASES.map((p, i) => {
            const state =
              activePhaseIndex === -1
                ? 'pending'
                : i < activePhaseIndex
                ? 'done'
                : i === activePhaseIndex
                ? 'active'
                : 'pending';
            return (
              <li
                key={p.key}
                className={`${styles.step} ${styles[`step-${state}`]}`}
              >
                <span className={styles.stepIndex}>{i + 1}</span>
                <span className={styles.stepLabel}>{p.label}</span>
              </li>
            );
          })}
        </ol>
      </header>

      {/* Messages ------------------------------------------------ */}
      <div ref={listRef} className={styles.list} role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>何でも聞いてください</p>
            <p className={styles.emptySub}>
              質問・要約・コード生成などをサポートします。
            </p>
            <ul className={styles.hints}>
              <li>· この選択範囲を要約して</li>
              <li>· エラーの原因を調べて</li>
              <li>· テストコードを書いて</li>
            </ul>
          </div>
        )}

        {messages.map((m) => (
          <article
            key={m.id}
            className={`${styles.msg} ${styles[`msg-${m.role}`]}`}
          >
            <div className={styles.msgMeta}>
              <span className={styles.msgRole}>
                {m.role === 'user'
                  ? 'You'
                  : m.role === 'assistant'
                  ? 'AI'
                  : 'System'}
              </span>
              <span className={styles.msgTime}>{formatTime(m.createdAt)}</span>
            </div>
            <div className={styles.msgBody}>{m.content}</div>
          </article>
        ))}

        {phase === 'thinking' && (
          <article className={`${styles.msg} ${styles['msg-assistant']}`}>
            <div className={styles.msgMeta}>
              <span className={styles.msgRole}>AI</span>
              <span className={styles.msgTime}>thinking…</span>
            </div>
            <div className={styles.thinking} aria-label="AIが思考中">
              <span />
              <span />
              <span />
            </div>
          </article>
        )}

        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}
      </div>

      {/* Composer ----------------------------------------------- */}
      <footer className={styles.composer}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isBusy}
        />
        <div className={styles.composerActions}>
          <span className={styles.hint}>
            {isBusy
              ? phase === 'sending'
                ? '送信しています…'
                : 'AIが応答を生成中…'
              : 'Enter で送信'}
          </span>
          {isBusy ? (
            <button
              type="button"
              className={styles.stopBtn}
              onClick={stop}
              title="生成を中止"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className={styles.sendBtn}
              onClick={() => void send()}
              disabled={!canSend}
            >
              Send
            </button>
          )}
        </div>
      </footer>
    </section>
  );
};

export default AIChat;
