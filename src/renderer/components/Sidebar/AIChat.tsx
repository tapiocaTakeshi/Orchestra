import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage, type ChatMessageData } from './ChatMessage';
import { ChatComposer } from './ChatComposer';
import { ChatEmptyState } from './ChatEmptyState';
import './AIChat.css';

export interface AIChatProps {
  /** 現在の作業コンテキスト（例: 開いているファイル名やプロジェクト名） */
  contextLabel?: string;
  /** 初期メッセージ */
  initialMessages?: ChatMessageData[];
  /** 送信時のハンドラ。AIレスポンスを async iterable / Promise で返す */
  onSend?: (
    text: string,
    history: ChatMessageData[]
  ) => AsyncIterable<string> | Promise<string>;
  /** クイック提案 */
  suggestions?: string[];
}

const DEFAULT_SUGGESTIONS = [
  'このファイルを要約して',
  'バグの原因を一緒に探して',
  'リファクタの提案をして',
];

/**
 * Minimal AI Chat Sidebar
 * ─ Flow ─
 *  ① Context bar  → ② Timeline → ③ Streaming → ④ Suggestions → ⑤ Composer
 */
export const AIChat: React.FC<AIChatProps> = ({
  contextLabel,
  initialMessages = [],
  onSend,
  suggestions = DEFAULT_SUGGESTIONS,
}) => {
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      const userMsg: ChatMessageData = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      };
      const nextHistory = [...messages, userMsg];
      setMessages(nextHistory);

      if (!onSend) {
        setMessages([
          ...nextHistory,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content:
              '（onSend が未設定です。親コンポーネントから AI 呼び出し関数を渡してください）',
            createdAt: Date.now(),
          },
        ]);
        return;
      }

      setStreaming(true);
      setStreamingText('');

      try {
        const result = await onSend(trimmed, nextHistory);

        if (typeof result === 'string') {
          setMessages([
            ...nextHistory,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: result,
              createdAt: Date.now(),
            },
          ]);
        } else if (result && typeof (result as AsyncIterable<string>)[Symbol.asyncIterator] === 'function') {
          let acc = '';
          for await (const chunk of result as AsyncIterable<string>) {
            acc += chunk;
            setStreamingText(acc);
          }
          setMessages([
            ...nextHistory,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: acc,
              createdAt: Date.now(),
            },
          ]);
        }
      } catch (err) {
        setMessages([
          ...nextHistory,
          {
            id: `e-${Date.now()}`,
            role: 'system',
            content: `エラー: ${err instanceof Error ? err.message : String(err)}`,
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setStreaming(false);
        setStreamingText('');
      }
    },
    [messages, onSend, streaming]
  );

  const handleClear = useCallback(() => {
    if (streaming) return;
    setMessages([]);
  }, [streaming]);

  const isEmpty = messages.length === 0 && !streaming;

  const stepIndicator = useMemo(() => {
    // ② Timeline → ③ Streaming のどのステップ中かを示す
    if (streaming) return 'AI が回答中…';
    if (messages.length === 0) return 'メッセージを入力してください';
    return `${messages.length} 件のやり取り`;
  }, [streaming, messages.length]);

  return (
    <section className="aichat" aria-label="AI チャット">
      {/* ① Context bar */}
      <header className="aichat__header">
        <div className="aichat__title">
          <span className="aichat__dot" aria-hidden />
          <span className="aichat__titleText">AI Chat</span>
        </div>
        <div className="aichat__status" aria-live="polite">
          {stepIndicator}
        </div>
        <button
          type="button"
          className="aichat__iconBtn"
          onClick={handleClear}
          disabled={streaming || messages.length === 0}
          title="会話をクリア"
          aria-label="会話をクリア"
        >
          ⟲
        </button>
      </header>

      {contextLabel ? (
        <div className="aichat__context" title={contextLabel}>
          <span className="aichat__contextLabel">CONTEXT</span>
          <span className="aichat__contextValue">{contextLabel}</span>
        </div>
      ) : null}

      {/* ② Timeline */}
      <div className="aichat__scroll" ref={scrollRef}>
        {isEmpty ? (
          <ChatEmptyState
            suggestions={suggestions}
            onPick={(s) => handleSend(s)}
          />
        ) : (
          <ol className="aichat__list">
            {messages.map((m) => (
              <li key={m.id} className="aichat__item">
                <ChatMessage data={m} />
              </li>
            ))}
            {/* ③ Streaming */}
            {streaming ? (
              <li className="aichat__item">
                <ChatMessage
                  data={{
                    id: 'streaming',
                    role: 'assistant',
                    content: streamingText,
                    createdAt: Date.now(),
                  }}
                  streaming
                />
              </li>
            ) : null}
          </ol>
        )}
      </div>

      {/* ④ Suggestions（履歴がある時だけ薄く表示） */}
      {!isEmpty && !streaming && messages.length > 0 ? (
        <div className="aichat__suggestions" role="list">
          {suggestions.slice(0, 3).map((s) => (
            <button
              key={s}
              type="button"
              role="listitem"
              className="aichat__chip"
              onClick={() => handleSend(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* ⑤ Composer */}
      <ChatComposer
        disabled={streaming}
        onSubmit={handleSend}
        placeholder={streaming ? 'AI が応答中…' : 'メッセージを入力（Enter で送信 / Shift+Enter で改行）'}
      />
    </section>
  );
};

export default AIChat;
