import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { styles, COLORS } from './AIChatPanel.styles';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
}

export interface AIChatPanelProps {
  /** 表示するメッセージ一覧。未指定なら内部 state を使う */
  messages?: ChatMessage[];
  /** 送信時のハンドラ。未指定なら内部でエコー応答（UI 確認用） */
  onSend?: (text: string) => void | Promise<void>;
  /** 送信中フラグ */
  isSending?: boolean;
  /** ヘッダタイトル */
  title?: string;
  /** オンライン状態 */
  online?: boolean;
  /** プレースホルダ */
  placeholder?: string;
}

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const Avatar: React.FC<{ role: ChatRole }> = ({ role }) => {
  const isUser = role === 'user';
  return (
    <View
      style={[
        styles.avatar,
        isUser ? styles.avatarUser : styles.avatarAssistant,
      ]}
    >
      <Text
        style={[
          styles.avatarText,
          isUser ? styles.avatarTextUser : styles.avatarTextAssistant,
        ]}
      >
        {isUser ? 'U' : 'AI'}
      </Text>
    </View>
  );
};

const TypingDots: React.FC = () => (
  <View style={styles.typingRow}>
    <View style={[styles.typingDot, { opacity: 0.35 }]} />
    <View style={[styles.typingDot, { opacity: 0.6 }]} />
    <View style={[styles.typingDot, { opacity: 0.85 }]} />
  </View>
);

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <View
      style={[
        styles.messageRow,
        isUser ? styles.messageRowUser : styles.messageRowAssistant,
      ]}
    >
      {!isUser && <Avatar role="assistant" />}
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
        >
          {message.content}
        </Text>
      </View>
      {isUser && <Avatar role="user" />}
    </View>
  );
};

const AIChatPanel: React.FC<AIChatPanelProps> = ({
  messages: controlledMessages,
  onSend,
  isSending = false,
  title = 'AI Assistant',
  online = true,
  placeholder = 'メッセージを入力...',
}) => {
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([
    {
      id: genId(),
      role: 'assistant',
      content: 'こんにちは。何かお手伝いできることはありますか？',
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [internalSending, setInternalSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const messages = controlledMessages ?? internalMessages;
  const sending = isSending || internalSending;

  const canSend = useMemo(
    () => input.trim().length > 0 && !sending,
    [input, sending],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');

    if (onSend) {
      await onSend(text);
      return;
    }

    // フォールバック: 内部 state でエコー
    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setInternalMessages((prev) => [...prev, userMsg]);
    setInternalSending(true);

    setTimeout(() => {
      setInternalMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: 'assistant',
          content: `「${text}」について考えています...`,
          createdAt: Date.now(),
        },
      ]);
      setInternalSending(false);
    }, 700);
  }, [input, sending, onSend]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Avatar role="assistant" />
          <View style={styles.headerTexts}>
            <Text style={styles.headerTitle}>{title}</Text>
            <View style={styles.headerStatusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: online ? COLORS.online : COLORS.muted },
                ]}
              />
              <Text style={styles.headerStatus}>
                {online ? 'オンライン' : 'オフライン'}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.headerAction} hitSlop={8}>
          <Text style={styles.headerActionText}>⋯</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {sending && (
          <View style={[styles.messageRow, styles.messageRowAssistant]}>
            <Avatar role="assistant" />
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <TypingDots />
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.divider} />

      {/* Input */}
      <View style={styles.inputBar}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={COLORS.muted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            editable={!sending}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
        </View>
        <TouchableOpacity
          style={[
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.85}
        >
          {sending ? (
            <ActivityIndicator size="small" color={COLORS.surface} />
          ) : (
            <Text style={styles.sendButtonIcon}>↑</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export default AIChatPanel;
