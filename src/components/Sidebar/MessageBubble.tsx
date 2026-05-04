import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { chatColors, chatSpacing, chatRadius, chatTypography } from './theme';

export type ChatRole = 'user' | 'ai';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number; // unix ms
};

type Props = {
  message: ChatMessage;
};

const formatTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const Avatar: React.FC<{ role: ChatRole }> = ({ role }) => {
  const isUser = role === 'user';
  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: isUser ? chatColors.surfaceMuted : chatColors.accent,
          borderColor: isUser ? chatColors.border : chatColors.accent,
        },
      ]}
    >
      <Text
        style={[
          styles.avatarText,
          { color: isUser ? chatColors.textPrimary : chatColors.textOnAccent },
        ]}
      >
        {isUser ? 'You' : 'AI'}
      </Text>
    </View>
  );
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
      {!isUser && <Avatar role="ai" />}

      <View
        style={[
          styles.bubbleWrap,
          { alignItems: isUser ? 'flex-end' : 'flex-start' },
        ]}
      >
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAI,
          ]}
        >
          <Text
            style={[
              chatTypography.body,
              { color: isUser ? chatColors.userBubbleText : chatColors.aiBubbleText },
            ]}
          >
            {message.content}
          </Text>
        </View>
        {message.createdAt ? (
          <Text style={styles.timestamp}>{formatTime(message.createdAt)}</Text>
        ) : null}
      </View>

      {isUser && <Avatar role="user" />}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: chatSpacing.md,
    gap: chatSpacing.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: chatRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bubbleWrap: {
    maxWidth: '78%',
    flexShrink: 1,
  },
  bubble: {
    paddingHorizontal: chatSpacing.md,
    paddingVertical: chatSpacing.sm + 2,
    borderRadius: chatRadius.lg,
  },
  bubbleUser: {
    backgroundColor: chatColors.userBubble,
    borderBottomRightRadius: chatRadius.sm,
  },
  bubbleAI: {
    backgroundColor: chatColors.aiBubble,
    borderBottomLeftRadius: chatRadius.sm,
  },
  timestamp: {
    ...chatTypography.meta,
    color: chatColors.textMuted,
    marginTop: 4,
    marginHorizontal: 4,
  },
});

export default MessageBubble;
