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
  ActivityIndicator,
} from 'react-native';

/**
 * AIChatSidebar
 * Minimal テーマのサイドバー用 AI チャット UI。
 *  - 余白・細字・モノトーン＋1アクセントカラー
 *  - 角丸ピル型入力、円形送信ボタン
 *  - 空状態のウェルカム表示
 *  - 末尾自動スクロール
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
}

export interface AIChatSidebarProps {
  messages?: ChatMessage[];
  isLoading?: boolean;
  title?: string;
  placeholder?: string;
  onSend?: (text: string) => void | Promise<void>;
  onClose?: () => void;
}

const COLORS = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  border: '#ECECEC',
  text: '#111111',
  subtext: '#6B7280',
  muted: '#9CA3AF',
  accent: '#111111',
  accentText: '#FFFFFF',
  bubbleUser: '#111111',
  bubbleUserText: '#FFFFFF',
  bubbleAi: '#F3F4F6',
  bubbleAiText: '#111111',
  online: '#10B981',
};

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
  messages = [],
  isLoading = false,
  title = 'AI Assistant',
  placeholder = 'Message AI…',
  onSend,
  onClose,
}) => {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const canSend = useMemo(
    () => input.trim().length > 0 && !sending && !isLoading,
    [input, sending, isLoading]
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !onSend) return;
    try {
      setSending(true);
      setInput('');
      await onSend(text);
    } finally {
      setSending(false);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true })
      );
    }
  }, [input, onSend]);

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyBadge}>
        <Text style={styles.emptyBadgeText}>AI</Text>
      </View>
      <Text style={styles.emptyTitle}>How can I help?</Text>
      <Text style={styles.emptyHint}>
        Ask anything. Short and clear questions work best.
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.statusDot} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close chat"
          >
            <Text style={styles.closeIcon}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.divider} />

      {/* Messages */}
      <ScrollView
        ref={(r) => {
          scrollRef.current = r;
        }}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          messages.length === 0 && styles.scrollContentEmpty,
        ]}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          renderEmpty()
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))
        )}

        {isLoading ? (
          <View style={styles.typingRow}>
            <View style={styles.typingBubble}>
              <TypingDots />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Composer */}
      <View style={styles.composerWrap}>
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={placeholder}
            placeholderTextColor={COLORS.muted}
            style={styles.input}
            multiline
            maxLength={4000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (canSend) handleSend();
            }}
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendBtn,
              !canSend && styles.sendBtnDisabled,
              pressed && canSend && styles.sendBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {sending ? (
              <ActivityIndicator size="small" color={COLORS.accentText} />
            ) : (
              <Text style={styles.sendIcon}>↑</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.footerHint}>
          AI may produce inaccurate information.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

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
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
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
          {message.content}
        </Text>
      </View>
    </View>
  );
};

const TypingDots: React.FC = () => {
  return (
    <View style={styles.dotsRow}>
      <View style={[styles.dot, { opacity: 0.3 }]} />
      <View style={[styles.dot, { opacity: 0.6 }]} />
      <View style={[styles.dot, { opacity: 0.9 }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  header: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 as unknown as number,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.online,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 20,
    lineHeight: 20,
    color: COLORS.subtext,
    marginTop: -2,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10 as unknown as number,
  },
  scrollContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.subtext,
    textAlign: 'center',
  },

  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAi: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 2,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.text,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
  },
  bubbleUser: {
    backgroundColor: COLORS.bubbleUser,
    borderBottomRightRadius: 6,
  },
  bubbleAi: {
    backgroundColor: COLORS.bubbleAi,
    borderBottomLeftRadius: 6,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: COLORS.bubbleUserText,
  },
  bubbleTextAi: {
    color: COLORS.bubbleAiText,
  },

  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  typingBubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.bubbleAi,
    borderRadius: 16,
    borderBottomLeftRadius: 6,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.subtext,
    marginHorizontal: 2,
  },

  composerWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 44,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.text,
    paddingVertical: 8,
    paddingRight: 8,
    maxHeight: 120,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  sendBtnPressed: {
    opacity: 0.8,
  },
  sendIcon: {
    color: COLORS.accentText,
    fontSize: 16,
    fontWeight: '700',
    marginTop: -1,
  },

  footerHint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.muted,
  },
});

export default AIChatSidebar;
