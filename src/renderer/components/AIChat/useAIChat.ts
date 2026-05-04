import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, ChatSession, ChatStatus } from './types';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const newSession = (): ChatSession => ({
  id: uid(),
  title: '新しい会話',
  createdAt: Date.now(),
  messages: [],
});

/**
 * Electron preload 経由の IPC があればそれを使い、無ければモック応答を返す。
 *   window.electronAPI.chat.send({ messages }) => Promise<string>
 *   window.electronAPI.chat.stream({ messages }, onChunk) => Promise<void>
 */
async function callAI(
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  signal: AbortSignal
): Promise<void> {
  const api = (globalThis as any)?.window?.electronAPI?.chat
    ?? (globalThis as any)?.electronAPI?.chat;

  if (api?.stream) {
    await api.stream({ messages }, (delta: string) => {
      if (signal.aborted) return;
      onChunk(delta);
    });
    return;
  }

  if (api?.send) {
    const reply: string = await api.send({ messages });
    if (signal.aborted) return;
    onChunk(reply);
    return;
  }

  // フォールバック: モックのストリーミング応答
  const last = messages[messages.length - 1]?.content ?? '';
  const reply = `（モック応答）「${last.slice(0, 60)}」について理解しました。実際の AI 接続は Electron の preload 経由で window.electronAPI.chat.stream を実装してください。`;
  for (const ch of reply) {
    if (signal.aborted) return;
    await new Promise((r) => setTimeout(r, 12));
    onChunk(ch);
  }
}

export function useAIChat() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => [newSession()]);
  const [activeId, setActiveId] = useState<string>(() => sessions[0].id);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? sessions[0],
    [sessions, activeId]
  );

  const updateSession = useCallback(
    (id: string, updater: (s: ChatSession) => ChatSession) => {
      setSessions((prev) => prev.map((s) => (s.id === id ? updater(s) : s)));
    },
    []
  );

  const createSession = useCallback(() => {
    const s = newSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setStatus('idle');
    setError(null);
  }, []);

  const selectSession = useCallback((id: string) => {
    setActiveId(id);
    setError(null);
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (next.length === 0) {
          const fresh = newSession();
          setActiveId(fresh.id);
          return [fresh];
        }
        if (id === activeId) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  }, []);

  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || status === 'thinking' || status === 'streaming') return;

      setError(null);
      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
      };
      const assistantMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        pending: true,
      };

      const sessionId = active.id;
      updateSession(sessionId, (s) => ({
        ...s,
        title: s.messages.length === 0 ? text.slice(0, 24) || s.title : s.title,
        messages: [...s.messages, userMsg, assistantMsg],
      }));

      setStatus('thinking');
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        let firstChunk = true;
        await callAI(
          [...active.messages, userMsg],
          (delta) => {
            if (firstChunk) {
              firstChunk = false;
              setStatus('streaming');
            }
            updateSession(sessionId, (s) => ({
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: m.content + delta }
                  : m
              ),
            }));
          },
          ctrl.signal
        );

        updateSession(sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantMsg.id ? { ...m, pending: false } : m
          ),
        }));
        setStatus('idle');
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        setError(msg);
        setStatus('error');
        updateSession(sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, pending: false, error: msg }
              : m
          ),
        }));
      } finally {
        abortRef.current = null;
      }
    },
    [active, status, updateSession]
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    sessions,
    active,
    status,
    error,
    send,
    stop,
    createSession,
    selectSession,
    deleteSession,
  };
}
