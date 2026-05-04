import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { chatTheme as t } from '../../theme/chatTheme';

export interface ChatInputProps {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  placeholder = 'AI にメッセージを送る…',
  disabled,
}) => {
  const [value, setValue] = useState('');
  const [height, setHeight] = useState(40);

  const canSend = value.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    setHeight(40);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { height: Math.min(Math.max(40, height), 120) }]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={t.color.textMuted}
          multiline
          onContentSizeChange={(e) => setHeight(e.nativeEvent.contentSize.height + 12)}
          editable={!disabled}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="送信"
          onPress={handleSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendBtn,
            !canSend && styles.sendBtnDisabled,
            pressed && canSend && styles.sendBtnPressed,
          ]}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Enter で送信・Shift+Enter で改行</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.sm,
    paddingBottom: t.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.color.border,
    backgroundColor: t.color.bg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: t.color.bgSubtle,
    borderWidth: 1,
    borderColor: t.color.border,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: t.font.md,
    color: t.color.textPrimary,
    paddingVertical: t.spacing.sm,
    paddingRight: t.spacing.sm,
    maxHeight: 120,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sendBtnDisabled: {
    backgroundColor: t.color.borderStrong,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendIcon: {
    color: '#fff',
    fontSize: t.font.lg,
    fontWeight: '700',
    lineHeight: 20,
  },
  hint: {
    fontSize: t.font.xs,
    color: t.color.textMuted,
    marginTop: 6,
    marginLeft: 4,
  },
});

export default ChatInput;
