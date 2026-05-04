import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from './theme';
import type { Message } from './types';

interface Props {
  message: Message;
  showTimestamp?: boolean;
}

const formatTime = (ms: number) => {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
};

export const MessageBubble: React.FC<Props> = ({ message, showTimestamp = true }) => {
  const isUser = message.role === 'user';

  return (
    <View
      style={[
        styles.row,
        isUser ? styles.rowEnd : styles.rowStart,
      ]}
    >
      {!isUser && (
        <View style={styles.avatar} accessibilityElementsHidden>
          <Text style={styles.avatarText}>AI</Text>
        </View>
      )}

      <View style={styles.column}>
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAI,
          ]}
        >
          <Text
            style={[
              styles.text,
              isUser ? styles.textUser : styles.textAI,
            ]}
            selectable
          >
            {message.content}
          </Text>
        </View>
        {showTimestamp && (
          <Text
            style={[
              styles.meta,
              isUser ? styles.metaEnd : styles.metaStart,
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
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  rowStart: { justifyContent: 'flex-start' },
  rowEnd: { justifyContent: 'flex-end' },

  avatar: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },

  column: {
    flexShrink: 1,
    maxWidth: '82%',
  },

  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  bubbleAI: {
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },

  text: { ...typography.body },
  textAI: { color: colors.textPrimary },
  textUser: { color: colors.accentOn },

  meta: {
    ...typography.meta,
    color: colors.textMuted,
    marginTop: 4,
  },
  metaStart: { textAlign: 'left', marginLeft: spacing.xs },
  metaEnd: { textAlign: 'right', marginRight: spacing.xs },
});

export default MessageBubble;
