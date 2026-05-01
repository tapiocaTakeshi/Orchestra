import React, { useCallback, useState } from 'react';
import AIChatSidebar, { ChatMessage } from './AIChatSidebar';

let _id = 0;
const nextId = () => `${Date.now()}-${++_id}`;

export const AIChatSidebarContainer: React.FC<{ onClose?: () => void }> = ({
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      // TODO: 既存の AI 呼び出し関数に差し替えてください
      await new Promise((r) => setTimeout(r, 600));
      const reply: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: 'こちらがその件についての回答です。詳しく聞きたい点はありますか？',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, reply]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AIChatSidebar
      messages={messages}
      isLoading={loading}
      onSend={handleSend}
      onClose={onClose}
    />
  );
};

export default AIChatSidebarContainer;
