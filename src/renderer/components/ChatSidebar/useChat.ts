import { useCallback, useState } from 'react';

export type ChatRole = 'user' | 'assistant';
export type ChatStatus = 'idle' | 'thinking' | 'streaming' | 'error';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Electron preload で公開された window.electronAPI.chat.send があればそれを呼び、
 * 無ければモック応答を返す。既存実装に合わせて差し替え可能。
 */
async function callBackend(prompt: string, history: ChatMessage[]): Promise<string> {
  // @ts-expect-error - preload で公開された API
  const api = typeof window !== 'undefined' ? window.electronAPI?.chat?.send : undefined;
  if (typeof api === 'function') {
    const res = await api({ prompt, history });
    if (typeof res === 'string') return res;
    if (res && typeof res.content === 'string') return res.content;
    return JSON.stringify(res);
  }
  // モック（バックエンド未接続時のフォールバック）
  await new Promise((r) => setTimeout(r, 600));
  return `（デモ応答）"${prompt}" に関する回答をここに表示します。`;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const runAssistant = useCallback(
    async (prompt: string, history: ChatMessage[]) => {
      setStatus('thinking');
      setError(null);
      try {
        const content = await callBackend(prompt, history);
        const reply: ChatMessage = {
          id: uid(),
          role: 'assistant',
          content,
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, reply]);
        setStatus('idle');
      } catch (e) {
        setError(e instanceof Error ? e.message : '応答の取得に失敗しました');
        setStatus('error');
      }
    },
    [],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      };
      setMessages((prev) => {
        const next = [...prev, userMsg];
        // 履歴を渡してバックエンドへ
        void runAssistant(trimmed, next);
        return next;
      });
    },
    [runAssistant],
  );

  const regenerate = useCallback(
    (assistantId: string) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        if (idx < 0) return prev;
        // 直前のユーザー発話を探す
        let userPrompt = '';
        for (let i = idx - 1; i >= 0; i--) {
          if (prev[i].role === 'user') {
            userPrompt = prev[i].content;
            break;
          }
        }
        const next = prev.slice(0, idx);
        if (userPrompt) {
          void runAssistant(userPrompt, next);
        }
        return next;
      });
    },
    [runAssistant],
  );

  const clear = useCallback(() => {
    setMessages([]);
    setStatus('idle');
    setError(null);
  }, []);

  return { messages, status, error, send, regenerate, clear };
}
