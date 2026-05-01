import React from 'react';

export type ChatStep = 'idle' | 'thinking' | 'responding' | 'done';

const STEPS: { key: ChatStep | 'input'; label: string }[] = [
  { key: 'input', label: '入力' },
  { key: 'thinking', label: '思考' },
  { key: 'responding', label: '回答' },
  { key: 'done', label: '完了' },
];

const order: Record<ChatStep, number> = {
  idle: 0,
  thinking: 1,
  responding: 2,
  done: 3,
};

const ChatFlowSteps: React.FC<{ step: ChatStep }> = ({ step }) => {
  const current = order[step];
  return (
    <ol className="ai-steps" aria-label="Chat progress">
      {STEPS.map((s, i) => {
        const state =
          i < current ? 'done' : i === current ? 'active' : 'pending';
        return (
          <li key={s.key} className={`ai-steps__item ai-steps__item--${state}`}>
            <span className="ai-steps__num">{i + 1}</span>
            <span className="ai-steps__label">{s.label}</span>
            {i < STEPS.length - 1 && <span className="ai-steps__bar" />}
          </li>
        );
      })}
    </ol>
  );
};

export default ChatFlowSteps;
