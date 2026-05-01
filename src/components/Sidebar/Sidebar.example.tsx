import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import AIChatPanel, { AIChatMessage } from './AIChatPanel';

/**
 * 既存 Sidebar の AI チャット領域に AIChatPanel を組み込むサンプル。
 * 既存の Sidebar.tsx がある場合は、その AI チャット表示箇所を
 * <AIChatPanel ... /> に置き換えてください。
 */
export const SidebarAIChatSection: React.FC = () => {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async (text: string) => {
    const userMsg: AIChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      // TODO: 実際の AI 呼び出しに差し替え
      await new Promise((r) => setTimeout(r, 600));
      const reply: AIChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: 'Got it. Here is a concise answer.',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, reply]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <AIChatPanel
        title="AI Assistant"
        messages={messages}
        isLoading={loading}
        onSend={handleSend}
        onNewChat={() => setMessages([])}
        online
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    width: 320,
    borderLeftWidth: 1,
    borderLeftColor: '#ECECEE',
    backgroundColor: '#FFFFFF',
  },
});

export default SidebarAIChatSection;
