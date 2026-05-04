import { useCallback, useRef, useState } from 'react';

export enum ChatPhase {
  Idle = 'idle',
  Composing = 'composing',
  Sending = 'sending',
  Responding = 'responding',
  Done = 'done',
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

/**
 * Electron preload で window.api.chat.send(prompt, onChunk) を提供している前提。
 * 提供されていない環境ではモック応答にフォールバックするので、UI 側で動作確認可能。
 */
declare global {
  interface Window {
    api?: {
      chat?: {
        send: (
          prompt: string,
          onChunk: (chunk: string) => void,
          signal?: AbortSignal
        ) => Promise<string>;
      };
    };
  }
}

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const useAIChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>(ChatPhase.Idle);
  const [input, setInputState] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const setInput = useCallback((v: string) => {
    setInputState(v);
    setPhase((prev) => {
      if (prev === ChatPhase.Sending || prev === ChatPhase.Responding) {
        return prev;
      }
      if (v.trim().length === 0) return ChatPhase.Idle;
      return ChatPhase.Composing;
    });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setInputState('');
    setPhase(ChatPhase.Idle);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase(ChatPhase.Done);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputState('');
    setPhase(ChatPhase.Sending);

    const assistantId = uid();
    const ac = new AbortController();
    abortRef.current = ac;

    const onChunk = (chunk: string) => {
      setPhase(ChatPhase.Responding);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        if (idx === -1) {
          return [
            ...prev,
            {
              id: assistantId,
              role: 'assistant',
              content: chunk,
              createdAt: Date.now(),
            },
          ];
        }
        const next = [...prev];
        next[idx] = { ...next[idx], content: next[idx].content + chunk };
        return next;
      });
    };

    try {
      if (window.api?.chat?.send) {
        await window.api.chat.send(text, onChunk, ac.signal);
      } else {
        // モックフォールバック：1 文字ずつ流す
        const mock =
          'これはモック応答です。Electron の preload で window.api.chat.send を実装すると本物の応答に置き換わります。';
        for (const ch of mock) {
          if (ac.signal.aborted) break;
          await new Promise((r) => setTimeout(r, 18));
          onChunk(ch);
        }
      }
      setPhase(ChatPhase.Done);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            content:
              '⚠ エラーが発生しました: ' + ((err as Error).message ?? '不明'),
            createdAt: Date.now(),
          },
        ]);
      }
      setPhase(ChatPhase.Done);
    } finally {
      abortRef.current = null;
    }
  }, [input]);

  const isBusy =
    phase === ChatPhase.Sending || phase === ChatPhase.Responding;

  return {
    messages,
    phase,
    input,
    setInput,
    send,
    cancel,
    reset,
    isBusy,
  };
};
