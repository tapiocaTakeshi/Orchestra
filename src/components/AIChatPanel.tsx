import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
} from 'react-native';

/**
 * AIChatPanel
 * - サイドバーに組み込む Minimal デザインの AI チャット UI。
 * - 親コンポーネント側で width 等を制御してください（例: 320）。
 */

export type ChatMessage = {
  id: string;
  role: 'ai' | 'user';
  text: string;
  createdAt?: number;
};

type Props = {
  style?: StyleProp<ViewStyle>;
  /** 外部から会話履歴を制御したい場合に使用（未指定なら内部 state） */
  messages?: ChatMessage[];
  onSend?: (text: string) => void | Promise<void>;
  /** 「考え中…」表示用 */
  loading?: boolean;
  /** ヘッダーのアシスタント名 */
  assistantName?: string;
  /** クイックプロンプト（チップ） */
  suggestions?: string[];
};

const DEFAULT_SUGGESTIONS = [
  '今日のタスクを要約して',
  'このページの使い方を教えて',
  'バグの原因を一緒に考えて',
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'ai',
    text: 'こんにちは！何かお手伝いできることはありますか？下のチップから選ぶか、自由に質問してください。',
  },
];

export const AIChatPanel: React.FC<Props> = ({
  style,
  messages: messagesProp,
  onSend,
  loading: loadingProp,
  assistantName = 'AI アシスタント',
  suggestions = DEFAULT_SUGGESTIONS,
}) => {
  const [internalMessages, setInternalMessages] =
    useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [internalLoading, setInternalLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const messages = messagesProp ?? internalMessages;
  const loading = loadingProp ?? internalLoading;

  const canSend = input.trim().length > 0 && !loading;

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');

    if (onSend) {
      await onSend(text);
    } else {
      // 簡易ローカルエコー（外部ハンドラ未指定時のデモ）
      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        text,
        createdAt: Date.now(),
      };
      setInternalMessages((prev) => [...prev, userMsg]);
      setInternalLoading(true);
      setTimeout(() => {
        const aiMsg: ChatMessage = {
          id: `a_${Date.now()}`,
          role: 'ai',
          text: 'ご質問ありがとうございます。内容を確認しています…',
          createdAt: Date.now(),
        };
        setInternalMessages((prev) => [...prev, aiMsg]);
        setInternalLoading(false);
        requestAnimationFrame(() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        );
      }, 700);
    }
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true })
    );
  }, [input, loading, onSend]);

  const handleSuggestion = (s: string) => {
    setInput(s);
  };

  const headerSubtitle = useMemo(
    () => (loading ? '入力中…' : 'オンライン'),
    [loading]
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, style]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {assistantName}
          </Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: loading ? '#F5A524' : '#22C55E' },
              ]}
            />
            <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {loading ? <TypingIndicator /> : null}
      </ScrollView>

      {/* Suggestions */}
      {messages.length <= 1 && suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable
              key={s}
              onPress={() => handleSuggestion(s)}
              style={({ pressed }) => [
                styles.chip,
                pressed && styles.chipPressed,
              ]}
            >
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Composer */}
      <View style={styles.composerWrap}>
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="メッセージを入力..."
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            multiline
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="送信"
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendBtn,
              !canSend && styles.sendBtnDisabled,
              pressed && canSend && styles.sendBtnPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.sendIcon}>↑</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.hint}>Enter で送信 / Shift+Enter で改行</Text>
      </View>
    </KeyboardAvoidingView>
  );
};

/* -------------------- Sub Components -------------------- */

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <View
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAi,
      ]}
    >
      {!isUser && (
        <View style={styles.miniAvatar}>
          <Text style={styles.miniAvatarText}>AI</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAi,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            isUser ? styles.bubbleTextUser : styles.bubbleTextAi,
          ]}
        >
          {message.text}
        </Text>
      </View>
    </View>
  );
};

const TypingIndicator: React.FC = () => {
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowAi]}>
      <View style={styles.miniAvatar}>
        <Text style={styles.miniAvatarText}>AI</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleAi, styles.typingBubble]}>
        <View style={styles.typingDot} />
        <View style={[styles.typingDot, { opacity: 0.6 }]} />
        <View style={[styles.typingDot, { opacity: 0.3 }]} />
      </View>
    </View>
  );
};

/* -------------------- Styles -------------------- */

const COLORS = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  border: '#ECECEC',
  text: '#111111',
  subText: '#6B7280',
  accent: '#111111',
  userBubble: '#111111',
  aiBubble: '#F5F5F5',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.subText,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  /* Messages */
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '100%',
  },
  bubbleRowAi: {
    justifyContent: 'flex-start',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleAi: {
    backgroundColor: COLORS.aiBubble,
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: COLORS.userBubble,
    borderTopRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextAi: {
    color: COLORS.text,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.subText,
  },
  /* Suggestions */
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipPressed: {
    backgroundColor: '#F0F0F0',
  },
  chipText: {
    fontSize: 12,
    color: COLORS.text,
  },
  /* Composer */
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: COLORS.bg,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    maxHeight: 120,
    paddingVertical: 8,
    paddingRight: 4,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: -1,
  },
  hint: {
    marginTop: 6,
    marginLeft: 14,
    fontSize: 10,
    color: COLORS.subText,
  },
});

export default AIChatPanel;
