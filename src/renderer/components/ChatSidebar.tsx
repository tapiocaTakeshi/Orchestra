import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea';
import './ChatSidebar.css';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
}

export interface ChatSidebarProps {
  /** 親が制御する場合のメッセージ配列。未指定なら内部 state で動作 */
  messages?: ChatMessage[];
  /** メッセージ送信ハンドラ。未指定ならデモ動作（エコー） */
  onSend?: (text: string) => void | Promise<void>;
  /** 送信〜返答待ちのフラグ。親が制御する場合に渡す */
  isLoading?: boolean;
  /** New chat 押下時。未指定なら内部 state をクリア */
  onNewChat?: () => void;
  /** サイドバーの開閉。未指定なら常時表示 */
  open?: boolean;
  /** 閉じるボタン押下時 */
  onClose?: () => void;
  /** タイトル */
  title?: string;
  /** 入力欄プレースホルダ */
  placeholder?: string;
}

const SUGGESTIONS = [
  '選択中のコードを要約して',
  'このファイルにテストを書いて',
  'リファクタリング案を3つ提案',
];

const STEPS = [
  { n: 1, label: '質問を入力' },
  { n: 2, label: 'Enter で送信' },
  { n: 3, label: '回答を確認' },
];

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  messages: messagesProp,
  onSend,
  isLoading: isLoadingProp,
  onNewChat,
  open = true,
  onClose,
  title = 'AI Chat',
  placeholder = 'メッセージを入力…  (Enter 送信 / Shift+Enter 改行)',
}) => {
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [input, setInput] = useState('');

  const messages = messagesProp ?? internalMessages;
  const isLoading = isLoadingProp ?? internalLoading;

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useAutoResizeTextarea(textareaRef, input, 160);

  // 自動スクロール
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const handleSend = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || isLoading) return;

      if (onSend) {
        await onSend(text);
      } else {
        // デモ動作: ローカルにエコー
        const userMsg: ChatMessage = {
          id: `u_${Date.now()}`,
          role: 'user',
          content: text,
          createdAt: Date.now(),
        };
        setInternalMessages((m) => [...m, userMsg]);
        setInternalLoading(true);
        setTimeout(() => {
          setInternalMessages((m) => [
            ...m,
            {
              id: `a_${Date.now()}`,
              role: 'assistant',
              content: `「${text}」について考えました。\n\n…ここに回答が入ります。`,
              createdAt: Date.now(),
            },
          ]);
          setInternalLoading(false);
        }, 700);
      }
      setInput('');
    },
    [input, isLoading, onSend],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void handleSend();
      } else if (e.key === 'Escape') {
        setInput('');
      }
    },
    [handleSend],
  );

  const handleNewChat = useCallback(() => {
    if (onNewChat) onNewChat();
    else setInternalMessages([]);
    setInput('');
    textareaRef.current?.focus();
  }, [onNewChat]);

  const isEmpty = messages.length === 0;

  const renderedMessages = useMemo(
    () =>
      messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      )),
    [messages],
  );

  if (!open) return null;

  return (
    <aside className="chat-sidebar" aria-label={title}>
      <header className="chat-sidebar__header">
        <div className="chat-sidebar__title">
          <span className="chat-sidebar__dot" aria-hidden />
          <h2>{title}</h2>
        </div>
        <div className="chat-sidebar__header-actions">
          <button
            type="button"
            className="chat-sidebar__icon-btn"
            onClick={handleNewChat}
            title="新しいチャット"
            aria-label="新しいチャット"
          >
            <NewChatIcon />
          </button>
          {onClose && (
            <button
              type="button"
              className="chat-sidebar__icon-btn"
              onClick={onClose}
              title="閉じる"
              aria-label="閉じる"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </header>

      <div
        className="chat-sidebar__list"
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {isEmpty ? (
          <EmptyState
            onPick={(s) => {
              setInput(s);
              textareaRef.current?.focus();
            }}
          />
        ) : (
          <>
            {renderedMessages}
            {isLoading && <ThinkingRow />}
          </>
        )}
      </div>

      <form
        className="chat-sidebar__composer"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <div className="chat-sidebar__composer-inner">
          <textarea
            ref={textareaRef}
            className="chat-sidebar__textarea"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="メッセージ入力"
          />
          <div className="chat-sidebar__composer-bar">
            <span className="chat-sidebar__hint">
              Enter で送信 ・ Shift+Enter で改行
            </span>
            <button
              type="submit"
              className="chat-sidebar__send"
              disabled={!input.trim() || isLoading}
              aria-label="送信"
            >
              {isLoading ? <Spinner /> : <SendIcon />}
              <span>{isLoading ? '送信中' : '送信'}</span>
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
};

/* ---------- subcomponents ---------- */

const MessageRow: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div
      className={
        'msg ' + (isUser ? 'msg--user' : message.role === 'system' ? 'msg--sys' : 'msg--ai')
      }
    >
      {!isUser && (
        <div className="msg__avatar" aria-hidden>
          AI
        </div>
      )}
      <div className="msg__bubble">
        {message.content.split('\n').map((line, i) => (
          <p key={i}>{line || '\u00A0'}</p>
        ))}
      </div>
    </div>
  );
};

const ThinkingRow: React.FC = () => (
  <div className="msg msg--ai" aria-label="AI が考え中">
    <div className="msg__avatar" aria-hidden>
      AI
    </div>
    <div className="msg__bubble msg__bubble--thinking">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </div>
  </div>
);

const EmptyState: React.FC<{ onPick: (s: string) => void }> = ({ onPick }) => (
  <div className="empty">
    <div className="empty__title">何でも聞いてください</div>
    <div className="empty__sub">3ステップで回答が得られます</div>

    <ol className="empty__steps">
      {STEPS.map((s) => (
        <li key={s.n} className="empty__step">
          <span className="empty__step-num">{s.n}</span>
          <span className="empty__step-label">{s.label}</span>
        </li>
      ))}
    </ol>

    <div className="empty__suggest-title">サンプル</div>
    <div className="empty__suggest">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          type="button"
          className="empty__chip"
          onClick={() => onPick(s)}
        >
          {s}
        </button>
      ))}
    </div>
  </div>
);

/* ---------- icons ---------- */

const NewChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const Spinner = () => (
  <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 12a9 9 0 1 1-6.2-8.55" />
  </svg>
);

export default ChatSidebar;
