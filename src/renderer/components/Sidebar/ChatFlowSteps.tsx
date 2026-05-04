import React from 'react';
import { ChatPhase } from '../../hooks/useAIChat';

interface ChatFlowStepsProps {
  phase: ChatPhase;
}

const STEPS: { key: ChatPhase | 'composing'; label: string }[] = [
  { key: ChatPhase.Idle, label: '待機' },
  { key: 'composing', label: '入力' },
  { key: ChatPhase.Sending, label: '送信' },
  { key: ChatPhase.Responding, label: '応答' },
  { key: ChatPhase.Done, label: '完了' },
];

/**
 * フローを 5 ステップで可視化するミニマルなステッパー。
 * - 完了済み：塗りつぶし
 * - 現在：アクセントカラー + パルス
 * - 未到達：薄グレー
 */
export const ChatFlowSteps: React.FC<ChatFlowStepsProps> = ({ phase }) => {
  const activeIndex = (() => {
    switch (phase) {
      case ChatPhase.Idle:
        return 0;
      case ChatPhase.Composing:
        return 1;
      case ChatPhase.Sending:
        return 2;
      case ChatPhase.Responding:
        return 3;
      case ChatPhase.Done:
        return 4;
      default:
        return 0;
    }
  })();

  return (
    <ol className="aichat__steps" aria-label="チャットの進行状況">
      {STEPS.map((step, i) => {
        const state =
          i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo';
        return (
          <li
            key={step.key}
            className={`aichat__step aichat__step--${state}`}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <span className="aichat__step-mark" aria-hidden>
              {state === 'done' ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="3"
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              ) : (
                <span className="aichat__step-bullet" />
              )}
            </span>
            <span className="aichat__step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
};
