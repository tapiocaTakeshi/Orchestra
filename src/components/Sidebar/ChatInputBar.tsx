import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
  Text,
} from 'react-native';
import { colors } from '../../theme/colors';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Minimal な入力バー。
 * - 1〜5 行で自動高さ調整
 * - 空文字 / disabled 時は送信ボタンを淡色化＋押下不可
 */
export const ChatInputBar: React.FC<Props> = ({ onSend, disabled, placeholder = 'メッセージを入力' }) => {
  const [value, setValue] = useState('');
  const [height, setHeight] = useState(40);

  const canSend = !disabled && value.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    setHeight(40);
  };

  const handleContentSize = (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    const next = Math.min(Math.max(40, e.nativeEvent.contentSize.height), 120);
    setHeight(next);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { height }]}
          multiline
          onContentSizeChange={handleContentSize}
          editable={!disabled}
          accessibilityLabel="AIへのメッセージ入力欄"
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: canSend ? (pressed ? colors.accentPressed : colors.accent) : colors.accentDisabled },
          ]}
          accessibilityRole="button"
          accessibilityLabel="送信"
          accessibilityState={{ disabled: !canSend }}
          hitSlop={8}
        >
          <Text style={styles.sendLabel}>↑</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Enterで改行 / 送信はボタン</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceSunken,
    color: colors.textPrimary,
    fontSize: 14.5,
    lineHeight: 20,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendLabel: {
    color: colors.textOnAccent,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: -1,
  },
  hint: {
    marginTop: 6,
    marginLeft: 4,
    fontSize: 11,
    color: colors.textMuted,
  },
});
