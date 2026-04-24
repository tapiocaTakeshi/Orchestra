import React from 'react';
import { describeBlockReason, type SendBlockReason } from './types';

interface Props {
  reason: SendBlockReason | null;
  /** Error 系は赤 / それ以外は warn 系に切り替える */
  severity?: 'warn' | 'error';
}

/**
 * H1 / 案4 — 「なぜ送れないか」と「次にどうすれば送れるか」をインライン表示する。
 * aria-live="polite" でスクリーンリーダにも即時通知（searcher A11y 指針）。
 */
export const DisableReason: React.FC<Props> = ({ reason, severity }) => {
  if (!reason) return null;

  const isError =
    severity === 'error' ||
    reason.kind === 'network-error' ||
    reason.kind === 'too-long';

  const color = isError ? 'var(--void-error)' : 'var(--void-warning)';
  const bg = isError ? 'var(--void-error-bg)' : 'var(--void-warning-bg)';

  return (
    <div
      id="sidebarchat-input-error"
      role="alert"
      aria-live="polite"
      className="flex items-center gap-2 px-3 py-2 text-xs rounded-md border"
      style={{
        color,
        backgroundColor: bg,
        borderColor: color,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
        style={{ flexShrink: 0, fill: 'currentColor' }}
      >
        <path
          fillRule="evenodd"
          d="M8.22 1.754a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zM6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM9 11a1 1 0 11-2 0 1 1 0 012 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z"
        />
      </svg>
      <span>{describeBlockReason(reason)}</span>
    </div>
  );
};
