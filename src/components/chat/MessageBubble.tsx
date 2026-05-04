import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { chatTheme as t } from '../../theme/chatTheme';

export type ChatRole = 'user' | 'assistant';

export interface MessageBubbleProps {
  role: ChatRole;
  text: string;
  timestamp?: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ role, text, timestamp }) => {
  const isUser = role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowEnd : styles.rowStart]}>
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
            isUser ? styles.bubbleUserCorner : styles.bubbleAiCorner,
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              isUser ? styles.bubbleTextUser : styles.bubbleTextAi,
            ]}
          >
            {text}
          </Text>
        </View>
        {timestamp && (
          <Text style={[styles.meta, isUser ? styles.metaEnd : styles.metaStart]}>
            {timestamp}
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
    marginVertical: t.spacing.xs,
    paddingHorizontal: t.spacing.lg,
  },
  rowStart: { justifyContent: 'flex-start' },
  rowEnd: { justifyContent: 'flex-end' },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: t.radius.pill,
    backgroundColor: t.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: t.spacing.sm,
  },
  avatarText: {
    color: t.color.accent,
    fontSize: t.font.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  bubbleWrap: {
    maxWidth: '78%',
  },
  bubble: {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm + 2,
    borderRadius: t.radius.lg,
  },
  bubbleAi: {
    backgroundColor: t.color.bubbleAiBg,
  },
  bubbleUser: {
    backgroundColor: t.color.bubbleUserBg,
  },
  bubbleAiCorner: {
    borderTopLeftRadius: 4,
  },
  bubbleUserCorner: {
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: t.font.md,
    lineHeight: 21,
  },
  bubbleTextAi: { color: t.color.bubbleAiText },
  bubbleTextUser: { color: t.color.bubbleUserText },
  meta: {
    fontSize: t.font.xs,
    color: t.color.textMuted,
    marginTop: 4,
  },
  metaStart: { textAlign: 'left' },
  metaEnd: { textAlign: 'right' },
});

export default MessageBubble;
