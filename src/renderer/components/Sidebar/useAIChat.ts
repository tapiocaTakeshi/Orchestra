import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, ChatStatus, ThinkingStep } from './types';

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface SendOptions {
  onStream?: (text: string) => void;
}

/**
 * Electron の preload で window.api.chat.send / onChunk が露出している前提。
 * 露出していない場合はモックでストリーミング動作を再現する。
 */
declare global {
  interface Window {
    api?: {
      chat?: {
        send?: (
          payload: { messages: ChatMessage[] },
          handlers: {
            onThinking?: (step: ThinkingStep) => void;
            onChunk?: (delta: string) => void;
            onDone?: () => void;
            onError?: (msg: string) => void;
          }
        ) => { abort: () => void };
      };
    };
  }
}

export function useAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const abortRef = useRef<{ abort: () => void } | null>(null);

  const updateLast = useCallback(
    (updater: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        next[next.length - 1] = updater(next[next.length - 1]);
        return next;
      });
    },
    []
  );

  const sendMessage = useCallback(
    async (text: string, _opts?: SendOptions) => {
      const trimmed = text.trim();
      if (!trimmed || status === 'thinking' || status === 'streaming') return;

      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      };
      const assistantMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        status: 'thinking',
        thinking: [],
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStatus('thinking');

      const api = window.api?.chat?.send;

      if (api) {
        const handle = api(
          { messages: [...messages, userMsg, assistantMsg] },
          {
            onThinking: (step) => {
              updateLast((m) => ({
                ...m,
                thinking: [...(m.thinking || []), step],
              }));
            },
            onChunk: (delta) => {
              setStatus('streaming');
              updateLast((m) => ({
                ...m,
                status: 'streaming',
                content: m.content + delta,
              }));
            },
            onDone: () => {
              setStatus('done');
              updateLast((m) => ({ ...m, status: 'done' }));
              abortRef.current = null;
            },
            onError: (msg) => {
              setStatus('error');
              updateLast((m) => ({ ...m, status: 'error', error: msg }));
              abortRef.current = null;
            },
          }
        );
        abortRef.current = handle;
        return;
      }

      // ---- モック: API が無い環境でもフローを体験できる ----
      const mockSteps: ThinkingStep[] = [
        { id: uid(), label: '入力を解析中', state: 'active' },
        { id: uid(), label: '関連コンテキストを検索', state: 'pending' },
        { id: uid(), label: '回答を生成', state: 'pending' },
      ];
      let aborted = false;
      abortRef.current = {
        abort: () => {
          aborted = true;
          setStatus('stopped');
          updateLast((m) => ({ ...m, status: 'stopped' }));
        },
      };

      for (let i = 0; i < mockSteps.length; i++) {
        if (aborted) return;
        const steps = mockSteps.map((s, idx) => ({
          ...s,
          state:
            idx < i ? 'done' : idx === i ? 'active' : 'pending',
        })) as ThinkingStep[];
        updateLast((m) => ({ ...m, thinking: steps }));
        await new Promise((r) => setTimeout(r, 450));
      }

      if (aborted) return;
      setStatus('streaming');
      const reply =
        'これはサンプル応答です。実際の Electron 側 IPC (window.api.chat.send) を接続すると、ここにストリーミングで本物の回答が流れます。';
      for (const ch of reply) {
        if (aborted) return;
        await new Promise((r) => setTimeout(r, 12));
        updateLast((m) => ({
          ...m,
          status: 'streaming',
          content: m.content + ch,
        }));
      }
      if (aborted) return;
      updateLast((m) => ({
        ...m,
        status: 'done',
        thinking: (m.thinking || []).map((s) => ({ ...s, state: 'done' })),
      }));
      setStatus('done');
      abortRef.current = null;
    },
    [messages, status, updateLast]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clear = useCallback(() => {
    if (status === 'thinking' || status === 'streaming') return;
    setMessages([]);
    setStatus('idle');
  }, [status]);

  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    // 直近の assistant エラーメッセージを取り除く
    setMessages((prev) => {
      const next = [...prev];
      while (
        next.length > 0 &&
        next[next.length - 1].role === 'assistant'
      ) {
        next.pop();
      }
      return next;
    });
    setTimeout(() => sendMessage(lastUser.content), 0);
  }, [messages, sendMessage]);

  return { messages, status, sendMessage, stop, clear, retry };
}
