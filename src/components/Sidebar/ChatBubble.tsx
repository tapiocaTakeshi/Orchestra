import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { sidebarChatTheme as t } from '../../theme/sidebarChatTheme';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatBubbleProps {
  role: ChatRole;
  content: string;
  timestamp?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ role, content, timestamp }) => {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAi]}>
      {!isUser && <View style={styles.avatar}><Text style={styles.avatarText}>AI</Text></View>}
      <View style={styles.bubbleWrap}>
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAi,
          ]}
        >
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAi]}>
            {content}
          </Text>
        </View>
        {!!timestamp && (
          <Text style={[styles.meta, isUser ? styles.metaRight : styles.metaLeft]}>
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
    marginBottom: t.spacing.md,
    alignItems: 'flex-end',
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAi: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: t.spacing.sm,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: t.colors.inkMuted,
    letterSpacing: 0.5,
  },
  bubbleWrap: {
    maxWidth: '82%',
  },
  bubble: {
    paddingVertical: t.spacing.sm + 2,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.lg,
  },
  bubbleUser: {
    backgroundColor: t.colors.bubbleUser,
    borderBottomRightRadius: t.radius.sm,
  },
  bubbleAi: {
    backgroundColor: t.colors.bubbleAi,
    borderBottomLeftRadius: t.radius.sm,
  },
  bubbleText: {
    fontSize: t.font.body,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: t.colors.bubbleUserInk,
  },
  bubbleTextAi: {
    color: t.colors.bubbleAiInk,
  },
  meta: {
    marginTop: 4,
    fontSize: t.font.meta,
    color: t.colors.inkSubtle,
  },
  metaLeft: {
    textAlign: 'left',
  },
  metaRight: {
    textAlign: 'right',
  },
  systemRow: {
    alignItems: 'center',
    marginVertical: t.spacing.sm,
  },
  systemText: {
    fontSize: t.font.meta,
    color: t.colors.inkSubtle,
    letterSpacing: 0.3,
  },
});

export default ChatBubble;
