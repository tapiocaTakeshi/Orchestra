import React, { useState } from 'react';
import './sidebar-chat.css';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { ChatInput } from './ChatInput';
import { ToolCall } from './ToolCall';
import type {
  ChatMessage,
  ChatThread,
  ContextRef,
  DisableInfo,
} from './types';

/**
 * Top-level SidebarChat container.
 *
 * This is the composition point required by planner's "Phase 1":
 *   - ChatHistoryPanel (H4 visibility)
 *   - Message list (H3 tool folding embedded)
 *   - ChatInput  (H1 inline disable reason, H2 send-preview)
 *
 * The component is state-agnostic on purpose — the real Void extension is
 * expected to pass `threads` / `messages` / `externalDisable` from its own
 * store. The demo defaults let Storybook / webview render it standalone.
 */
export interface SidebarChatProps {
  threads?: ChatThread[];
  activeThreadId?: string | null;
  messages?: ChatMessage[];
  attachedContexts?: ContextRef[];
  externalDisable?: DisableInfo | null;
  onSelectThread?: (id: string) => void;
  onNewChat?: () => void;
  onRemoveContext?: (id: string) => void;
  onSend?: (text: string, contexts: ContextRef[]) => void;
}

const demoThreads: ChatThread[] = [
  { id: 't1', title: 'Sidebar UI Improvements', lastUpdated: Date.now(), messageCount: 3 },
  { id: 't2', title: 'Debug AST Parser Leak', lastUpdated: Date.now() - 2 * 3600_000, messageCount: 12 },
];

export const SidebarChat: React.FC<SidebarChatProps> = ({
  threads = demoThreads,
  activeThreadId = demoThreads[0]?.id ?? null,
  messages = [],
  attachedContexts = [],
  externalDisable = null,
  onSelectThread = () => {},
  onNewChat = () => {},
  onRemoveContext,
  onSend = () => {},
}) => {
  const [activeId, setActiveId] = useState<string | null>(activeThreadId);

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: 'var(--void-bg-main)',
        color: 'var(--void-fg-1)',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontSize: 13,
      }}
    >
      <ChatHistoryPanel
        threads={threads}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          onSelectThread(id);
        }}
        onNewChat={onNewChat}
      />

      <section
        aria-label="チャット本文"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          background: 'var(--void-bg-main)',
        }}
      >
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {messages.map((msg) => (
            <MessageBlock key={msg.id} message={msg} />
          ))}
        </div>

        <ChatInput
          contexts={attachedContexts}
          onRemoveContext={onRemoveContext}
          onSend={onSend}
          externalDisable={externalDisable}
        />
      </section>
    </div>
  );
};

/* ---------------- Message rendering (H3 / H4 visual rhythm) ---------------- */

const MessageBlock: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <article
      aria-label={isUser ? 'ユーザーの発言' : 'アシスタントの発言'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 800,
        width: '100%',
        margin: '0 auto',
        paddingBottom: 16,
        borderBottom: '1px solid var(--void-border-main)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
        <div
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#fff',
            fontWeight: 'bold',
            background: isUser ? 'var(--void-accent)' : '#512bc3',
          }}
        >
          {isUser ? 'U' : 'V'}
        </div>
        <span>{isUser ? 'User' : 'Void'}</span>
      </header>

      <div style={{ paddingLeft: 34, lineHeight: 1.6, color: 'var(--void-fg-1)' }}>
        {message.contexts?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {message.contexts.map((c) => (
              <span
                key={c.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--void-bg-2)',
                  border: '1px solid var(--void-border-main)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  color: 'var(--void-fg-2)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {c.label}
                {c.detail ? ` · ${c.detail}` : ''}
              </span>
            ))}
          </div>
        ) : null}

        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.content}</p>

        {message.tools?.map((t) => (
          <ToolCall key={t.id} tool={t} />
        ))}
      </div>
    </article>
  );
};

export default SidebarChat;
