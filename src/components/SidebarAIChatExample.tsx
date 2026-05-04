import React, { useState } from 'react';
import { View } from 'react-native';
import AIChatSidebar, { ChatMessage } from './AIChatSidebar';

export const SidebarAIChatExample: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);

  const handleSend = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setThinking(true);

    // ダミー応答（実 API に差し替え可）
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: 'assistant',
          content: 'なるほど、確認しました。続けて教えてください。',
          createdAt: Date.now(),
        },
      ]);
      setThinking(false);
    }, 800);
  };

  return (
    <View style={{ width: 360, height: '100%' }}>
      <AIChatSidebar
        messages={messages}
        isThinking={thinking}
        onSend={handleSend}
      />
    </View>
  );
};

export default SidebarAIChatExample;
