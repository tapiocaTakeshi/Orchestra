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
 * Minimal-styled AI chat panel for the sidebar.
 *
 * Design principles:
 *  - Generous whitespace, no heavy bubbles or shadows
 *  - Hairline dividers (1px) to express hierarchy
 *  - Neutral monochrome palette + a single subtle accent
 *  - Role is shown as a small uppercase label, not as a colored bubble
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
}

export interface SidebarAIChatProps {
  title?: string;
  status?: string;
  initialMessages?: ChatMessage[];
  placeholder?: string;
  onSend?: (text: string) => Promise<string | void> | string | void;
}

const MINIMAL = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  border: '#ECECEC',
  borderStrong: '#DDDDDD',
  text: '#111111',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  accent: '#111111',
  accentSoft: '#F2F2F2',
};

const formatTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
};

export const SidebarAIChat: React.FC<SidebarAIChatProps> = ({
  title = 'AI Assistant',
  status = 'Online',
  initialMessages,
  placeholder = 'Message AI…',
  onSend,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? [
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Hi. How can I help you today?',
        createdAt: Date.now(),
      },
    ],
  );
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const canSend = useMemo(
    () => draft.trim().length > 0 && !sending,
    [draft, sending],
  );

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft('');
    setSending(true);
    scrollToEnd();

    try {
      const reply = await Promise.resolve(onSend?.(text));
      const replyText =
        typeof reply === 'string' && reply.length > 0
          ? reply
          : 'Got it. (Connect onSend to wire your model.)';
      const aiMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: replyText,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `e_${Date.now()}`,
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
      scrollToEnd();
    }
  }, [draft, sending, onSend, scrollToEnd]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <View style={styles.avatarDot} />
          </View>
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText} numberOfLines={1}>
                {status}
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New chat"
          hitSlop={8}
          onPress={() =>
            setMessages([
              {
                id: `w_${Date.now()}`,
                role: 'assistant',
                content: 'New conversation. What would you like to do?',
                createdAt: Date.now(),
              },
            ])
          }
          style={({ pressed }) => [
            styles.iconBtn,
            pressed && { backgroundColor: MINIMAL.accentSoft },
          ]}
        >
          <Text style={styles.iconBtnGlyph}>+</Text>
        </Pressable>
      </View>

      <View style={styles.hairline} />

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={scrollToEnd}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        {sending && (
          <View style={styles.typingRow}>
            <Text style={styles.roleLabel}>AI</Text>
            <View style={styles.typingInner}>
              <ActivityIndicator size="small" color={MINIMAL.textMuted} />
              <Text style={styles.typingText}>Thinking…</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Composer */}
      <View style={styles.composerWrap}>
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={MINIMAL.textFaint}
            style={styles.input}
            multiline
            maxLength={4000}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            returnKeyType="send"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!canSend}
            onPress={handleSend}
            style={({ pressed }) => [
              styles.sendBtn,
              !canSend && styles.sendBtnDisabled,
              pressed && canSend && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                styles.sendGlyph,
                !canSend && { color: MINIMAL.textFaint },
              ]}
            >
              ↑
            </Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          AI may produce inaccurate information.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const MessageRow: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <View style={styles.msgRow}>
      <View style={styles.msgHead}>
        <Text style={styles.roleLabel}>{isUser ? 'You' : 'AI'}</Text>
        {message.createdAt ? (
          <Text style={styles.timeLabel}>{formatTime(message.createdAt)}</Text>
        ) : null}
      </View>
      <View
        style={[
          styles.msgBody,
          isUser ? styles.msgBodyUser : styles.msgBodyAI,
        ]}
      >
        <Text style={styles.msgText}>{message.content}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: MINIMAL.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: MINIMAL.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MINIMAL.surface,
  },
  avatarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: MINIMAL.text,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: MINIMAL.text,
    letterSpacing: 0.1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    color: MINIMAL.textMuted,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: MINIMAL.border,
    backgroundColor: MINIMAL.bg,
  },
  iconBtnGlyph: {
    fontSize: 16,
    lineHeight: 18,
    color: MINIMAL.text,
    fontWeight: '500',
  },

  hairline: {
    height: 1,
    backgroundColor: MINIMAL.border,
    width: '100%',
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  msgRow: {
    marginBottom: 18,
  },
  msgHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  roleLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: MINIMAL.textMuted,
  },
  timeLabel: {
    fontSize: 10,
    color: MINIMAL.textFaint,
    marginLeft: 8,
  },
  msgBody: {
    paddingLeft: 10,
    borderLeftWidth: 2,
  },
  msgBodyUser: {
    borderLeftColor: MINIMAL.accent,
  },
  msgBodyAI: {
    borderLeftColor: MINIMAL.borderStrong,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 21,
    color: MINIMAL.text,
  },

  // Typing
  typingRow: {
    marginTop: 4,
    marginBottom: 18,
  },
  typingInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: MINIMAL.borderStrong,
  },
  typingText: {
    marginLeft: 8,
    fontSize: 13,
    color: MINIMAL.textMuted,
  },

  // Composer
  composerWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: MINIMAL.border,
    backgroundColor: MINIMAL.bg,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: MINIMAL.borderStrong,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: MINIMAL.bg,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: MINIMAL.text,
    paddingVertical: 8,
    paddingRight: 8,
    maxHeight: 120,
    minHeight: 36,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: MINIMAL.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: MINIMAL.accentSoft,
  },
  sendGlyph: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  hint: {
    marginTop: 8,
    fontSize: 10,
    color: MINIMAL.textFaint,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});

export default SidebarAIChat;
