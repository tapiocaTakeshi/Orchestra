import React from 'react';
import styles from '../AIChatSidebar.module.css';
import { IconSparkle } from './icons';

export const TypingIndicator: React.FC = () => {
  return (
    <div className={styles.bubbleRow + ' ' + styles.bubbleRowAssistant}>
      <div>
        <div className={styles.bubbleMeta}>
          <span className={styles.bubbleAvatar} aria-hidden>
            <IconSparkle size={10} />
          </span>
          <span>Assistant が考えています…</span>
        </div>
        <div className={styles.typing} aria-label="生成中">
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
        </div>
      </div>
    </div>
  );
};
