import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ChatInput from './ChatInput';
import MessageBubble, { ChatMessage } from './MessageBubble';
import TypingDots from './TypingDots';
import { chatTheme } from './theme';

interface Props {
  /** 任意。AI 応答ハンドラを差し替え可能 */
  onAskAI?: (text: string, history: ChatMessage[]) => Promise<string>;
  /** 任意。タイトル */
  title?: string;
  /** 任意。初期メッセージ */
  initialMessages?: ChatMessage[];
}

const DEFAULT_GREETING: ChatMessage = {
  id: 'sys-greet',
  role: 'assistant',
  content: 'こんにちは。何かお手伝いできることはありますか？',
  createdAt: Date.now(),
};

const SUGGESTIONS = [
  '今日のタスクを要約',
  'アイデアを膨らませて',
  '英語に翻訳',
];

/**
 * Sidebar 内の AI チャット。Minimal デザイン。
 */
export const AIChat: React.FC<Props> = ({
  onAskAI,
  title = 'AI Assistant',
  initialMessages,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages && initialMessages.length > 0 ? initialMessages : [DEFAULT_GREETING],
  );
  const [pending, setPending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, pending, scrollToEnd]);

  const fakeAI = useCallback(async (text: string): Promise<string> => {
    // フォールバック: シンプルなエコー応答
    await new Promise(r => setTimeout(r, 600));
    return `「${text}」について考えています…まずは要点を3つに整理しましょう。`;
  }, []);

  const send = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        createdAt: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);
      setPending(true);
      try {
        const responder = onAskAI ?? ((t: string) => fakeAI(t));
        const reply = await responder(text, [...messages, userMsg]);
        const aiMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: reply,
          createdAt: Date.now(),
        };
        setMessages(prev => [...prev, aiMsg]);
      } catch (e) {
        setMessages(prev => [
          ...prev,
          {
            id: `a-err-${Date.now()}`,
            role: 'assistant',
            content: '応答の取得に失敗しました。もう一度お試しください。',
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setPending(false);
      }
    },
    [fakeAI, messages, onAskAI],
  );

  const clear = useCallback(() => {
    setMessages([{ ...DEFAULT_GREETING, id: `sys-${Date.now()}`, createdAt: Date.now() }]);
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.statusDot} />
          <Text style={styles.title}>{title}</Text>
        </View>
        <TouchableOpacity onPress={clear} accessibilityLabel="Clear conversation" hitSlop={8}>
          <Text style={styles.clearBtn}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
        ListFooterComponent={
          pending ? (
            <View style={styles.typingWrap}>
              <View style={styles.typingBubble}>
                <TypingDots />
              </View>
            </View>
          ) : null
        }
      />

      {/* Suggestion chips (only when conversation is fresh) */}
      {messages.length <= 1 && !pending && (
        <View style={styles.suggestions}>
          {SUGGESTIONS.map(s => (
            <TouchableOpacity
              key={s}
              style={styles.chip}
              activeOpacity={0.7}
              onPress={() => send(s)}
            >
              <Text style={styles.chipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ChatInput onSend={send} disabled={pending} />
    </KeyboardAvoidingView>
  );
};

const __unused_styles = (null as unknown) as any; /* moved to AIChat.styles.ts */
const __legacy = StyleSheet => StyleSheet?.create?.({
  container: {
    flex: 1,
    backgroundColor: chatTheme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: chatTheme.spacing.lg,
    paddingVertical: chatTheme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: chatTheme.colors.border,
    backgroundColor: chatTheme.colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: chatTheme.colors.online,
    marginRight: chatTheme.spacing.sm,
  },
  title: {
    fontSize: chatTheme.typography.title,
    fontWeight: '600',
    color: chatTheme.colors.text,
    letterSpacing: 0.2,
  },
  clearBtn: {
    fontSize: chatTheme.typography.caption,
    color: chatTheme.colors.textMuted,
  },
  listContent: {
    paddingTop: chatTheme.spacing.lg,
    paddingBottom: chatTheme.spacing.sm,
    flexGrow: 1,
  },
  typingWrap: {
    paddingHorizontal: chatTheme.spacing.md,
    marginBottom: chatTheme.spacing.lg,
    alignItems: 'flex-start',
  },
  typingBubble: {
    paddingHorizontal: chatTheme.spacing.md,
    paddingVertical: chatTheme.spacing.sm,
    backgroundColor: chatTheme.colors.surface,
    borderRadius: chatTheme.radius.lg,
    borderBottomLeftRadius: 6,
    marginLeft: 34, // align with assistant bubbles (avatar offset)
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: chatTheme.spacing.md,
    paddingBottom: chatTheme.spacing.sm,
  },
  chip: {
    paddingHorizontal: chatTheme.spacing.md,
    paddingVertical: chatTheme.spacing.sm,
    backgroundColor: chatTheme.colors.surface,
    borderRadius: chatTheme.radius.pill,
    marginRight: chatTheme.spacing.sm,
    marginBottom: chatTheme.spacing.sm,
  },
  chipText: {
    fontSize: chatTheme.typography.caption,
    color: chatTheme.colors.text,
  },
});

export default AIChat;
