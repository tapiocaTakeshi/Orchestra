import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { sidebarTheme as t } from './theme';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessageProps {
  role: ChatRole;
  content: string;
  timestamp?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, content, timestamp }) => {
  const isUser = role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser && (
        <View style={styles.avatar}>
          <View style={styles.avatarDot} />
        </View>
      )}

      <View style={[styles.bubbleWrap, isUser && styles.bubbleWrapUser]}>
        <Text style={styles.roleLabel}>
          {isUser ? 'You' : 'AI Assistant'}
          {timestamp ? <Text style={styles.timestamp}>  ·  {timestamp}</Text> : null}
        </Text>
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
          ]}
        >
          <Text style={styles.content}>{content}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: t.spacing.lg,
    gap: t.spacing.sm,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAssistant: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  avatarDot: {
    width: 6,
    height: 6,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
  },
  bubbleWrap: {
    flexShrink: 1,
    maxWidth: '88%',
  },
  bubbleWrapUser: {
    alignItems: 'flex-end',
  },
  roleLabel: {
    fontSize: t.font.micro,
    color: t.colors.textSubtle,
    marginBottom: t.spacing.xs,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  timestamp: {
    color: t.colors.textSubtle,
    textTransform: 'none',
    letterSpacing: 0,
  },
  bubble: {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm + 2,
    borderRadius: t.radius.lg,
  },
  bubbleUser: {
    backgroundColor: t.colors.bubbleUser,
    borderTopRightRadius: t.radius.sm,
  },
  bubbleAssistant: {
    backgroundColor: t.colors.bubbleAssistant,
    paddingHorizontal: 0,
    paddingVertical: 2,
  },
  content: {
    fontSize: t.font.body,
    lineHeight: 20,
    color: t.colors.text,
  },
});

export default ChatMessage;
