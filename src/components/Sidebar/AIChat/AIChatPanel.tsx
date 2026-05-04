import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import ChatHeader from './ChatHeader';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';
import EmptyState from './EmptyState';
import { chatTheme, ChatMessageItem } from './theme';

interface Props {
  /** Optional: provide an async resolver to plug in your backend. */
  onAsk?: (prompt: string) => Promise<string>;
  initialMessages?: ChatMessageItem[];
}

const fallbackResolver = async (prompt: string): Promise<string> => {
  // Default mock so the UI is fully functional out-of-the-box.
  await new Promise((r) => setTimeout(r, 700));
  return `「${prompt}」について承知しました。詳しく考えてみますね。`;
};

let _id = 0;
const nextId = () => `m_${Date.now()}_${++_id}`;

export const AIChatPanel: React.FC<Props> = ({
  onAsk,
  initialMessages = [],
}) => {
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMessages);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: ChatMessageItem = {
        id: nextId(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);
      scrollToEnd();

      try {
        const resolver = onAsk ?? fallbackResolver;
        const reply = await resolver(text);
        const assistantMsg: ChatMessageItem = {
          id: nextId(),
          role: 'assistant',
          content: reply,
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            content: '通信に失敗しました。もう一度お試しください。',
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setIsTyping(false);
        scrollToEnd();
      }
    },
    [onAsk, scrollToEnd],
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setIsTyping(false);
  }, []);

  const isEmpty = messages.length === 0 && !isTyping;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ChatHeader onNewChat={handleNewChat} />

      {isEmpty ? (
        <EmptyState onPickSuggestion={handleSend} />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={scrollToEnd}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
          {isTyping && <TypingIndicator />}
        </ScrollView>
      )}

      <ChatInput onSend={handleSend} disabled={isTyping} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: chatTheme.colors.background,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: chatTheme.spacing.lg,
    paddingBottom: chatTheme.spacing.sm,
  },
});

export default AIChatPanel;
