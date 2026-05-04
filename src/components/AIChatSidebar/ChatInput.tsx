import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  Pressable,
  Text,
} from 'react-native';
import { colors, radius, spacing, typography } from './theme';

interface Props {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<Props> = ({
  onSubmit,
  disabled = false,
  placeholder = 'Message AI…',
}) => {
  const [value, setValue] = useState('');

  const trimmed = value.trim();
  const canSend = !disabled && trimmed.length > 0;

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    onSubmit(trimmed);
    setValue('');
  }, [canSend, onSubmit, trimmed]);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.field, disabled && styles.fieldDisabled]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          editable={!disabled}
          multiline
          maxLength={2000}
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
          blurOnSubmit
          accessibilityLabel="Chat message input"
        />

        <Pressable
          onPress={handleSubmit}
          disabled={!canSend}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={({ pressed }) => [
            styles.sendBtn,
            !canSend && styles.sendBtnDisabled,
            pressed && canSend && styles.sendBtnPressed,
          ]}
        >
          <Text
            style={[
              styles.sendLabel,
              !canSend && styles.sendLabelDisabled,
            ]}
          >
            Send
          </Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Enter to send · Shift+Enter for newline</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  fieldDisabled: { opacity: 0.6 },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    ...typography.body,
  },
  sendBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignSelf: 'flex-end',
    marginBottom: 2,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnPressed: { opacity: 0.7 },
  sendLabel: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  sendLabelDisabled: { color: colors.textMuted },
  hint: {
    ...typography.meta,
    color: colors.textMuted,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});

export default ChatInput;
