import React from 'react';
import type { ContextRef } from './types';

/**
 * H2: send-preview chips rendered above the textarea.
 * Shows what will actually be sent so the user can confirm/remove before commit.
 * Unlike a modal, this is always visible so there is no "extra click" cost.
 */
export interface SendPreviewProps {
  items: ContextRef[];
  onRemove?: (id: string) => void;
  disabled?: boolean;
}

const iconFor = (kind: ContextRef['kind']) => {
  if (kind === 'range') {
    return (
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M2 4a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V4zm2-1a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V4a1 1 0 00-1-1H4zm3.75 2a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5zm0 3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5zm0 3a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z"
      />
    );
  }
  return (
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M3.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.854-1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.75.75 0 01-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1z"
    />
  );
};

export const SendPreview: React.FC<SendPreviewProps> = ({ items, onRemove, disabled }) => {
  if (!items.length) return null;
  return (
    <div
      role="list"
      aria-label="送信対象のコンテキスト"
      style={{
        display: 'flex',
        gap: 8,
        padding: '10px 14px 0 14px',
        flexWrap: 'wrap',
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="listitem"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--void-bg-3)',
            border: '1px solid var(--void-border-main)',
            padding: '4px 8px',
            borderRadius: 12,
            fontSize: 11,
            color: 'var(--void-fg-1)',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
            {iconFor(item.kind)}
          </svg>
          <span>
            {item.label}
            {item.detail ? ` · ${item.detail}` : ''}
          </span>
          {onRemove && (
            <button
              type="button"
              aria-label={`${item.label} をコンテキストから外す`}
              onClick={() => onRemove(item.id)}
              disabled={disabled}
              className="void-focus-ring"
              style={{
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: 'var(--void-fg-3)',
                background: 'transparent',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                padding: 2,
                borderRadius: '50%',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"
                />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
