import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { styles, palette } from './AIChatSidebar.styles';
import { TypingIndicator } from './ai-chat/TypingIndicator';
import { SuggestionChips } from './ai-chat/SuggestionChips';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
}

export interface AIChatSidebarProps {
  visible?: boolean;
  messages: ChatMessage[];
  isThinking?: boolean;
  onSend: (text: string) => void;
  onClose?: () => void;
  onClearHistory?: () => void;
  /** 入力欄下のサジェスト。未指定ならデフォルトを表示 */
  suggestions?: string[];
  /** ヘッダー右上のステータステキスト */
  statusLabel?: string;
  /** AI の名前 */
  assistantName?: string;
}

const DEFAULT_SUGGESTIONS = [
  'このページを要約して',
  '使い方を教えて',
  '今日のタスクを提案して',
];

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
  visible = true,
  messages,
  isThinking = false,
  onSend,
  onClose,
  onClearHistory,
  suggestions,
  statusLabel = 'オンライン',
  assistantName = 'AI アシスタント',
}) => {
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const canSend = input.trim().length > 0 && !isThinking;

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isThinking) return;
    onSend(text);
    setInput('');
  }, [input, isThinking, onSend]);

  const handleSuggestionPress = useCallback(
    (text: string) => {
      if (isThinking) return;
      onSend(text);
    },
    [isThinking, onSend],
  );

  // 新規メッセージ追加時に自動スクロール
  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length, isThinking]);

  const data = useMemo(() => messages, [messages]);
  const showSuggestions = messages.length === 0 && !isThinking;

  if (!visible) return null;

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>AI</Text>
            </View>
            <View>
              <Text style={styles.title}>{assistantName}</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{statusLabel}</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerActions}>
            {onClearHistory && (
              <Pressable
                onPress={onClearHistory}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && styles.iconButtonPressed,
                ]}
                accessibilityLabel="履歴をクリア"
              >
                <Text style={styles.iconGlyph}>⟲</Text>
              </Pressable>
            )}
            {onClose && (
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && styles.iconButtonPressed,
                ]}
                accessibilityLabel="閉じる"
              >
                <Text style={styles.iconGlyph}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Messages */}
        <View style={styles.messagesWrap}>
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>こんにちは 👋</Text>
              <Text style={styles.emptyDesc}>
                何でも気軽に聞いてください。{`\n`}
                下のサジェストから始めることもできます。
              </Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={data}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => <MessageRow message={item} />}
              ItemSeparatorComponent={() => <View style={styles.msgSpacer} />}
              ListFooterComponent={
                isThinking ? (
                  <View style={styles.thinkingRow}>
                    <Text style={styles.roleLabel}>{assistantName}</Text>
                    <TypingIndicator />
                  </View>
                ) : null
              }
            />
          )}
        </View>

        {/* Suggestions */}
        {showSuggestions && (
          <SuggestionChips
            items={suggestions ?? DEFAULT_SUGGESTIONS}
            onPress={handleSuggestionPress}
          />
        )}

        {/* Composer */}
        <View style={styles.composerWrap}>
          <View style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="メッセージを入力…"
              placeholderTextColor={palette.muted}
              style={styles.input}
              multiline
              maxLength={2000}
              editable={!isThinking}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              returnKeyType="send"
            />
            <Pressable
              onPress={handleSend}
              disabled={!canSend}
              style={({ pressed }) => [
                styles.sendButton,
                !canSend && styles.sendButtonDisabled,
                pressed && canSend && styles.sendButtonPressed,
              ]}
              accessibilityLabel="送信"
            >
              <Text
                style={[
                  styles.sendGlyph,
                  !canSend && styles.sendGlyphDisabled,
                ]}
              >
                ↑
              </Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Enter で送信 / Shift+Enter で改行
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

/* ---------------- Message Row ---------------- */

const MessageRow: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAi]}>
      <Text style={[styles.roleLabel, isUser && styles.roleLabelUser]}>
        {isUser ? 'あなた' : 'AI'}
      </Text>
      <View
        style={[
          styles.msgBody,
          isUser ? styles.msgBodyUser : styles.msgBodyAi,
        ]}
      >
        <Text
          style={[
            styles.msgText,
            isUser ? styles.msgTextUser : styles.msgTextAi,
          ]}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
};

export default AIChatSidebar;
