import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from './theme';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
}

interface Props {
  message: ChatMessage;
}

const formatTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const MessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <View
      style={[
        styles.row,
        { justifyContent: isUser ? 'flex-end' : 'flex-start' },
      ]}
    >
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarLabel}>AI</Text>
        </View>
      )}

      <View style={{ maxWidth: '78%' }}>
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
          ]}
        >
          <Text
            style={[
              typography.body,
              isUser ? styles.textUser : styles.textAssistant,
            ]}
          >
            {message.content}
          </Text>
        </View>
        {message.createdAt ? (
          <Text
            style={[
              styles.time,
              { textAlign: isUser ? 'right' : 'left' },
            ]}
          >
            {formatTime(message.createdAt)}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.5,
  },
  bubble: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleUser: {
    backgroundColor: colors.accent,
    borderTopRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 4,
  },
  textUser: {
    color: colors.accentText,
  },
  textAssistant: {
    color: colors.text,
  },
  time: {
    ...typography.caption,
    marginTop: 4,
    paddingHorizontal: 4,
  },
});

export default MessageBubble;
