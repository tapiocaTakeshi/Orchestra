import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { chatTheme, ChatMessageItem } from './theme';

interface Props {
  message: ChatMessageItem;
}

const formatTime = (ts: number) => {
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

      <View style={styles.bubbleColumn}>
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
            {message.content}
          </Text>
        </View>
        <Text
          style={[
            styles.time,
            isUser ? styles.timeRight : styles.timeLeft,
          ]}
        >
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: chatTheme.spacing.md,
    gap: chatTheme.spacing.sm,
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
    borderRadius: chatTheme.radius.pill,
    backgroundColor: chatTheme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: chatTheme.colors.accent,
  },
  bubbleColumn: {
    maxWidth: '78%',
  },
  bubble: {
    paddingHorizontal: chatTheme.spacing.md,
    paddingVertical: chatTheme.spacing.sm + 2,
    borderRadius: chatTheme.radius.lg,
  },
  bubbleUser: {
    backgroundColor: chatTheme.colors.bubbleUser,
    borderBottomRightRadius: chatTheme.radius.sm,
  },
  bubbleAssistant: {
    backgroundColor: chatTheme.colors.bubbleAssistant,
    borderBottomLeftRadius: chatTheme.radius.sm,
  },
  text: {
    fontSize: chatTheme.font.body,
    lineHeight: 20,
  },
  textUser: {
    color: chatTheme.colors.bubbleUserText,
  },
  textAssistant: {
    color: chatTheme.colors.bubbleAssistantText,
  },
  time: {
    fontSize: chatTheme.font.tiny,
    color: chatTheme.colors.textMuted,
    marginTop: 4,
  },
  timeLeft: {
    textAlign: 'left',
    marginLeft: 4,
  },
  timeRight: {
    textAlign: 'right',
    marginRight: 4,
  },
});

export default ChatMessage;
