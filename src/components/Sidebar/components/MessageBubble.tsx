import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette } from '../AIChatPanel.styles';
import type { ChatMessage } from '../AIChatPanel';

interface Props {
  message: ChatMessage;
}

export const MessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <View
      style={[
        styles.row,
        isUser ? styles.rowRight : styles.rowLeft,
      ]}
    >
      {!isUser && <View style={styles.aiTag}><Text style={styles.aiTagText}>AI</Text></View>}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAi,
        ]}
      >
        <Text
          style={[
            styles.text,
            isUser ? styles.textUser : styles.textAi,
          ]}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    width: '100%',
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  aiTag: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  aiTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: palette.text,
    letterSpacing: 0.5,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
  },
  bubbleUser: {
    backgroundColor: palette.bubbleUserBg,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: palette.bubbleAiBg,
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  textUser: {
    color: palette.bubbleUserText,
  },
  textAi: {
    color: palette.bubbleAiText,
  },
});
