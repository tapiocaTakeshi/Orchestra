import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { chatTheme as t } from '../../theme/chatTheme';

interface Props {
  prompts?: string[];
  onSelect: (prompt: string) => void;
}

const DEFAULT_PROMPTS = [
  '今日のタスクを整理して',
  'このページを要約して',
  '次のステップを提案して',
  'コードをレビューして',
];

export const QuickPrompts: React.FC<Props> = ({ prompts = DEFAULT_PROMPTS, onSelect }) => {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>こんなことが聞けます</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {prompts.map((p) => (
          <Pressable
            key={p}
            onPress={() => onSelect(p)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <Text style={styles.chipText}>{p}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: t.space.md,
  },
  title: {
    fontSize: t.font.xs,
    color: t.color.textMuted,
    fontWeight: '600',
    marginBottom: t.space.sm,
    paddingHorizontal: t.space.lg,
    letterSpacing: 0.3,
  },
  row: {
    paddingHorizontal: t.space.lg,
    gap: t.space.sm,
  },
  chip: {
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.pill,
    backgroundColor: t.color.surface,
    borderWidth: 1,
    borderColor: t.color.border,
    marginRight: t.space.sm,
  },
  chipPressed: {
    backgroundColor: t.color.surfaceAlt,
  },
  chipText: {
    fontSize: t.font.sm,
    color: t.color.text,
  },
});

export default QuickPrompts;
