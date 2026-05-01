import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  chatColors,
  chatRadius,
  chatSpacing,
  chatTypography,
} from '../../theme/chatTheme';

export type ChatRole = 'user' | 'assistant';

export interface MessageBubbleProps {
  role: ChatRole;
  content: string;
  timestamp?: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  role,
  content,
  timestamp,
}) => {
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
              chatTypography.body,
              { color: isUser ? chatColors.textOnAccent : chatColors.textPrimary },
            ]}
          >
            {content}
          </Text>
        </View>
        {timestamp ? (
          <Text
            style={[
              styles.timestamp,
              { textAlign: isUser ? 'right' : 'left' },
            ]}
          >
            {timestamp}
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
    marginBottom: chatSpacing.md,
    paddingHorizontal: chatSpacing.lg,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: chatColors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: chatSpacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: chatColors.border,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: chatColors.textSecondary,
    letterSpacing: 0.4,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: chatRadius.lg,
  },
  bubbleAi: {
    backgroundColor: chatColors.bubbleAi,
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: chatColors.bubbleUser,
    borderTopRightRadius: 4,
  },
  timestamp: {
    ...chatTypography.caption,
    color: chatColors.textTertiary,
    marginTop: 4,
    paddingHorizontal: 4,
  },
});

export default MessageBubble;
