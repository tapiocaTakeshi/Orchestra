import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { chatTheme } from '../../theme/chatTheme';

export type ChatRole = 'user' | 'ai';

export interface ChatMessageProps {
  role: ChatRole;
  text: string;
  time?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, text, time }) => {
  const isUser = role === 'user';

  return (
    <View
      style={[
        styles.row,
        { justifyContent: isUser ? 'flex-end' : 'flex-start' },
      ]}
    >
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
      )}

      <View style={{ maxWidth: '78%' }}>
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAi,
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              { color: isUser ? chatTheme.colors.bubbleUserText : chatTheme.colors.bubbleAiText },
            ]}
          >
            {text}
          </Text>
        </View>
        {time ? (
          <Text
            style={[
              styles.time,
              { textAlign: isUser ? 'right' : 'left' },
            ]}
          >
            {time}
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
    marginVertical: chatTheme.spacing.xs,
    paddingHorizontal: chatTheme.spacing.md,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: chatTheme.radius.pill,
    backgroundColor: chatTheme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: chatTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: chatTheme.spacing.sm,
  },
  avatarText: {
    fontSize: chatTheme.typography.tiny,
    fontWeight: '600',
    color: chatTheme.colors.textPrimary,
    letterSpacing: 0.5,
  },
  bubble: {
    paddingHorizontal: chatTheme.spacing.md,
    paddingVertical: chatTheme.spacing.sm + 2,
    borderRadius: chatTheme.radius.lg,
  },
  bubbleUser: {
    backgroundColor: chatTheme.colors.bubbleUser,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: chatTheme.colors.bubbleAi,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: chatTheme.typography.body,
    lineHeight: 20,
  },
  time: {
    marginTop: 2,
    fontSize: chatTheme.typography.tiny,
    color: chatTheme.colors.textMuted,
    paddingHorizontal: 4,
  },
});

export default ChatMessage;
