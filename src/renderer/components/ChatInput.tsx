import React, { useEffect, useRef, useState } from 'react';

type Props = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

const ChatInput: React.FC<Props> = ({ onSubmit, disabled, placeholder }) => {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // 自動リサイズ
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [text]);

  const submit = () => {
    if (disabled) return;
    const t = text.trim();
    if (!t) return;
    onSubmit(t);
    setText('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="ai-input">
      <textarea
        ref={ref}
        className="ai-input__field"
        placeholder={placeholder}
        value={text}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
      />
      <div className="ai-input__row">
        <span className="ai-input__hint">
          {disabled ? 'AI が応答中…' : '⌘/Ctrl + Enter で送信'}
        </span>
        <button
          className="ai-input__send"
          onClick={submit}
          disabled={disabled || !text.trim()}
          aria-label="Send"
        >
          送信
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
