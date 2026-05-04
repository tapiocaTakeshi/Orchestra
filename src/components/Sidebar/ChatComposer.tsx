import React, { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { sidebarChatTheme as t } from '../../theme/sidebarChatTheme';

export interface ChatComposerProps {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: ViewStyle;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSend,
  placeholder = 'AI に質問する…',
  disabled,
  style,
}) => {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);

  const canSend = value.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
  }, [value, disabled, onSend]);

  return (
    <View
      style={[
        styles.wrap,
        focused && styles.wrapFocused,
        disabled && styles.wrapDisabled,
        style,
      ]}
    >
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={t.colors.inkSubtle}
        multiline
        editable={!disabled}
        onSubmitEditing={handleSend}
        blurOnSubmit={false}
        returnKeyType="send"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="送信"
        onPress={handleSend}
        disabled={!canSend}
        style={({ pressed }) => [
          styles.sendBtn,
          canSend ? styles.sendBtnActive : styles.sendBtnIdle,
          pressed && canSend && styles.sendBtnPressed,
        ]}
      >
        <Text style={[styles.sendLabel, canSend ? styles.sendLabelActive : styles.sendLabelIdle]}>
          ↑
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: 6,
    gap: t.spacing.sm,
  },
  wrapFocused: {
    borderColor: t.colors.borderStrong,
  },
  wrapDisabled: {
    backgroundColor: t.colors.surfaceMuted,
  },
  input: {
    flex: 1,
    minHeight: 32,
    maxHeight: 120,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: 6,
    fontSize: t.font.body,
    color: t.colors.ink,
    lineHeight: 20,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: t.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnIdle: {
    backgroundColor: t.colors.surfaceSunken,
  },
  sendBtnActive: {
    backgroundColor: t.colors.accent,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendLabel: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  sendLabelIdle: {
    color: t.colors.inkSubtle,
  },
  sendLabelActive: {
    color: t.colors.accentInk,
  },
});

export default ChatComposer;
