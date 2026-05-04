import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_HEIGHT = 180;

export const ChatComposer: React.FC<Props> = ({ onSubmit, disabled, placeholder }) => {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${h}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const submit = useCallback(() => {
    if (disabled) return;
    const t = value.trim();
    if (!t) return;
    onSubmit(t);
    setValue('');
  }, [disabled, onSubmit, value]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="composer__field">
        <textarea
          ref={ref}
          className="composer__textarea"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="メッセージ入力"
        />
        <button
          type="submit"
          className="composer__send"
          disabled={disabled || value.trim().length === 0}
          aria-label="送信"
          title="送信 (Enter)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path
              d="M3 12l18-8-8 18-2-8-8-2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="composer__hint">
        <span>
          <kbd>Enter</kbd> 送信
        </span>
        <span>
          <kbd>Shift</kbd> + <kbd>Enter</kbd> 改行
        </span>
      </div>
    </form>
  );
};
