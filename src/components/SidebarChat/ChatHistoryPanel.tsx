import React from 'react';
import type { ChatThread } from './types';

/**
 * H4: history visibility.
 * - active thread is marked by left accent border + background change (not just color)
 * - meta line (time / message count) gives scan-ability
 * - list items are real <button>s so keyboard & screen-reader navigation works
 */
export interface ChatHistoryPanelProps {
  threads: ChatThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

const formatRelative = (ts: number): string => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
};

export const ChatHistoryPanel: React.FC<ChatHistoryPanelProps> = ({
  threads,
  activeId,
  onSelect,
  onNewChat,
}) => {
  return (
    <aside
      aria-label="チャット履歴"
      style={{
        width: 240,
        borderRight: '1px solid var(--void-border-main)',
        background: 'var(--void-bg-main)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--void-border-main)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 11,
            textTransform: 'uppercase',
            color: 'var(--void-fg-2)',
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}
        >
          Chat History
        </h2>
        <button
          type="button"
          onClick={onNewChat}
          aria-label="新しいチャットを開始"
          title="新しいチャット"
          className="void-focus-ring"
          style={{
            background: 'transparent',
            border: '1px solid var(--void-border-main)',
            color: 'var(--void-fg-1)',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 010 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z"
            />
          </svg>
        </button>
      </header>

      <div
        role="list"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {threads.map((t) => {
          const active = t.id === activeId;
          return (
            <button
              key={t.id}
              type="button"
              role="listitem"
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(t.id)}
              className="void-focus-ring"
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                textAlign: 'left',
                background: active ? 'var(--void-bg-2)' : 'transparent',
                border: active ? '1px solid var(--void-border-main)' : '1px solid transparent',
                borderLeft: active ? '3px solid var(--void-accent)' : '3px solid transparent',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--void-fg-1)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: 500,
                }}
              >
                {t.title}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--void-fg-3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{formatRelative(t.lastUpdated)}</span>
                <span>{t.messageCount} msgs</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
