import React from 'react';

interface Props {
  onPick: (prompt: string) => void;
}

const SUGGESTIONS: { title: string; prompt: string }[] = [
  { title: '使い方を聞く', prompt: 'このアプリでまず何ができるか教えて' },
  { title: 'コードを説明', prompt: '選択中のコードを日本語で要約して' },
  { title: 'アイデア出し', prompt: 'UI 改善のアイデアを 5 つ提案して' },
];

export const EmptyState: React.FC<Props> = ({ onPick }) => {
  return (
    <div className="chat-empty">
      <div className="chat-empty__icon" aria-hidden>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 6h16v10H8l-4 4V6z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="chat-empty__title">何でも聞いてください</h3>
      <p className="chat-empty__desc">
        質問を入力するか、下のサジェストから選んでください。
      </p>

      <ol className="chat-empty__steps" aria-label="使い方">
        <li><span>1</span>質問を書く</li>
        <li><span>2</span>Enter で送信</li>
        <li><span>3</span>応答をコピー／再生成</li>
      </ol>

      <ul className="chat-empty__suggestions">
        {SUGGESTIONS.map((s) => (
          <li key={s.title}>
            <button
              type="button"
              className="chat-empty__suggestion"
              onClick={() => onPick(s.prompt)}
            >
              <span className="chat-empty__suggestion-title">{s.title}</span>
              <span className="chat-empty__suggestion-prompt">{s.prompt}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
