import React from 'react';

interface EmptyStateProps {
  onPick: (prompt: string) => void;
}

const SAMPLES = [
  'このコードをレビューして',
  '選択中のファイルを要約して',
  'TODO を一覧にして',
];

export const EmptyState: React.FC<EmptyStateProps> = ({ onPick }) => {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="1.5"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 1 1-3.2-6.4" />
          <path d="M21 4v5h-5" />
        </svg>
      </div>
      <h3 className="empty__title">何でも聞いてください</h3>
      <p className="empty__desc">
        メッセージを送ると、AI が応答します。<br />
        まずは下のサンプルから試せます。
      </p>
      <ul className="empty__samples">
        {SAMPLES.map((s) => (
          <li key={s}>
            <button
              type="button"
              className="empty__sample"
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
