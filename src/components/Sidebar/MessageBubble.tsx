import React from 'react';
import { Text, View } from 'react-native';
import { styles } from './aiChatStyles';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const MessageBubble: React.FC<{ message: ChatMessage }> = ({
  message,
}) => {
  const isUser = message.role === 'user';

  return (
    <View
      style={[
        styles.msgRow,
        isUser ? styles.msgRowUser : styles.msgRowAssistant,
      ]}
    >
      {!isUser && <Text style={styles.roleLabel}>AI</Text>}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant,
          ]}
          selectable
        >
          {message.content}
        </Text>
      </View>
      <Text
        style={[
          styles.timestamp,
          isUser ? styles.timestampUser : styles.timestampAssistant,
        ]}
      >
        {formatTime(message.createdAt)}
      </Text>
    </View>
  );
};

export default MessageBubble;
