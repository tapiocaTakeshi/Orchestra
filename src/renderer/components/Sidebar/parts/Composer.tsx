import React, { useEffect, useRef } from 'react';
import styles from '../AIChatSidebar.module.css';
import { IconSend, IconStop } from './icons';

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  placeholder?: string;
}

export const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  placeholder = 'メッセージを入力…',
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  // 自動伸縮
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!isStreaming) onSubmit(value);
    }
  };

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <div className={styles.composer}>
      <div className={styles.composerBox}>
        <textarea
          ref={ref}
          className={styles.textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          aria-label="メッセージ入力"
        />
        <div className={styles.composerToolbar}>
          <span className={styles.hint}>
            <span className={styles.kbd}>Enter</span>送信
            <span className={styles.kbd}>Shift</span>+
            <span className={styles.kbd}>Enter</span>改行
          </span>
          {isStreaming ? (
            <button
              type="button"
              className={styles.stopButton}
              onClick={onStop}
              aria-label="生成を停止"
            >
              <IconStop /> 停止
            </button>
          ) : (
            <button
              type="button"
              className={styles.sendButton}
              onClick={() => onSubmit(value)}
              disabled={!canSend}
              aria-label="送信"
            >
              <IconSend /> 送信
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
