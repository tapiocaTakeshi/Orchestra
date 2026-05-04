import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  chatColors,
  chatRadius,
  chatSpacing,
  chatTypography,
} from '../theme/chatTheme';

export type ChatRole = 'user' | 'assistant';

export interface ChatBubbleProps {
  role: ChatRole;
  content: string;
  timestamp?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  role,
  content,
  timestamp,
}) => {
  const isUser = role === 'user';

  return (
    <View
      style={[
        styles.row,
        isUser ? styles.rowUser : styles.rowAssistant,
      ]}
    >
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
          {content}
        </Text>
      </View>
      {timestamp ? (
        <Text
          style={[
            styles.meta,
            isUser ? styles.metaRight : styles.metaLeft,
          ]}
        >
          {timestamp}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    width: '100%',
    marginBottom: chatSpacing.md,
  },
  rowUser: {
    alignItems: 'flex-end',
  },
  rowAssistant: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '92%',
    paddingVertical: chatSpacing.sm,
    paddingHorizontal: chatSpacing.md,
    borderRadius: chatRadius.lg,
  },
  bubbleUser: {
    backgroundColor: chatColors.bubbleUser,
    borderTopRightRadius: chatRadius.sm,
  },
  bubbleAssistant: {
    backgroundColor: chatColors.bubbleAssistant,
    borderTopLeftRadius: chatRadius.sm,
  },
  text: {
    ...chatTypography.body,
  },
  textUser: {
    color: chatColors.bubbleUserText,
  },
  textAssistant: {
    color: chatColors.bubbleAssistantText,
  },
  meta: {
    ...chatTypography.meta,
    color: chatColors.textMuted,
    marginTop: chatSpacing.xxs,
    paddingHorizontal: chatSpacing.xs,
  },
  metaLeft: {
    alignSelf: 'flex-start',
  },
  metaRight: {
    alignSelf: 'flex-end',
  },
});

export default ChatBubble;
