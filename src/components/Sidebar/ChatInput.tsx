import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { chatColors, chatSpacing, chatRadius, chatTypography } from './theme';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export const ChatInput: React.FC<Props> = ({
  onSend,
  disabled,
  placeholder = 'AIに質問する…',
}) => {
  const [value, setValue] = useState('');
  const canSend = !disabled && value.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={chatColors.textMuted}
          style={styles.input}
          multiline
          editable={!disabled}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          returnKeyType="send"
          underlineColorAndroid="transparent"
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
                ? chatColors.accent
                : chatColors.accentDisabled,
              opacity: pressed && canSend ? 0.85 : 1,
            },
          ]}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Enterで送信 ・ Shift+Enterで改行</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: chatSpacing.lg,
    paddingTop: chatSpacing.sm,
    paddingBottom: chatSpacing.md,
    backgroundColor: chatColors.surface,
    borderTopWidth: 1,
    borderTopColor: chatColors.border,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: chatColors.surfaceMuted,
    borderRadius: chatRadius.lg,
    borderWidth: 1,
    borderColor: chatColors.border,
    paddingLeft: chatSpacing.md,
    paddingRight: chatSpacing.xs,
    paddingVertical: chatSpacing.xs,
  },
  input: {
    ...chatTypography.input,
    flex: 1,
    color: chatColors.textPrimary,
    maxHeight: 120,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 4,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: chatRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: chatSpacing.xs,
    marginBottom: 2,
  },
  sendIcon: {
    color: chatColors.textOnAccent,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  hint: {
    ...chatTypography.meta,
    color: chatColors.textMuted,
    marginTop: chatSpacing.xs,
    textAlign: 'right',
  },
});

export default ChatInput;
