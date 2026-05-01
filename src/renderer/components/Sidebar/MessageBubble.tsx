import React from 'react';
import type { ChatMessage } from '../../hooks/useAIChat';

interface MessageBubbleProps {
  message: ChatMessage;
  typing?: boolean;
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  typing,
}) => {
  const isUser = message.role === 'user';
  return (
    <div
      className={`bubble ${isUser ? 'bubble--user' : 'bubble--assistant'}`}
      data-role={message.role}
    >
      <div className="bubble__avatar" aria-hidden>
        {isUser ? 'U' : 'AI'}
      </div>
      <div className="bubble__body">
        <div className="bubble__meta">
          <span className="bubble__role">
            {isUser ? 'You' : 'Assistant'}
          </span>
          {!typing && (
            <span className="bubble__time">
              {formatTime(message.createdAt)}
            </span>
          )}
        </div>
        <div className="bubble__content">
          {typing ? (
            <span className="bubble__typing" aria-label="応答を生成中">
              <span /><span /><span />
            </span>
          ) : (
            message.content
          )}
        </div>
      </div>
    </div>
  );
};
