import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { styles, palette } from './AIChat.styles';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface AIChatProps {
  /** 既存の送信ハンドラ（無ければダミー応答） */
  onSend?: (text: string) => Promise<string> | string;
  /** 初期メッセージ */
  initialMessages?: ChatMessage[];
  /** ヘッダータイトル */
  title?: string;
  /** オンライン状態 */
  online?: boolean;
}

/**
 * Sidebar 内 AI チャット — Minimal Design
 * - 余白を広く、装飾を最小化
 * - モノトーン + 1色アクセント
 * - シャドウなし、薄いボーダーのみ
 */
export const AIChat: React.FC<AIChatProps> = ({
  onSend,
  initialMessages = [],
  title = 'AI Assistant',
  online = true,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const canSend = input.trim().length > 0 && !loading;

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    scrollToEnd();

    try {
      const reply = onSend
        ? await onSend(text)
        : 'これはサンプル応答です。実装時に onSend を渡してください。';
      const aiMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: typeof reply === 'string' ? reply : '',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      const errMsg: ChatMessage = {
        id: `e_${Date.now()}`,
        role: 'assistant',
        content: '応答の取得に失敗しました。',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  }, [input, loading, onSend, scrollToEnd]);

  const renderItem = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View
        style={[
          styles.row,
          isUser ? styles.rowUser : styles.rowAssistant,
        ]}
      >
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AI</Text>
          </View>
        )}
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
            {item.content}
          </Text>
        </View>
      </View>
    );
  }, []);

  const empty = useMemo(
    () => (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyBadge}>
          <Text style={styles.emptyBadgeText}>AI</Text>
        </View>
        <Text style={styles.emptyTitle}>何でも聞いてください</Text>
        <Text style={styles.emptySubtitle}>
          コードの説明、要約、アイデア出しなど{'\n'}気軽にチャットできます
        </Text>
      </View>
    ),
    []
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: online ? palette.accent : palette.muted },
            ]}
          />
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
        <Pressable
          hitSlop={8}
          onPress={() => setMessages([])}
          style={({ pressed }) => [
            styles.clearBtn,
            pressed && styles.pressed,
          ]}
          accessibilityLabel="チャットをクリア"
        >
          <Text style={styles.clearBtnText}>Clear</Text>
        </Pressable>
      </View>

      <View style={styles.divider} />

      {/* Messages */}
      {messages.length === 0 ? (
        empty
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
        />
      )}

      {loading && (
        <View style={styles.typingWrap}>
          <View style={styles.typingDot} />
          <View style={[styles.typingDot, styles.typingDotMid]} />
          <View style={styles.typingDot} />
          <Text style={styles.typingText}>考え中…</Text>
        </View>
      )}

      {/* Input */}
      <View
        style={[
          styles.inputWrap,
          focused && styles.inputWrapFocused,
        ]}
      >
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="メッセージを入力…"
          placeholderTextColor={palette.placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          maxLength={2000}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendBtn,
            !canSend && styles.sendBtnDisabled,
            pressed && canSend && styles.sendBtnPressed,
          ]}
          accessibilityLabel="送信"
        >
          {loading ? (
            <ActivityIndicator size="small" color={palette.surface} />
          ) : (
            <Text style={styles.sendBtnText}>↑</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

export default AIChat;
