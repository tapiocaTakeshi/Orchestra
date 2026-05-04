import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
}

interface Props {
  message: ChatMessage;
}

/**
 * Minimal な吹き出し。
 * - user: 右寄せ・濃色背景・白文字
 * - assistant: 左寄せ・淡色背景・黒文字
 * 角丸は片側だけ少し小さくして発話方向を示唆。
 */
export const ChatMessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <View
      style={[styles.row, isUser ? styles.rowUser : styles.rowAi]}
      accessibilityLabel={`${isUser ? 'ユーザー' : 'AI'}のメッセージ`}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAi,
          isUser ? styles.bubbleUserCorner : styles.bubbleAiCorner,
        ]}
      >
        <Text style={[styles.text, { color: isUser ? colors.bubbleUserText : colors.bubbleAiText }]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    width: '100%',
    marginVertical: 4,
    flexDirection: 'row',
  },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '86%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleUser: {
    backgroundColor: colors.bubbleUserBg,
  },
  bubbleAi: {
    backgroundColor: colors.bubbleAiBg,
  },
  bubbleUserCorner: { borderBottomRightRadius: 4 },
  bubbleAiCorner: { borderBottomLeftRadius: 4 },
  text: {
    fontSize: 14.5,
    lineHeight: 21,
  },
});
