import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './AIChatPanel.module.css';
import { useAIChat } from './useAIChat';
import type { ChatMessage, ChatPhase } from './types';

interface Props {
  title?: string;
  /** Sidebar の開閉と連動させたい場合に使用 */
  onClose?: () => void;
}

const SUGGESTIONS = [
  '選択中のコードを要約して',
  'このプロジェクトの構成を教えて',
  'TODOコメントを一覧化して',
];

const PhaseIndicator: React.FC<{ phase: ChatPhase }> = ({ phase }) => {
  const steps: { key: ChatPhase; label: string }[] = [
    { key: 'idle', label: '入力' },
    { key: 'thinking', label: '思考中' },
    { key: 'answer', label: '回答' },
  ];
  const activeIndex = steps.findIndex((s) => s.key === phase);
  const idx = activeIndex < 0 ? 0 : activeIndex;
  return (
    <div className={styles.steps} aria-label="チャット進行状況">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div
            className={[
              styles.step,
              i <= idx ? styles.stepActive : '',
              i === idx ? styles.stepCurrent : '',
            ].join(' ')}
          >
            <span className={styles.stepDot} />
            <span className={styles.stepLabel}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <span className={styles.stepBar} />}
        </React.Fragment>
      ))}
    </div>
  );
};

const Bubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={[styles.row, isUser ? styles.rowUser : styles.rowAi].join(' ')}>
      {!isUser && <div className={styles.avatar} aria-hidden>AI</div>}
      <div className={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi].join(' ')}>
        {msg.content}
      </div>
    </div>
  );
};

const ThinkingBubble: React.FC = () => (
  <div className={[styles.row, styles.rowAi].join(' ')}>
    <div className={styles.avatar} aria-hidden>AI</div>
    <div className={[styles.bubble, styles.bubbleAi, styles.shimmer].join(' ')}>
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.thinkingText}>考え中…</span>
    </div>
  </div>
);

const AIChatPanel: React.FC<Props> = ({ title = 'AI Chat', onClose }) => {
  const { state, send, reset } = useAIChat();
  const [input, setInput] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isBusy = state.phase === 'thinking' || state.phase === 'streaming';
  const isEmpty = state.messages.length === 0;

  // 自動スクロール
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [state.messages, state.phase]);

  // textarea auto-grow
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  const handleSubmit = async () => {
    if (!input.trim() || isBusy) return;
    const text = input;
    setInput('');
    await send(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const headerSubtitle = useMemo(() => {
    switch (state.phase) {
      case 'thinking': return 'モデルが思考中…';
      case 'error': return 'エラーが発生しました';
      case 'answer': return '回答が届きました';
      default: return '質問やコードについて聞けます';
    }
  }, [state.phase]);

  return (
    <aside className={styles.panel} role="complementary" aria-label="AI Chat Sidebar">
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.title}>
            <span className={styles.logoDot} />
            {title}
          </div>
          <div className={styles.subtitle}>{headerSubtitle}</div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={reset}
            title="新しいチャット"
            aria-label="新しいチャット"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {onClose && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onClose}
              title="閉じる"
              aria-label="閉じる"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Phase indicator */}
      <PhaseIndicator phase={state.phase} />

      {/* Body */}
      <div className={styles.body} ref={listRef}>
        {isEmpty ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>何から始めますか？</div>
            <div className={styles.emptyHint}>
              下の例から選ぶか、自由に質問してください。
            </div>
            <ul className={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    className={styles.suggestion}
                    onClick={() => send(s)}
                  >
                    <span className={styles.suggestionArrow}>›</span>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className={styles.list}>
            {state.messages.map((m) => (
              <Bubble key={m.id} msg={m} />
            ))}
            {isBusy && <ThinkingBubble />}
            {state.phase === 'error' && (
              <div className={styles.errorBox} role="alert">
                {state.error ?? 'エラーが発生しました'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <footer className={styles.composer}>
        <div className={styles.composerInner}>
          <textarea
            ref={taRef}
            className={styles.textarea}
            placeholder="メッセージを入力…  (⌘/Ctrl + Enter で送信)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={isBusy}
          />
          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleSubmit}
            disabled={!input.trim() || isBusy}
            aria-label="送信"
            title="送信 (⌘/Ctrl + Enter)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
            </svg>
          </button>
        </div>
        <div className={styles.composerHint}>
          {isBusy ? '応答を生成しています…' : 'Shift+Enter で改行 / ⌘・Ctrl+Enter で送信'}
        </div>
      </footer>
    </aside>
  );
};

export default AIChatPanel;
