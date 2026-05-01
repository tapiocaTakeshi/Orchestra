import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Text,
  Platform,
} from 'react-native';
import { chatTheme as t } from '../../theme/chatTheme';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<Props> = ({
  onSend,
  disabled,
  placeholder = 'Message AI…',
}) => {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const canSend = !disabled && trimmed.length > 0;

  const handleSend = () => {
    if (!canSend) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={t.color.textSubtle}
          editable={!disabled}
          multiline
          maxLength={2000}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          returnKeyType="send"
          underlineColorAndroid="transparent"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={handleSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendBtn,
            !canSend && styles.sendBtnDisabled,
            pressed && canSend && styles.sendBtnPressed,
          ]}
          hitSlop={8}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Enter to send · Shift+Enter for newline</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.sm,
    paddingBottom: t.space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.color.hairline,
    backgroundColor: t.color.bg,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: t.space.sm,
    backgroundColor: t.color.surface,
    borderWidth: 1,
    borderColor: t.color.border,
    borderRadius: t.radius.md,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  input: {
    flex: 1,
    fontSize: t.font.body,
    color: t.color.text,
    maxHeight: 120,
    paddingVertical: 6,
    ...Platform.select({
      web: { outlineStyle: 'none' as any },
      default: {},
    }),
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: t.radius.pill,
    backgroundColor: t.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: t.color.surfaceAlt,
  },
  sendBtnPressed: {
    opacity: 0.8,
  },
  sendIcon: {
    color: t.color.accentText,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 18,
  },
  hint: {
    marginTop: 6,
    fontSize: 11,
    color: t.color.textSubtle,
    textAlign: 'center',
  },
});

export default ChatInput;
