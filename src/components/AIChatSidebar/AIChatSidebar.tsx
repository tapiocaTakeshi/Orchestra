import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from './theme';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import ChatInput from './ChatInput';
import type { AIChatSidebarProps, Message } from './types';

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const defaultWelcome = (): Message[] => [
  {
    id: uid(),
    role: 'assistant',
    content: 'Hi — how can I help today?',
    createdAt: Date.now(),
  },
];

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
  initialMessages,
  onSend,
  title = 'AI Assistant',
  online = true,
}) => {
  const [messages, setMessages] = useState<Message[]>(
    initialMessages && initialMessages.length > 0
      ? initialMessages
      : defaultWelcome(),
  );
  const [pending, setPending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      const userMsg: Message = {
        id: uid(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);
      setPending(true);
      scrollToEnd();

      try {
        const reply = onSend
          ? await onSend(text)
          : `You said: "${text}"`;
        const aiMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: typeof reply === 'string' ? reply : '…',
          createdAt: Date.now(),
        };
        setMessages(prev => [...prev, aiMsg]);
      } catch (e) {
        setMessages(prev => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            content: 'Something went wrong. Please try again.',
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setPending(false);
        scrollToEnd();
      }
    },
    [onSend, scrollToEnd],
  );

  const handleClear = useCallback(() => {
    setMessages(defaultWelcome());
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <MessageBubble message={item} />,
    [],
  );

  const keyExtractor = useCallback((m: Message) => m.id, []);

  const ListFooter = useMemo(
    () => (pending ? <TypingIndicator /> : <View style={{ height: spacing.sm }} />),
    [pending],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.brandDot}>
              <Text style={styles.brandDotText}>AI</Text>
            </View>
            <View>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: online ? colors.online : colors.textMuted },
                  ]}
                />
                <Text style={styles.statusText}>
                  {online ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={handleClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear conversation"
            style={({ pressed }) => [
              styles.clearBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.clearLabel}>Clear</Text>
          </Pressable>
        </View>

        {/* Hairline separator */}
        <View style={styles.divider} />

        {/* Messages */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={ListFooter}
            onContentSizeChange={scrollToEnd}
            showsVerticalScrollIndicator={false}
          />

          <ChatInput onSubmit={handleSubmit} disabled={pending} />
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  brandDot: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandDotText: {
    color: colors.accentOn,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  clearBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  clearLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  listContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
});

export default AIChatSidebar;
