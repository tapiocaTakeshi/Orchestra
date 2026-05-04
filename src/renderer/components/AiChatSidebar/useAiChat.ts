import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, ChatStatus } from './types';

/**
 * Electron renderer 側で利用するチャット状態フック。
 * preload で公開された window.aiChat を優先利用し、無ければモック挙動にフォールバックする。
 */
type AiChatBridge = {
  send: (prompt: string) => Promise<void>;
  onChunk: (cb: (chunk: { messageId: string; delta: string }) => void) => () => void;
  onStatus: (cb: (s: ChatStatus) => void) => () => void;
  onDone: (cb: (msg: ChatMessage) => void) => () => void;
  onError: (cb: (err: string) => void) => () => void;
  cancel: () => void;
};

declare global {
  interface Window {
    aiChat?: AiChatBridge;
  }
}

const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  const bridge = useMemo(() => window.aiChat, []);

  useEffect(() => {
    if (!bridge) return;
    const offChunk = bridge.onChunk(({ messageId, delta }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, content: m.content + delta } : m,
        ),
      );
    });
    const offStatus = bridge.onStatus((s) => setStatus(s));
    const offDone = bridge.onDone((msg) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
      );
      setStatus('idle');
      streamingIdRef.current = null;
    });
    const offError = bridge.onError((e) => {
      setError(e);
      setStatus('error');
    });
    return () => {
      offChunk();
      offStatus();
      offDone();
      offError();
    };
  }, [bridge]);

  const send = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      setError(null);

      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      };
      const assistantId = uid();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      };
      streamingIdRef.current = assistantId;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStatus('thinking');

      if (bridge) {
        try {
          await bridge.send(trimmed);
        } catch (e: any) {
          setError(e?.message ?? 'unknown error');
          setStatus('error');
        }
      } else {
        // フォールバック: ブリッジ未接続時のモック
        setTimeout(() => setStatus('streaming'), 400);
        const reply =
          'AIブリッジが接続されていません。preload で window.aiChat を公開してください。';
        let i = 0;
        const tick = () => {
          if (i >= reply.length) {
            setStatus('idle');
            streamingIdRef.current = null;
            return;
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + reply[i] } : m,
            ),
          );
          i += 1;
          setTimeout(tick, 18);
        };
        setTimeout(tick, 600);
      }
    },
    [bridge],
  );

  const cancel = useCallback(() => {
    bridge?.cancel?.();
    setStatus('idle');
  }, [bridge]);

  const regenerate = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    // 直近の assistant 応答を削除してから再送
    setMessages((prev) => {
      const idx = prev.map((m) => m.role).lastIndexOf('assistant');
      if (idx === -1) return prev;
      return prev.slice(0, idx);
    });
    void send(lastUser.content);
  }, [messages, send]);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    setStatus('idle');
  }, []);

  return { messages, status, error, send, cancel, regenerate, clear };
}
