import React from 'react';
import styles from '../AIChatSidebar.module.css';
import { IconSparkle } from './icons';
import type { ChatRole } from '../AIChatSidebar';

export interface MessageBubbleProps {
  role: ChatRole;
  content: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content }) => {
  const isUser = role === 'user';
  return (
    <div
      className={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
      ].join(' ')}
    >
      <div style={{ maxWidth: '86%' }}>
        {!isUser && (
          <div className={styles.bubbleMeta}>
            <span className={styles.bubbleAvatar} aria-hidden>
              <IconSparkle size={10} />
            </span>
            <span>Assistant</span>
          </div>
        )}
        <div
          className={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
          ].join(' ')}
        >
          {content}
        </div>
      </div>
    </div>
  );
};
