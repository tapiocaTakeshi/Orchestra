import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChatFlowSteps, { ChatStep } from './ChatFlowSteps';
import ChatMessage, { Message } from './ChatMessage';
import ChatInput from './ChatInput';
import './AIChatSidebar.css';

type Props = {
  onSend?: (text: string) => Promise<string> | string;
  initialMessages?: Message[];
  title?: string;
};

const SUGGESTIONS = [
  'このコードを要約して',
  '選択範囲をリファクタリング',
  'テストを書いて',
  'バグの原因を推測して',
];

const AIChatSidebar: React.FC<Props> = ({
  onSend,
  initialMessages = [],
  title = 'AI Assistant',
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [step, setStep] = useState<ChatStep>('idle');
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 自動スクロール
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, step]);

  const callAI = useCallback(
    async (text: string): Promise<string> => {
      if (onSend) return await onSend(text);
      // Electron preload が公開している API を優先
      const w = window as unknown as {
        electronAPI?: { chat?: (t: string) => Promise<string> };
        api?: { chat?: (t: string) => Promise<string> };
      };
      const fn = w.electronAPI?.chat || w.api?.chat;
      if (fn) return await fn(text);
      // フォールバック（モック）
      await new Promise((r) => setTimeout(r, 700));
      return `（モック回答）「${text}」について整理しました。`;
    },
    [onSend],
  );

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, userMsg]);
      setStep('thinking');

      try {
        const reply = await callAI(trimmed);
        setStep('responding');
        const aiMsg: Message = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: reply,
          createdAt: Date.now(),
        };
        // タイピング演出を一瞬挟む
        await new Promise((r) => setTimeout(r, 120));
        setMessages((m) => [...m, aiMsg]);
        setStep('done');
        setTimeout(() => setStep('idle'), 600);
      } catch (e) {
        const errMsg: Message = {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: 'エラーが発生しました。もう一度お試しください。',
          createdAt: Date.now(),
          isError: true,
        };
        setMessages((m) => [...m, errMsg]);
        setStep('idle');
      }
    },
    [callAI],
  );

  const handleClear = () => {
    setMessages([]);
    setStep('idle');
  };

  const isEmpty = useMemo(() => messages.length === 0, [messages.length]);

  return (
    <aside
      className={`ai-sidebar ${collapsed ? 'is-collapsed' : ''}`}
      aria-label="AI Chat Sidebar"
    >
      <header className="ai-sidebar__header">
        <div className="ai-sidebar__title">
          <span className="ai-sidebar__dot" aria-hidden />
          <span className="ai-sidebar__title-text">{title}</span>
        </div>
        <div className="ai-sidebar__header-actions">
          <button
            className="ai-icon-btn"
            onClick={handleClear}
            title="会話をクリア"
            aria-label="Clear conversation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
            </svg>
          </button>
          <button
            className="ai-icon-btn"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展開' : '折りたたみ'}
            aria-label="Toggle sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
            </svg>
          </button>
        </div>
      </header>

      <ChatFlowSteps step={step} />

      <div className="ai-sidebar__list" ref={listRef} role="log" aria-live="polite">
        {isEmpty ? (
          <div className="ai-empty">
            <div className="ai-empty__title">何かお手伝いしますか？</div>
            <div className="ai-empty__sub">
              下の入力欄に質問を入れるか、よくある操作から選んでください。
            </div>
            <div className="ai-empty__suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="ai-chip"
                  onClick={() => handleSend(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}

        {step === 'thinking' && (
          <div className="ai-thinking" aria-label="AI is thinking">
            <span className="ai-thinking__badge">AI</span>
            <span className="ai-thinking__dots">
              <i /><i /><i />
            </span>
            <span className="ai-thinking__text">考えています…</span>
          </div>
        )}
      </div>

      <ChatInput
        disabled={step === 'thinking'}
        onSubmit={handleSend}
        placeholder="メッセージを入力（⌘/Ctrl + Enter で送信）"
      />
    </aside>
  );
};

export default AIChatSidebar;
