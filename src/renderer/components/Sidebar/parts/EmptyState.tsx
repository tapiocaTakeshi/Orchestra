import React from 'react';
import styles from '../AIChatSidebar.module.css';
import { IconSparkle } from './icons';

export interface EmptyStateProps {
  suggestions: string[];
  onPick: (text: string) => void;
}

const FLOW: { label: string }[] = [
  { label: '質問や指示を入力する' },
  { label: 'Enter で送信、Shift+Enter で改行' },
  { label: '生成中は停止ボタンで中断できます' },
];

export const EmptyState: React.FC<EmptyStateProps> = ({ suggestions, onPick }) => {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyHero}>
        <span className={styles.emptyBadge} aria-hidden>
          <IconSparkle />
        </span>
        <h3 className={styles.emptyTitle}>AI に話しかけてみましょう</h3>
        <p className={styles.emptyLead}>
          コードレビュー、要約、リファクタ提案など何でもどうぞ。
        </p>
      </div>

      <ol className={styles.flowSteps} aria-label="使い方の流れ">
        {FLOW.map((step, i) => (
          <li key={i} className={styles.flowStep}>
            <span className={styles.flowIndex}>{i + 1}</span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>

      <ul className={styles.suggestList} aria-label="クイックスタート">
        <li className={styles.suggestLabel}>クイックスタート</li>
        {suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              className={styles.suggestButton}
              onClick={() => onPick(s)}
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
