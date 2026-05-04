import React from 'react';
import type { ChatStatus } from './useChat';

interface Props {
  status: ChatStatus;
}

const LABEL: Record<ChatStatus, string> = {
  idle: '待機中',
  thinking: '思考中',
  streaming: '応答中',
  error: 'エラー',
};

export const StatusIndicator: React.FC<Props> = ({ status }) => {
  return (
    <span className={`chat-status chat-status--${status}`} aria-live="polite">
      <span className="chat-status__dot" aria-hidden />
      <span className="chat-status__label">{LABEL[status]}</span>
    </span>
  );
};
