import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  role: 'user' | 'assistant';
  content: string;
};

const ChatBubble: React.FC<Props> = ({ role, content }) => {
  const isUser = role === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowEnd : styles.rowStart]}>
      {!isUser && <View style={styles.aiDot} />}
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.aiBubble,
        ]}
      >
        <Text style={[styles.text, isUser ? styles.userText : styles.aiText]}>
          {content}
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
  rowStart: {
    justifyContent: 'flex-start',
  },
  rowEnd: {
    justifyContent: 'flex-end',
  },
  aiDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#111111',
    marginBottom: 10,
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  userBubble: {
    backgroundColor: '#111111',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#F7F7F8',
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  aiText: {
    color: '#111111',
  },
});

export default ChatBubble;
