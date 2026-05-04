import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { chatTheme as t } from '../../theme/chatTheme';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
}

interface Props {
  message: ChatMessage;
  onCopy?: (content: string) => void;
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const MessageBubble: React.FC<Props> = ({ message, onCopy }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
      )}
      <View style={[styles.bubbleColumn, isUser ? styles.alignRight : styles.alignLeft]}>
        <View style={styles.metaRow}>
          <Text style={styles.roleLabel}>{isUser ? 'あなた' : 'AI アシスタント'}</Text>
          <Text style={styles.timeLabel}>{formatTime(message.createdAt)}</Text>
        </View>
        <Pressable
          onLongPress={() => onCopy?.(message.content)}
          style={({ pressed }) => [
            styles.bubble,
            isUser ? styles.userBubble : styles.aiBubble,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.text, isUser ? styles.userText : styles.aiText]}>
            {message.content}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: t.space.lg,
    alignItems: 'flex-end',
  },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  alignLeft: { alignItems: 'flex-start' },
  alignRight: { alignItems: 'flex-end' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: t.space.sm,
    marginBottom: 18,
  },
  avatarText: {
    color: t.color.accentText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bubbleColumn: {
    maxWidth: '82%',
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  roleLabel: {
    fontSize: t.font.xs,
    color: t.color.textMuted,
    fontWeight: '600',
  },
  timeLabel: {
    fontSize: t.font.xs,
    color: t.color.textSubtle,
  },
  bubble: {
    paddingVertical: t.space.md,
    paddingHorizontal: t.space.lg,
    borderRadius: t.radius.lg,
  },
  userBubble: {
    backgroundColor: t.color.userBubble,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: t.color.aiBubble,
    borderBottomLeftRadius: 4,
  },
  pressed: { opacity: 0.85 },
  text: {
    fontSize: t.font.md,
    lineHeight: 20,
  },
  userText: { color: t.color.userBubbleText },
  aiText: { color: t.color.aiBubbleText },
  systemWrap: {
    alignSelf: 'center',
    paddingVertical: t.space.xs,
    paddingHorizontal: t.space.md,
    backgroundColor: t.color.surfaceAlt,
    borderRadius: t.radius.pill,
    marginBottom: t.space.md,
  },
  systemText: {
    fontSize: t.font.xs,
    color: t.color.textMuted,
  },
});

export default MessageBubble;
