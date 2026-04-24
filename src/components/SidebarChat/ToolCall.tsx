import React, { useState, useMemo, useCallback, useId } from 'react';

export type ToolCallStatus = 'running' | 'success' | 'error';

export interface ToolCallProps {
  toolName: string;
  /** 表示用の引数サマリ（例: "SidebarChat.tsx"）。折りたたみ時のラベルに表示 */
  argsSummary?: string;
  status: ToolCallStatus;
  /** 実行結果本文（長文想定） */
  result?: string;
  /** 長文判定の閾値（文字数）。これを超えたらデフォルト折りたたみ */
  longThresholdChars?: number;
  /** 長文判定の閾値（行数）。これを超えたらデフォルト折りたたみ */
  longThresholdLines?: number;
  /** 初期展開状態を外部から強制したい場合 */
  defaultOpen?: boolean;
}

/**
 * H3: tool 折りたたみ（デフォルト制御 + 状態保持 + メタ情報ラベル）
 * - 長文結果はデフォルト折りたたみ、短い/成功のみのものは展開
 * - 折りたたみ時も tool 名・成否・先頭行が見える
 * - 同一マウント中は open 状態を保持
 */
export const ToolCall: React.FC<ToolCallProps> = ({
  toolName,
  argsSummary,
  status,
  result = '',
  longThresholdChars = 400,
  longThresholdLines = 8,
  defaultOpen,
}) => {
  const lineCount = useMemo(() => result.split('\n').length, [result]);
  const isLong =
    result.length > longThresholdChars || lineCount > longThresholdLines;

  // デフォルト: 失敗 or 長文は折りたたみ、それ以外は展開
  const initialOpen =
    defaultOpen ?? (!isLong && status !== 'error');
  const [open, setOpen] = useState<boolean>(initialOpen);

  const headingId = useId();
  const regionId = useId();

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  const statusLabel =
    status === 'running'
      ? '実行中'
      : status === 'success'
        ? '成功'
        : '失敗';

  const firstLine = useMemo(() => {
    const trimmed = result.trim();
    if (!trimmed) return '';
    return trimmed.split('\n')[0].slice(0, 80);
  }, [result]);

  return (
    <div
      className="sbc-tool"
      data-status={status}
      style={{
        border: '1px solid var(--void-border, #383838)',
        borderRadius: 6,
        background: 'var(--void-bg-2, #242424)',
        margin: '8px 0',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        id={headingId}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="sbc-tool__summary"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          background: 'var(--void-bg-3, #2d2d30)',
          color: 'var(--void-fg-2, #999)',
          border: 'none',
          padding: '6px 10px',
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            transition: 'transform 0.15s ease',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            color: 'var(--void-fg-3, #666)',
            fontSize: 10,
            width: 10,
          }}
        >
          ▶
        </span>
        <span style={{ color: 'var(--void-accent, #007acc)' }}>⚙</span>
        <span style={{ color: 'var(--void-fg-1, #ccc)', fontWeight: 500 }}>
          {toolName}
        </span>
        {argsSummary && (
          <span
            style={{
              color: 'var(--void-fg-3, #666)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 180,
            }}
            title={argsSummary}
          >
            : {argsSummary}
          </span>
        )}
        {!open && firstLine && (
          <span
            style={{
              color: 'var(--void-fg-3, #666)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              fontStyle: 'italic',
            }}
            title={firstLine}
          >
            — {firstLine}
          </span>
        )}
        <span
          aria-label={`ステータス: ${statusLabel}`}
          style={{
            marginLeft: 'auto',
            color:
              status === 'success'
                ? 'var(--void-success, #89d185)'
                : status === 'error'
                  ? 'var(--void-error, #f48771)'
                  : 'var(--void-warning, #cca700)',
            fontSize: 11,
          }}
        >
          {status === 'running' ? '…' : status === 'success' ? '✓' : '✕'}
        </span>
      </button>
      <div
        id={regionId}
        role="region"
        aria-labelledby={headingId}
        hidden={!open}
        style={{
          borderTop: open ? '1px solid var(--void-border, #383838)' : 'none',
          padding: open ? '10px 12px' : 0,
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          fontSize: 11,
          color: 'var(--void-fg-2, #999)',
          whiteSpace: 'pre-wrap',
          background: '#1e1e1e',
          maxHeight: 240,
          overflow: 'auto',
        }}
      >
        {result || <em>(出力なし)</em>}
      </div>
    </div>
  );
};

export default ToolCall;
