import React, { useState } from 'react';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  isError?: boolean;
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };

  return (
    <article
      className={`ai-msg ai-msg--${message.role} ${message.isError ? 'is-error' : ''}`}
    >
      <div className="ai-msg__meta">
        <span className={`ai-msg__badge ai-msg__badge--${message.role}`}>
          {isUser ? 'You' : 'AI'}
        </span>
        <time className="ai-msg__time">{formatTime(message.createdAt)}</time>
      </div>
      <div className="ai-msg__bubble">{message.content}</div>
      {!isUser && !message.isError && (
        <div className="ai-msg__actions">
          <button className="ai-msg__action" onClick={onCopy}>
            {copied ? 'コピー済み' : 'コピー'}
          </button>
        </div>
      )}
    </article>
  );
};

export default ChatMessage;
