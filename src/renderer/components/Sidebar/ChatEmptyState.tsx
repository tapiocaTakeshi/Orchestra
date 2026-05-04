import React from 'react';

interface Props {
  suggestions: string[];
  onPick: (text: string) => void;
}

export const ChatEmptyState: React.FC<Props> = ({ suggestions, onPick }) => {
  return (
    <div className="empty">
      <div className="empty__title">AI とチャット</div>
      <p className="empty__desc">
        質問・要約・リファクタ提案などを依頼できます。
      </p>

      <ol className="empty__flow" aria-label="使い方の流れ">
        <li>
          <span className="empty__step">1</span>
          <span>下の入力欄にメッセージを書く</span>
        </li>
        <li>
          <span className="empty__step">2</span>
          <span>AI が回答をストリーミング表示</span>
        </li>
        <li>
          <span className="empty__step">3</span>
          <span>続けて深掘り・修正依頼ができる</span>
        </li>
      </ol>

      <div className="empty__suggestTitle">よく使う質問</div>
      <div className="empty__chips">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="empty__chip"
            onClick={() => onPick(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};
