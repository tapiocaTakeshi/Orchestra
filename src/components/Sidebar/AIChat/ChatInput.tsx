import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Text,
  Platform,
} from 'react-native';
import { chatTheme } from './theme';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<Props> = ({
  onSend,
  disabled,
  placeholder = 'メッセージを入力…',
}) => {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={chatTheme.colors.textMuted}
          style={styles.input}
          multiline
          maxLength={2000}
          editable={!disabled}
          onSubmitEditing={handleSend}
          blurOnSubmit={Platform.OS !== 'ios'}
          returnKeyType="send"
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="送信"
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: canSend
                ? chatTheme.colors.accent
                : chatTheme.colors.borderStrong,
              opacity: pressed && canSend ? 0.85 : 1,
            },
          ]}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Enter で送信 ・ Shift + Enter で改行
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: chatTheme.spacing.lg,
    paddingTop: chatTheme.spacing.sm,
    paddingBottom: chatTheme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chatTheme.colors.border,
    backgroundColor: chatTheme.colors.background,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: chatTheme.colors.surface,
    borderRadius: chatTheme.radius.lg,
    borderWidth: 1,
    borderColor: chatTheme.colors.border,
    paddingHorizontal: chatTheme.spacing.md,
    paddingVertical: 6,
    gap: chatTheme.spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: chatTheme.font.body,
    color: chatTheme.colors.textPrimary,
    maxHeight: 120,
    minHeight: 24,
    paddingTop: Platform.OS === 'ios' ? 6 : 4,
    paddingBottom: Platform.OS === 'ios' ? 6 : 4,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: chatTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  hint: {
    marginTop: 6,
    fontSize: chatTheme.font.tiny,
    color: chatTheme.colors.textMuted,
    textAlign: 'center',
  },
});

export default ChatInput;
