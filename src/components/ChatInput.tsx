import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  chatColors,
  chatRadius,
  chatSpacing,
  chatTypography,
} from '../theme/chatTheme';

export interface ChatInputProps {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'メッセージを入力…',
  disabled,
}) => {
  const [focused, setFocused] = useState(false);
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <View
      style={[
        styles.wrapper,
        focused && styles.wrapperFocused,
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={chatColors.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.input}
        multiline
        editable={!disabled}
        onSubmitEditing={canSend ? onSubmit : undefined}
        returnKeyType="send"
        blurOnSubmit
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="送信"
        onPress={canSend ? onSubmit : undefined}
        style={({ pressed }) => [
          styles.sendButton,
          !canSend && styles.sendButtonDisabled,
          pressed && canSend && styles.sendButtonPressed,
        ]}
      >
        <Text
          style={[
            styles.sendLabel,
            !canSend && styles.sendLabelDisabled,
          ]}
        >
          送信
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: chatSpacing.xs,
    paddingHorizontal: chatSpacing.sm,
    paddingVertical: chatSpacing.xs,
    backgroundColor: chatColors.surface,
    borderRadius: chatRadius.xl,
    borderWidth: 1,
    borderColor: chatColors.border,
  },
  wrapperFocused: {
    borderColor: chatColors.borderStrong,
    backgroundColor: chatColors.background,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingHorizontal: chatSpacing.xs,
    paddingVertical: chatSpacing.xs,
    color: chatColors.textPrimary,
    ...chatTypography.body,
  },
  sendButton: {
    paddingHorizontal: chatSpacing.md,
    paddingVertical: chatSpacing.xs + 2,
    borderRadius: chatRadius.pill,
    backgroundColor: chatColors.accent,
  },
  sendButtonDisabled: {
    backgroundColor: chatColors.surfaceMuted,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  sendLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  sendLabelDisabled: {
    color: chatColors.textMuted,
  },
});

export default ChatInput;
