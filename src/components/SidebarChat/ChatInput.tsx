import React, {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  KeyboardEvent,
} from 'react';

export interface AttachedContext {
  id: string;
  label: string;
  kind?: 'file' | 'selection' | 'other';
}

export interface ChatInputProps {
  onSubmit: (text: string, context: AttachedContext[]) => void;
  /** 送信を抑止したい外部条件（indexing中など）。設定すると理由が表示され送信不可 */
  externalDisableReason?: string | null;
  /** 既に進行中のリクエストがあるか */
  isSending?: boolean;
  /** 取り外し可能な添付コンテキスト */
  context?: AttachedContext[];
  onRemoveContext?: (id: string) => void;
  maxLength?: number;
  placeholder?: string;
  /** H2: 送信前プレビューを有効にする（デフォルト true） */
  enablePreview?: boolean;
}

/**
 * H1: 送信可否理由のインライン表示
 * H2: 送信前プレビュー（確定 / 修正に戻る）
 * M6: 文字数カウンタ
 * A11y: aria-invalid / aria-describedby / aria-live
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  externalDisableReason = null,
  isSending = false,
  context = [],
  onRemoveContext,
  maxLength = 4000,
  placeholder = 'Ask Void anything...',
  enablePreview = true,
}) => {
  const [text, setText] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const reasonId = useId();
  const counterId = useId();

  // 送信可否の集中判定
  const disableReason = useMemo<string | null>(() => {
    if (externalDisableReason) return externalDisableReason;
    if (isSending) return '送信中です（完了後に再度お試しください）';
    if (text.trim().length === 0) return 'メッセージを入力してください';
    if (text.length > maxLength)
      return `最大 ${maxLength} 文字までです（現在 ${text.length} 文字）`;
    return null;
  }, [externalDisableReason, isSending, text, maxLength]);

  const canSend = disableReason === null;

  const goPreviewOrSubmit = useCallback(() => {
    if (!canSend) return;
    if (enablePreview && !previewing) {
      setPreviewing(true);
      return;
    }
    onSubmit(text.trim(), context);
    setText('');
    setPreviewing(false);
    // 送信後は入力欄にフォーカスを戻す
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [canSend, enablePreview, previewing, onSubmit, text, context]);

  const backToEdit = useCallback(() => {
    setPreviewing(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter: 送信（Shift+Enter は改行）
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        goPreviewOrSubmit();
      }
      // Escape: プレビューを閉じる
      if (e.key === 'Escape' && previewing) {
        e.preventDefault();
        backToEdit();
      }
    },
    [goPreviewOrSubmit, previewing, backToEdit],
  );

  return (
    <div
      className="sbc-input"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 16px 16px',
        maxWidth: 800,
        width: '100%',
        margin: '0 auto',
      }}
    >
      {/* H1: 送信不可理由のインライン表示 */}
      {disableReason && (
        <div
          id={reasonId}
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--void-warning, #cca700)',
            background: 'var(--void-warning-bg, rgba(204,167,0,0.1))',
            border: '1px solid var(--void-warning, #cca700)',
            borderRadius: 6,
            padding: '6px 10px',
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span>{disableReason}</span>
        </div>
      )}

      <div
        className={`sbc-input__box${canSend ? '' : ' is-disabled'}`}
        style={{
          background: 'var(--void-bg-2, #242424)',
          border: '1px solid var(--void-border, #383838)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          opacity: isSending ? 0.7 : 1,
        }}
      >
        {/* 添付コンテキスト */}
        {context.length > 0 && (
          <ul
            aria-label="添付されたコンテキスト"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: '10px 12px 0',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            {context.map((c) => (
              <li
                key={c.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--void-bg-3, #2d2d30)',
                  border: '1px solid var(--void-border, #383838)',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 11,
                  color: 'var(--void-fg-1, #ccc)',
                }}
              >
                <span>{c.label}</span>
                {onRemoveContext && (
                  <button
                    type="button"
                    aria-label={`${c.label} を添付から外す`}
                    onClick={() => onRemoveContext(c.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--void-fg-3, #666)',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 1,
                      fontSize: 12,
                    }}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* H2: プレビュー or 編集 */}
        {previewing ? (
          <div
            role="group"
            aria-label="送信内容の確認"
            style={{ padding: '12px 14px' }}
          >
            <div
              style={{
                fontSize: 11,
                color: 'var(--void-fg-3, #666)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              送信内容のプレビュー
            </div>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                color: 'var(--void-fg-1, #ccc)',
                fontSize: 14,
                lineHeight: 1.5,
                maxHeight: 240,
                overflow: 'auto',
                padding: 8,
                background: 'var(--void-bg-main, #181818)',
                border: '1px solid var(--void-border, #383838)',
                borderRadius: 6,
              }}
            >
              {text}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 10,
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={backToEdit}
                aria-label="編集に戻る (Esc)"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--void-border, #383838)',
                  color: 'var(--void-fg-1, #ccc)',
                  padding: '6px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                修正する
              </button>
              <button
                type="button"
                onClick={goPreviewOrSubmit}
                aria-label="この内容で送信する"
                disabled={!canSend}
                style={{
                  background: canSend
                    ? 'var(--void-accent, #007acc)'
                    : 'var(--void-accent-disabled, rgba(0,122,204,0.4))',
                  border: 'none',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: 6,
                  cursor: canSend ? 'pointer' : 'not-allowed',
                }}
              >
                送信する
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              padding: '10px 12px',
            }}
          >
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              aria-label="チャット入力"
              aria-invalid={!!disableReason}
              aria-describedby={`${disableReason ? reasonId : ''} ${counterId}`.trim()}
              disabled={isSending}
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--void-fg-1, #ccc)',
                fontFamily: 'inherit',
                fontSize: 14,
                resize: 'none',
                minHeight: 24,
                maxHeight: 200,
                lineHeight: 1.5,
              }}
            />
            <button
              type="button"
              onClick={goPreviewOrSubmit}
              disabled={!canSend}
              aria-label={
                enablePreview
                  ? '送信前プレビューを開く (Enter)'
                  : 'メッセージ送信 (Enter)'
              }
              aria-disabled={!canSend}
              title={disableReason ?? '送信 (Enter)'}
              style={{
                background: canSend
                  ? 'var(--void-accent, #007acc)'
                  : 'var(--void-accent-disabled, rgba(0,122,204,0.4))',
                border: 'none',
                color: '#fff',
                borderRadius: 6,
                padding: '6px 12px',
                cursor: canSend ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSending ? '…' : '送信'}
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--void-fg-3, #666)',
        }}
      >
        <span>Shift + Enter で改行 / Enter で{enablePreview ? 'プレビュー' : '送信'}</span>
        <span
          id={counterId}
          aria-live="polite"
          style={{
            color:
              text.length > maxLength
                ? 'var(--void-error, #f48771)'
                : 'var(--void-fg-3, #666)',
          }}
        >
          {text.length} / {maxLength}
        </span>
      </div>
    </div>
  );
};

export default ChatInput;
