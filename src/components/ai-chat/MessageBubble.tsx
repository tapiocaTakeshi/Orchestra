import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { aiChatTheme as t } from './theme';

export type ChatRole = 'user' | 'assistant' | 'system';

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
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
};

export const MessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAi]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
      )}
      <View style={styles.bubbleWrap}>
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAi,
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              isUser ? styles.bubbleUserText : styles.bubbleAiText,
            ]}
          >
            {message.content}
          </Text>
        </View>
        <Text style={[styles.time, isUser ? styles.timeRight : styles.timeLeft]}>
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: t.spacing(3),
    alignItems: 'flex-end',
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAi: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: t.spacing(2),
  },
  avatarText: {
    fontSize: t.font.xs,
    fontWeight: '700',
    color: t.color.accent,
    letterSpacing: 0.5,
  },
  bubbleWrap: {
    maxWidth: '78%',
  },
  bubble: {
    paddingHorizontal: t.spacing(3),
    paddingVertical: t.spacing(2.5),
    borderRadius: t.radius.lg,
  },
  bubbleUser: {
    backgroundColor: t.color.bubbleUser,
    borderBottomRightRadius: t.radius.sm,
  },
  bubbleAi: {
    backgroundColor: t.color.bubbleAi,
    borderBottomLeftRadius: t.radius.sm,
  },
  bubbleText: {
    fontSize: t.font.md,
    lineHeight: 20,
  },
  bubbleUserText: {
    color: t.color.bubbleUserText,
  },
  bubbleAiText: {
    color: t.color.bubbleAiText,
  },
  time: {
    fontSize: t.font.xs,
    color: t.color.textSubtle,
    marginTop: 4,
  },
  timeRight: {
    textAlign: 'right',
  },
  timeLeft: {
    textAlign: 'left',
  },
  systemRow: {
    alignItems: 'center',
    marginVertical: t.spacing(2),
  },
  systemText: {
    fontSize: t.font.xs,
    color: t.color.textSubtle,
    backgroundColor: t.color.surfaceAlt,
    paddingHorizontal: t.spacing(3),
    paddingVertical: 4,
    borderRadius: t.radius.pill,
    overflow: 'hidden',
  },
});
