import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ChatBubble from './sidebar/ChatBubble';
import TypingDots from './sidebar/TypingDots';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

export type SidebarAIChatProps = {
  title?: string;
  initialMessages?: ChatMessage[];
  onSend?: (text: string) => Promise<string> | string;
  placeholder?: string;
  online?: boolean;
};

const SUGGESTIONS = [
  'このページを要約して',
  'TODO を整理して',
  '次にやることを提案',
];

const SidebarAIChat: React.FC<SidebarAIChatProps> = ({
  title = 'AI Assistant',
  initialMessages,
  onSend,
  placeholder = 'メッセージを入力…',
  online = true,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? [
      {
        id: 'welcome',
        role: 'assistant',
        content: 'こんにちは。気軽に質問してください。',
        createdAt: Date.now(),
      },
    ],
  );
  const [draft, setDraft] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const canSend = useMemo(() => draft.trim().length > 0 && !isTyping, [draft, isTyping]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const handleSend = useCallback(
    async (raw?: string) => {
      const text = (raw ?? draft).trim();
      if (!text || isTyping) return;

      const userMsg: ChatMessage = {
        id: `${Date.now()}-u`,
        role: 'user',
        content: text,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setDraft('');
      setIsTyping(true);
      scrollToEnd();

      try {
        const reply = onSend ? await onSend(text) : '（デモ）受け取りました。';
        const aiMsg: ChatMessage = {
          id: `${Date.now()}-a`,
          role: 'assistant',
          content: typeof reply === 'string' ? reply : '...',
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-e`,
            role: 'assistant',
            content: '通信エラーが発生しました。もう一度お試しください。',
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setIsTyping(false);
        scrollToEnd();
      }
    },
    [draft, isTyping, onSend, scrollToEnd],
  );

  const showSuggestions = messages.length <= 1 && !isTyping;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AI</Text>
          </View>
          <View>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: online ? '#10B981' : '#9CA3AF' },
                ]}
              />
              <Text style={styles.statusText}>
                {online ? 'オンライン' : 'オフライン'}
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          hitSlop={8}
          onPress={() =>
            setMessages([
              {
                id: 'welcome',
                role: 'assistant',
                content: '新しい会話を始めましょう。',
                createdAt: Date.now(),
              },
            ])
          }
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityLabel="新しい会話"
        >
          <Text style={styles.iconBtnText}>＋</Text>
        </Pressable>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={scrollToEnd}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m) => (
          <ChatBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {isTyping && (
          <View style={styles.typingWrap}>
            <TypingDots />
          </View>
        )}

        {showSuggestions && (
          <View style={styles.suggestionsWrap}>
            <Text style={styles.suggestionsLabel}>例えば</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => handleSend(s)}
                  style={({ pressed }) => [
                    styles.suggestionChip,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Composer */}
      <View style={styles.composerWrap}>
        <View
          style={[
            styles.composer,
            isFocused && styles.composerFocused,
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            multiline
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onSubmitEditing={() => handleSend()}
            blurOnSubmit={false}
          />
          <Pressable
            disabled={!canSend}
            onPress={() => handleSend()}
            style={({ pressed }) => [
              styles.sendBtn,
              !canSend && styles.sendBtnDisabled,
              pressed && canSend && styles.pressed,
            ]}
            accessibilityLabel="送信"
          >
            <Text
              style={[
                styles.sendIcon,
                !canSend && styles.sendIconDisabled,
              ]}
            >
              ↑
            </Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>Enter で送信 ・ Shift + Enter で改行</Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#E5E7EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
    letterSpacing: 0.2,
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
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    color: '#6B7280',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F8',
  },
  iconBtnText: {
    fontSize: 16,
    color: '#111111',
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
  },
  typingWrap: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  suggestionsWrap: {
    marginTop: 12,
    paddingHorizontal: 4,
  },
  suggestionsLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  suggestionText: {
    fontSize: 12,
    color: '#374151',
  },
  composerWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F7F7F8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  composerFocused: {
    borderColor: '#111111',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 24,
    paddingTop: Platform.OS === 'ios' ? 4 : 0,
    paddingBottom: Platform.OS === 'ios' ? 4 : 0,
    fontSize: 14,
    color: '#111111',
    lineHeight: 20,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
  sendBtnDisabled: {
    backgroundColor: '#E5E7EB',
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  sendIconDisabled: {
    color: '#9CA3AF',
  },
  hint: {
    marginTop: 6,
    fontSize: 10,
    color: '#9CA3AF',
    textAlign: 'right',
    letterSpacing: 0.3,
  },
});

export default SidebarAIChat;
