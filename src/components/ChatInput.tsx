import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Text,
  Platform,
} from 'react-native';
import { colors, radii, spacing } from '../theme/colors';

type Props = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export const ChatInput: React.FC<Props> = ({
  onSubmit,
  disabled,
  placeholder = 'メッセージを入力…',
}) => {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSubmit(value);
    setValue('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.inner}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          editable={!disabled}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={submit}
        />
        <Pressable
          accessibilityLabel="送信"
          onPress={submit}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendBtn,
            !canSend && styles.sendBtnDisabled,
            pressed && canSend && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Enter で送信 / Shift+Enter で改行</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    maxHeight: 120,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    paddingRight: spacing.sm,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: colors.borderStrong,
  },
  sendIcon: {
    color: colors.accentOn,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  hint: {
    marginTop: 6,
    marginLeft: spacing.sm,
    fontSize: 11,
    color: colors.textMuted,
  },
});

export default ChatInput;
