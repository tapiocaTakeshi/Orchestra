import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import styles from './SidebarChat.module.css';

import {
  ChatMessage,
  ChatStatus,
  STATUS_LABELS,
  Suggestion,
} from './types';
import { classifyError } from './classifyError';
import { useInputValidation } from './useInputValidation';

export interface SidebarChatProps {
  /** メッセージを送信する実処理。失敗時は throw すること。 */
  onSend: (text: string, signal: AbortSignal) => Promise<string>;
  initialMessages?: ChatMessage[];
  suggestions?: Suggestion[];
  /** autocomplete 用の ghost 候補を返す関数（任意） */
  getGhostSuggestion?: (text: string) => string | null;
  title?: string;
  onClose?: () => void;
  onClear?: () => void;
}

const genId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const SidebarChat: React.FC<SidebarChatProps> = ({
  onSend,
  initialMessages = [],
  suggestions = [],
  getGhostSuggestion,
  title = 'Orchestra AI',
  onClose,
  onClear,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const validation = useInputValidation(input);
  const errorId = useId();
  const counterId = useId();

  // ---- 履歴への自動スクロール ---------------------------------------------
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // ---- aria-live 通知（成功/失敗/生成中） ---------------------------------
  useEffect(() => {
    const el = liveRegionRef.current;
    if (!el) return;
    el.textContent = STATUS_LABELS[status];
  }, [status]);

  // ---- textarea 高さ自動調整 ---------------------------------------------
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);
  useEffect(autoResize, [input, autoResize]);

  // ---- 送信処理 -----------------------------------------------------------
  const submit = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || status === 'sending' || status === 'generating') return;

      const userMsg: ChatMessage = {
        id: genId(),
        role: 'user',
        content: text,
        status: 'pending',
        createdAt: Date.now(),
      };
      const pendingAssistantId = genId();
      const pendingMsg: ChatMessage = {
        id: pendingAssistantId,
        role: 'assistant',
        content: '',
        status: 'pending',
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, pendingMsg]);
      setInput('');
      setStatus('sending');

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setStatus('generating');
        const reply = await onSend(text, controller.signal);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id
              ? { ...m, status: 'delivered' }
              : m.id === pendingAssistantId
              ? { ...m, content: reply, status: 'delivered' }
              : m,
          ),
        );
        setStatus('success');
      } catch (err) {
        const chatError = classifyError(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id
              ? { ...m, status: 'failed', error: chatError }
              : m.id === pendingAssistantId
              ? { ...m, status: 'failed', error: chatError }
              : m,
          ),
        );
        // 入力内容の破棄防止：失敗時は入力欄に戻す
        setInput((cur) => (cur ? cur : text));
        setStatus('error');
      } finally {
        abortRef.current = null;
      }
    },
    [onSend, status],
  );

  // ---- 再送 ---------------------------------------------------------------
  const retryLast = useCallback(() => {
    // 直近の失敗した user メッセージを再送
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    // 失敗メッセージ群を削除してから再送
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === lastUser.id);
      return idx >= 0 ? prev.slice(0, idx) : prev;
    });
    void submit(lastUser.content);
  }, [messages, submit]);

  // ---- 停止 ---------------------------------------------------------------
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ---- キーバインド -------------------------------------------------------
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab で ghost 候補を採用
    if (e.key === 'Tab' && ghost) {
      e.preventDefault();
      setInput((cur) => cur + ghost);
      return;
    }
    // Enter で送信、Shift+Enter で改行
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (validation.canSubmit) void submit(input);
    }
  };

  // ---- Ghost 候補 ---------------------------------------------------------
  const ghost = getGhostSuggestion ? getGhostSuggestion(input) : null;

  const busy = status === 'sending' || status === 'generating';
  const hasError = status === 'error';
  const lastError = [...messages]
    .reverse()
    .find((m) => m.status === 'failed' && m.error)?.error;

  return (
    <aside className={styles.sidebar} aria-label="AI アシスタント">
      {/* ---- ヘッダー ---------------------------------------------------- */}
      <header className={styles.header}>
        <div className={styles.title}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round"
               strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {title}
        </div>
        <div className={styles.actions}>
          {onClear && (
            <button className={styles.iconBtn} onClick={onClear}
                    aria-label="チャットをクリア" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
          {onClose && (
            <button className={styles.iconBtn} onClick={onClose}
                    aria-label="サイドバーを閉じる" type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* ---- 履歴 -------------------------------------------------------- */}
      <div ref={historyRef} className={styles.history} role="log"
           aria-live="polite" aria-relevant="additions">
        {messages.map((m) => (
          <MessageItem key={m.id} message={m} onRetry={retryLast} />
        ))}
        {status === 'generating' && (
          <div className={`${styles.messageGroup} ${styles.bot}`}>
            <div className={`${styles.bubble} ${styles.sendingBubble}`}
                 role="status">
              <Spinner />
              応答を生成中…
            </div>
          </div>
        )}
      </div>

      {/* ---- スクリーンリーダー通知 ------------------------------------- */}
      <div ref={liveRegionRef} className={styles.srOnly}
           aria-live="polite" role="status" />

      {/* ---- 入力エリア -------------------------------------------------- */}
      <div className={styles.inputContainer}>
        {suggestions.length > 0 && (
          <div className={styles.chips} role="toolbar"
               aria-label="入力候補">
            {suggestions.map((s) => (
              <button key={s.id} type="button" className={styles.chip}
                      onClick={() => setInput((cur) =>
                        cur ? `${cur} ${s.insertText ?? s.label}` : (s.insertText ?? s.label),
                      )}>
                {s.icon === 'search' ? <SearchIcon /> : <FileIcon />}
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div
          className={`${styles.inputWrapper} ${hasError ? styles.inputError : ''}`}
        >
          <div className={styles.inputInner}>
            {ghost && (
              <div className={styles.ghost} aria-hidden="true">
                <span className={styles.ghostPrefix}>{input}</span>
                {ghost}
                <span className={styles.tabHint}>⇥ Tab</span>
              </div>
            )}
            <label htmlFor="sidebarchat-input" className={styles.srOnly}>
              メッセージを入力
            </label>
            <textarea
              id="sidebarchat-input"
              ref={textareaRef}
              className={styles.textarea}
              value={input}
              placeholder="メッセージを入力…  (Enter で送信 / Shift+Enter で改行)"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy}
              aria-invalid={validation.isOverLimit || hasError}
              aria-describedby={`${counterId} ${hasError ? errorId : ''}`.trim()}
              rows={1}
            />
          </div>

          {busy ? (
            <button type="button" className={styles.stopBtnInline}
                    onClick={stop} aria-label="生成を停止">
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              className={styles.sendBtn}
              onClick={() => submit(input)}
              disabled={!validation.canSubmit}
              aria-label={STATUS_LABELS.idle}
              title={validation.canSubmit ? '送信 (Enter)' : validation.reason}
            >
              <SendIcon />
            </button>
          )}
        </div>

        {/* 文字数カウンタ（aria-describedby の参照先） */}
        <div id={counterId} className={styles.counter}
             data-warn={validation.remaining < 200 ? 'true' : 'false'}
             data-over={validation.isOverLimit ? 'true' : 'false'}>
          {validation.isOverLimit
            ? `上限を ${(-validation.remaining).toLocaleString()} 文字超えています`
            : `残り ${validation.remaining.toLocaleString()} 文字`}
        </div>

        {/* 状態バー */}
        <div className={styles.statusBar}>
          <div className={styles.statusLeft}>
            {busy && <span className={styles.dotFlashing} aria-hidden="true" />}
            <span>{STATUS_LABELS[status]}</span>
          </div>
          {busy && (
            <button type="button" className={styles.stopBtn} onClick={stop}>
              <StopIcon />
              停止
            </button>
          )}
          {hasError && lastError?.retryable && (
            <button type="button" className={styles.retryInline}
                    onClick={retryLast}>
              <RetryIcon />
              再送
            </button>
          )}
        </div>

        {/* aria-describedby で紐付けるエラー文言 */}
        {hasError && lastError && (
          <div id={errorId} className={styles.errorHint} role="alert">
            {lastError.userMessage}
            {lastError.requestId && (
              <span className={styles.reqId}> (ID: {lastError.requestId})</span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

/* ========================================================================
 * サブコンポーネント
 * ====================================================================== */

const MessageItem: React.FC<{
  message: ChatMessage;
  onRetry: () => void;
}> = ({ message, onRetry }) => {
  const isUser = message.role === 'user';
  const isFailed = message.status === 'failed' && message.error;

  if (isFailed && message.error) {
    return (
      <div className={`${styles.messageGroup} ${styles.bot}`}>
        <div className={styles.errorCard} role="alert">
          <div className={styles.errorHeader}>
            <AlertIcon />
            {labelForCategory(message.error.category)}
          </div>
          <div className={styles.errorBody}>
            {message.error.userMessage}
            {message.error.detail && (
              <details className={styles.errorDetails}>
                <summary>技術的な詳細</summary>
                <pre>{message.error.detail}</pre>
              </details>
            )}
          </div>
          {message.error.retryable && (
            <div className={styles.errorActions}>
              <button type="button" className={styles.btnRetry}
                      onClick={onRetry}>
                <RetryIcon />
                再送する
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.messageGroup} ${isUser ? styles.user : styles.bot}`}>
      <div className={styles.bubble}>
        {message.content || (message.status === 'pending' ? '…' : '')}
      </div>
      {message.status === 'pending' && (
        <span className={styles.metaBadge} aria-label="送信中">送信中</span>
      )}
    </div>
  );
};

function labelForCategory(c: string): string {
  switch (c) {
    case 'network': return 'ネットワークエラー';
    case 'timeout': return 'タイムアウト';
    case 'auth': return '認証エラー';
    case 'validation': return '入力エラー';
    case 'server': return 'サーバーエラー';
    case 'tool': return 'ツール実行エラー';
    default: return 'エラー';
  }
}

/* ---- アイコン群（インライン SVG） ------------------------------------ */
const Spinner = () => (
  <svg className={styles.spinner} width="16" height="16" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
       strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round"
       strokeLinejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const StopIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"
       aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" />
  </svg>
);
const RetryIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round"
       strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round"
       strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);
const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round"
       strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const FileIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round"
       strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export default SidebarChat;
