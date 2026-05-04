import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { palette } from '../AIChatPanel.styles';

interface Props {
  placeholder?: string;
  disabled?: boolean;
  onSubmit: (text: string) => void;
}

export const ChatInput: React.FC<Props> = ({
  placeholder = 'メッセージを入力…',
  disabled = false,
  onSubmit,
}) => {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSubmit(value);
    setValue('');
  }, [canSend, onSubmit, value]);

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={palette.textSubtle}
          style={styles.input}
          multiline
          maxLength={4000}
          editable={!disabled}
          underlineColorAndroid="transparent"
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (Platform.OS !== 'web') return;
            handleSend();
          }}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendBtn,
            canSend ? styles.sendBtnActive : styles.sendBtnIdle,
            pressed && canSend && styles.sendBtnPressed,
          ]}
          accessibilityLabel="送信"
        >
          <Text
            style={[
              styles.sendGlyph,
              canSend ? styles.sendGlyphActive : styles.sendGlyphIdle,
            ]}
          >
            ↑
          </Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Shift + Enter で改行</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: palette.bg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    minHeight: 22,
    maxHeight: 120,
    fontSize: 14,
    lineHeight: 20,
    color: palette.text,
    paddingTop: Platform.OS === 'ios' ? 4 : 2,
    paddingBottom: Platform.OS === 'ios' ? 4 : 2,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnIdle: {
    backgroundColor: palette.surfaceAlt,
  },
  sendBtnActive: {
    backgroundColor: palette.accent,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendGlyph: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  sendGlyphIdle: {
    color: palette.textSubtle,
  },
  sendGlyphActive: {
    color: palette.accentOn,
  },
  hint: {
    marginTop: 6,
    paddingHorizontal: 4,
    fontSize: 10.5,
    color: palette.textSubtle,
  },
});
