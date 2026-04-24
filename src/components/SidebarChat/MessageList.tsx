import React, { useEffect, useMemo, useRef } from 'react';

export type MessageRole = 'user' | 'assistant' | 'system' | 'error';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: React.ReactNode;
  /** ISO string or Date */
  timestamp?: string | Date;
}

export interface MessageListProps {
  messages: ChatMessage[];
  /** フォーカス中のメッセージ id（外部管理） */
  focusedId?: string | null;
  onFocusMessage?: (id: string) => void;
  /** 新規メッセージ到着時の自動スクロール */
  autoScroll?: boolean;
}

const formatDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

const formatDateLabel = (d: Date): string => {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (formatDateKey(d) === formatDateKey(today)) return '今日';
  if (formatDateKey(d) === formatDateKey(y)) return '昨日';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * H4: 履歴視認性（日付セパレータ / 役割ごとの差別化 / フォーカスリング）
 */
export const MessageList: React.FC<MessageListProps> = ({
  messages,
  focusedId,
  onFocusMessage,
  autoScroll = true,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, autoScroll]);

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const d = m.timestamp
        ? m.timestamp instanceof Date
          ? m.timestamp
          : new Date(m.timestamp)
        : new Date();
      const key = formatDateKey(d);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(m);
      } else {
        groups.push({ key, label: formatDateLabel(d), items: [m] });
      }
    }
    return groups;
  }, [messages]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {grouped.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <div
            role="separator"
            aria-label={`日付区切り: ${g.label}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              margin: '4px 0 12px',
              color: 'var(--void-fg-3, #666)',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            <span
              style={{
                flex: 1,
                height: 1,
                background: 'var(--void-border, #383838)',
              }}
              aria-hidden="true"
            />
            <span>{g.label}</span>
            <span
              style={{
                flex: 1,
                height: 1,
                background: 'var(--void-border, #383838)',
              }}
              aria-hidden="true"
            />
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {g.items.map((m) => {
              const focused = focusedId === m.id;
              const bg =
                m.role === 'user'
                  ? 'var(--void-bg-2, #242424)'
                  : m.role === 'error'
                    ? 'var(--void-error-bg, rgba(244,135,113,0.1))'
                    : 'transparent';
              const accent =
                m.role === 'user'
                  ? 'var(--void-accent, #007acc)'
                  : m.role === 'error'
                    ? 'var(--void-error, #f48771)'
                    : '#512bc3';
              return (
                <li
                  key={m.id}
                  tabIndex={0}
                  role="article"
                  aria-label={`${m.role === 'user' ? 'ユーザー' : m.role === 'assistant' ? 'アシスタント' : m.role} のメッセージ`}
                  onFocus={() => onFocusMessage?.(m.id)}
                  onClick={() => onFocusMessage?.(m.id)}
                  style={{
                    background: bg,
                    border: `1px solid ${
                      focused
                        ? 'var(--void-border-focus, #007acc)'
                        : 'transparent'
                    }`,
                    borderLeft: `3px solid ${accent}`,
                    borderRadius: 6,
                    padding: '10px 12px',
                    marginBottom: 10,
                    outline: 'none',
                    boxShadow: focused
                      ? '0 0 0 2px var(--void-border-focus, #007acc)'
                      : 'none',
                    transition:
                      'box-shadow 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <header
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: 'var(--void-fg-2, #999)',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        background: accent,
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {m.role === 'user'
                        ? 'U'
                        : m.role === 'assistant'
                          ? 'V'
                          : '!'}
                    </span>
                    <strong style={{ color: 'var(--void-fg-1, #ccc)' }}>
                      {m.role === 'user'
                        ? 'You'
                        : m.role === 'assistant'
                          ? 'Void'
                          : m.role === 'error'
                            ? 'Error'
                            : 'System'}
                    </strong>
                    {m.timestamp && (
                      <time
                        dateTime={
                          m.timestamp instanceof Date
                            ? m.timestamp.toISOString()
                            : m.timestamp
                        }
                        style={{
                          marginLeft: 'auto',
                          fontSize: 11,
                          color: 'var(--void-fg-3, #666)',
                        }}
                      >
                        {(m.timestamp instanceof Date
                          ? m.timestamp
                          : new Date(m.timestamp)
                        ).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    )}
                  </header>
                  <div
                    style={{
                      color: 'var(--void-fg-1, #ccc)',
                      lineHeight: 1.6,
                      fontSize: 13,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.content}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;
