import React, { useState } from 'react';
import {
  Platform,
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
} from '../../theme/chatTheme';

export interface ChatInputProps {
  placeholder?: string;
  disabled?: boolean;
  onSend: (text: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  placeholder = 'メッセージを入力…',
  disabled,
  onSend,
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
          placeholderTextColor={chatColors.textTertiary}
          style={styles.input}
          multiline
          maxLength={2000}
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
            {
              backgroundColor: canSend
                ? chatColors.accent
                : chatColors.accentDisabled,
              opacity: pressed && canSend ? 0.85 : 1,
            },
          ]}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        AI は誤った情報を出すことがあります。重要な情報は確認してください。
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: chatSpacing.lg,
    paddingTop: chatSpacing.md,
    paddingBottom: Platform.OS === 'ios' ? chatSpacing.lg : chatSpacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chatColors.border,
    backgroundColor: chatColors.background,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: chatColors.border,
    backgroundColor: chatColors.surfaceSubtle,
    borderRadius: chatRadius.lg,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: chatColors.textPrimary,
    maxHeight: 120,
    paddingTop: Platform.OS === 'ios' ? 6 : 4,
    paddingBottom: 6,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: chatSpacing.sm,
  },
  sendIcon: {
    color: chatColors.textOnAccent,
    fontSize: 16,
    fontWeight: '700',
    marginTop: -1,
  },
  hint: {
    marginTop: chatSpacing.sm,
    fontSize: 11,
    lineHeight: 14,
    color: chatColors.textTertiary,
    textAlign: 'center',
  },
});

export default ChatInput;
