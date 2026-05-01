import React, { useState } from 'react';
import type { ChatMessage } from './useChat';

interface Props {
  message: ChatMessage;
  onRegenerate?: () => void;
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const MessageBubble: React.FC<Props> = ({ message, onRegenerate }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };

  return (
    <div className={`chat-bubble chat-bubble--${message.role}`}>
      {message.role === 'assistant' && (
        <span className="chat-bubble__avatar" aria-hidden>AI</span>
      )}
      <div className="chat-bubble__body">
        <div className="chat-bubble__content">{message.content}</div>
        <div className="chat-bubble__meta">
          <span className="chat-bubble__time">{formatTime(message.createdAt)}</span>
          {message.role === 'assistant' && (
            <span className="chat-bubble__actions">
              <button
                type="button"
                className="chat-bubble__action"
                onClick={copy}
                aria-label="コピー"
                title={copied ? 'コピーしました' : 'コピー'}
              >
                {copied ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l5 5 9-11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M5 15V6a2 2 0 012-2h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              {onRegenerate && (
                <button
                  type="button"
                  className="chat-bubble__action"
                  onClick={onRegenerate}
                  aria-label="再生成"
                  title="再生成"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M20 4v4h-4M4 20v-4h4"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
