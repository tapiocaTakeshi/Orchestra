import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { chatTheme } from '../theme/chatTheme';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessageData {
  id: string;
  role: ChatRole;
  text: string;
  createdAt?: number;
}

interface Props {
  message: ChatMessageData;
}

const formatTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const ChatMessage: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <View
      style={[
        styles.row,
        isUser ? styles.rowUser : styles.rowAssistant,
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
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        <Text
          style={[
            styles.text,
            isUser ? styles.textUser : styles.textAssistant,
          ]}
        >
          {message.text}
        </Text>
        {!!message.createdAt && (
          <Text
            style={[
              styles.time,
              isUser ? styles.timeUser : styles.timeAssistant,
            ]}
          >
            {formatTime(message.createdAt)}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: chatTheme.spacing.sm,
    paddingHorizontal: chatTheme.spacing.md,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAssistant: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: chatTheme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: chatTheme.spacing.xs,
    borderWidth: 1,
    borderColor: chatTheme.colors.border,
  },
  avatarText: {
    fontSize: chatTheme.font.sizeXs,
    fontWeight: chatTheme.font.weightSemibold,
    color: chatTheme.colors.textPrimary,
    letterSpacing: 0.3,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: chatTheme.spacing.sm + 2,
    paddingVertical: chatTheme.spacing.xs + 2,
    borderRadius: chatTheme.radius.lg,
  },
  bubbleUser: {
    backgroundColor: chatTheme.colors.userBubble,
    borderTopRightRadius: chatTheme.radius.sm / 2,
  },
  bubbleAssistant: {
    backgroundColor: chatTheme.colors.assistantBubble,
    borderTopLeftRadius: chatTheme.radius.sm / 2,
  },
  text: {
    fontSize: chatTheme.font.sizeSm + 1,
    lineHeight: 20,
  },
  textUser: {
    color: chatTheme.colors.userBubbleText,
  },
  textAssistant: {
    color: chatTheme.colors.assistantBubbleText,
  },
  time: {
    marginTop: 4,
    fontSize: chatTheme.font.sizeXs - 1,
  },
  timeUser: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
  timeAssistant: {
    color: chatTheme.colors.textMuted,
    textAlign: 'left',
  },
});

export default ChatMessage;
