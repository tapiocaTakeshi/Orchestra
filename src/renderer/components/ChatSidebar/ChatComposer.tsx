import React, { useEffect, useRef, useState } from 'react';

interface Props {
  disabled?: boolean;
  onSubmit: (text: string) => void;
}

const MAX_ROWS = 6;

export const ChatComposer: React.FC<Props> = ({ disabled, onSubmit }) => {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // auto-grow
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 20; // ~ 14px font * 1.4
    const maxH = lineHeight * MAX_ROWS + 16;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setValue('');
    requestAnimationFrame(() => ref.current?.focus());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={`chat-composer__field ${disabled ? 'is-disabled' : ''}`}>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder={disabled ? 'AI が応答中…' : 'メッセージを入力 (Enter で送信)'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          className="chat-composer__textarea"
          aria-label="メッセージを入力"
        />
        <button
          type="submit"
          className="chat-composer__send"
          disabled={!canSend}
          aria-label="送信"
          title="送信 (Enter)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12l16-8-6 18-3-7-7-3z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className="chat-composer__hint">
        <span><kbd>Enter</kbd> 送信</span>
        <span className="chat-composer__hint-sep">·</span>
        <span><kbd>Shift</kbd>+<kbd>Enter</kbd> 改行</span>
      </div>
    </form>
  );
};
