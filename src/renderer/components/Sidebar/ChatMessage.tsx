import React from 'react';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessageData {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

interface Props {
  data: ChatMessageData;
  streaming?: boolean;
}

const ROLE_LABEL: Record<ChatRole, string> = {
  user: 'You',
  assistant: 'AI',
  system: 'System',
};

function formatTime(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const ChatMessage: React.FC<Props> = ({ data, streaming }) => {
  const { role, content, createdAt } = data;
  return (
    <div className={`msg msg--${role}`} data-streaming={streaming ? 'true' : 'false'}>
      <div className="msg__head">
        <span className="msg__role">{ROLE_LABEL[role]}</span>
        <span className="msg__time">{formatTime(createdAt)}</span>
      </div>
      <div className="msg__body">
        {content.split('\n').map((line, i) => (
          <p key={i} className="msg__line">
            {line || '\u00A0'}
          </p>
        ))}
        {streaming ? <span className="msg__caret" aria-hidden /> : null}
      </div>
    </div>
  );
};
