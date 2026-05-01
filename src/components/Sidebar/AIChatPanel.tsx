import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ListRenderItem,
} from 'react-native';
import {
  AIChatColors,
  AIChatRadius,
  AIChatSpacing,
  AIChatTypography,
} from './aiChatTheme';

/**
 * AIChatPanel — Minimal sidebar AI chat
 *
 * 既存サイドバーの AI チャット領域に差し込んで使うパネル。
 * 親側の幅 / 高さに追従するため flex: 1 で動作する想定。
 */

export type AIChatRole = 'user' | 'assistant';

export interface AIChatMessage {
  id: string;
  role: AIChatRole;
  content: string;
  createdAt?: number;
}

export interface AIChatPanelProps {
  title?: string;
  subtitle?: string;
  online?: boolean;
  messages?: AIChatMessage[];
  placeholder?: string;
  onSend?: (text: string) => void | Promise<void>;
  onClear?: () => void;
  onClose?: () => void;
  isThinking?: boolean;
}

const DEFAULT_MESSAGES: AIChatMessage[] = [
  {
    id: 'sys-1',
    role: 'assistant',
    content: 'こんにちは。何でも気軽に聞いてください。',
  },
];

const formatTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
};

const HeaderDivider = () => <View style={styles.divider} />;

const Avatar: React.FC<{ role: AIChatRole }> = ({ role }) => {
  const isUser = role === 'user';
  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: isUser
            ? AIChatColors.accent
            : AIChatColors.surface,
          borderColor: isUser ? AIChatColors.accent : AIChatColors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.avatarText,
          { color: isUser ? '#FFFFFF' : AIChatColors.textPrimary },
        ]}
      >
        {isUser ? 'You' : 'AI'}
      </Text>
    </View>
  );
};

const MessageRow: React.FC<{ message: AIChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <View style={styles.messageRow}>
      <Avatar role={message.role} />
      <View style={styles.messageBody}>
        <View style={styles.messageMetaRow}>
          <Text style={styles.messageAuthor}>
            {isUser ? 'You' : 'Assistant'}
          </Text>
          {message.createdAt ? (
            <Text style={styles.messageTime}>
              {formatTime(message.createdAt)}
            </Text>
          ) : null}
        </View>
        <Text style={styles.messageText}>{message.content}</Text>
      </View>
    </View>
  );
};

const TypingIndicator: React.FC = () => (
  <View style={styles.messageRow}>
    <Avatar role="assistant" />
    <View style={styles.messageBody}>
      <View style={styles.messageMetaRow}>
        <Text style={styles.messageAuthor}>Assistant</Text>
      </View>
      <View style={styles.typingDots}>
        <View style={[styles.dot, styles.dot1]} />
        <View style={[styles.dot, styles.dot2]} />
        <View style={[styles.dot, styles.dot3]} />
      </View>
    </View>
  </View>
);

const IconButton: React.FC<{
  label: string;
  onPress?: () => void;
  glyph: string;
  disabled?: boolean;
  primary?: boolean;
}> = ({ label, onPress, glyph, disabled, primary }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      primary ? styles.sendButton : styles.iconButton,
      pressed && !disabled && { opacity: 0.7 },
      disabled && { opacity: 0.35 },
    ]}
    hitSlop={6}
  >
    <Text
      style={[
        primary ? styles.sendButtonText : styles.iconButtonText,
      ]}
    >
      {glyph}
    </Text>
  </Pressable>
);

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  title = 'AI Assistant',
  subtitle = 'ALWAYS HERE TO HELP',
  online = true,
  messages,
  placeholder = 'メッセージを入力…',
  onSend,
  onClear,
  onClose,
  isThinking = false,
}) => {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const listRef = useRef<FlatList<AIChatMessage>>(null);

  const data = useMemo<AIChatMessage[]>(
    () => (messages && messages.length ? messages : DEFAULT_MESSAGES),
    [messages],
  );

  const canSend = input.trim().length > 0;

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    onSend?.(text);
    setInput('');
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [input, onSend]);

  const renderItem: ListRenderItem<AIChatMessage> = useCallback(
    ({ item }) => <MessageRow message={item} />,
    [],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <Text style={styles.headerIcon}>✦</Text>
          </View>
          <View>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.subtitleRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: online
                      ? AIChatColors.online
                      : AIChatColors.textTertiary,
                  },
                ]}
              />
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerActions}>
          {onClear ? (
            <IconButton label="Clear" glyph="↺" onPress={onClear} />
          ) : null}
          {onClose ? (
            <IconButton label="Close" glyph="×" onPress={onClose} />
          ) : null}
        </View>
      </View>

      <HeaderDivider />

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.itemSpacer} />}
        ListFooterComponent={isThinking ? <TypingIndicator /> : null}
        showsVerticalScrollIndicator={false}
      />

      {/* Suggestion chips */}
      <View style={styles.suggestionsRow}>
        {['要約して', 'コードを説明', 'アイデアを出して'].map((s) => (
          <Pressable
            key={s}
            onPress={() => setInput(s)}
            style={({ pressed }) => [
              styles.chip,
              pressed && { backgroundColor: AIChatColors.surface },
            ]}
          >
            <Text style={styles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {/* Composer */}
      <View
        style={[
          styles.composer,
          focused && { borderColor: AIChatColors.accent },
        ]}
      >
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={placeholder}
          placeholderTextColor={AIChatColors.textTertiary}
          multiline
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          returnKeyType="send"
          underlineColorAndroid="transparent"
        />
        <View style={styles.composerActions}>
          <IconButton label="Attach" glyph="＋" onPress={() => {}} />
          <IconButton
            label="Send"
            glyph="↑"
            onPress={handleSend}
            disabled={!canSend}
            primary
          />
        </View>
      </View>

      <Text style={styles.footerHint}>
        Enter で送信 · Shift + Enter で改行
      </Text>
    </KeyboardAvoidingView>
  );
};

export default AIChatPanel;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AIChatColors.background,
  },

  // Header
  header: {
    paddingHorizontal: AIChatSpacing.lg,
    paddingTop: AIChatSpacing.lg,
    paddingBottom: AIChatSpacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AIChatSpacing.md,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: AIChatRadius.md,
    backgroundColor: AIChatColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AIChatColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 14,
    color: AIChatColors.textPrimary,
  },
  title: {
    ...AIChatTypography.title,
    color: AIChatColors.textPrimary,
  },
  subtitleRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subtitle: {
    ...AIChatTypography.subtitle,
    color: AIChatColors.textSecondary,
    textTransform: 'uppercase',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AIChatSpacing.xs,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AIChatColors.border,
    marginHorizontal: AIChatSpacing.lg,
  },

  // List
  listContent: {
    paddingHorizontal: AIChatSpacing.lg,
    paddingVertical: AIChatSpacing.lg,
    flexGrow: 1,
  },
  itemSpacer: {
    height: AIChatSpacing.lg,
  },

  // Message
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AIChatSpacing.md,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: AIChatRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  messageBody: {
    flex: 1,
    paddingTop: 2,
  },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  messageAuthor: {
    ...AIChatTypography.meta,
    color: AIChatColors.textSecondary,
    textTransform: 'uppercase',
  },
  messageTime: {
    ...AIChatTypography.meta,
    color: AIChatColors.textTertiary,
  },
  messageText: {
    ...AIChatTypography.message,
    color: AIChatColors.textPrimary,
  },

  // Typing
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: AIChatColors.textTertiary,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.7 },
  dot3: { opacity: 1 },

  // Suggestions
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AIChatSpacing.sm,
    paddingHorizontal: AIChatSpacing.lg,
    paddingBottom: AIChatSpacing.sm,
  },
  chip: {
    paddingHorizontal: AIChatSpacing.md,
    paddingVertical: 6,
    borderRadius: AIChatRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AIChatColors.border,
    backgroundColor: AIChatColors.background,
  },
  chipText: {
    fontSize: 12,
    color: AIChatColors.textSecondary,
    fontWeight: '500',
  },

  // Composer
  composer: {
    marginHorizontal: AIChatSpacing.lg,
    marginBottom: AIChatSpacing.sm,
    borderWidth: 1,
    borderColor: AIChatColors.border,
    borderRadius: AIChatRadius.lg,
    backgroundColor: AIChatColors.background,
    paddingHorizontal: AIChatSpacing.md,
    paddingTop: AIChatSpacing.sm,
    paddingBottom: AIChatSpacing.xs,
  },
  input: {
    ...AIChatTypography.input,
    color: AIChatColors.textPrimary,
    minHeight: 36,
    maxHeight: 140,
    paddingTop: 4,
    paddingBottom: 4,
    textAlignVertical: 'top',
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: AIChatSpacing.xs,
  },

  iconButton: {
    width: 30,
    height: 30,
    borderRadius: AIChatRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconButtonText: {
    fontSize: 16,
    color: AIChatColors.textSecondary,
    lineHeight: 18,
  },

  sendButton: {
    width: 30,
    height: 30,
    borderRadius: AIChatRadius.pill,
    backgroundColor: AIChatColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },

  footerHint: {
    paddingHorizontal: AIChatSpacing.lg,
    paddingBottom: AIChatSpacing.md,
    fontSize: 10,
    color: AIChatColors.textTertiary,
    letterSpacing: 0.2,
  },
});
