import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { chatTheme } from './theme';

interface Props {
  suggestions?: string[];
  onPickSuggestion?: (s: string) => void;
}

const DEFAULT_SUGGESTIONS = [
  'このページを要約して',
  'アイデアを3つ提案して',
  'コードをレビューして',
];

export const EmptyState: React.FC<Props> = ({
  suggestions = DEFAULT_SUGGESTIONS,
  onPickSuggestion,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>✦</Text>
      </View>
      <Text style={styles.title}>何でも聞いてください</Text>
      <Text style={styles.subtitle}>
        要約・翻訳・アイデア出しなど、{'\n'}AIがあなたの作業をサポートします。
      </Text>

      <View style={styles.suggestions}>
        {suggestions.map((s) => (
          <Pressable
            key={s}
            onPress={() => onPickSuggestion?.(s)}
            style={({ pressed }) => [
              styles.chip,
              pressed && { backgroundColor: chatTheme.colors.surfaceAlt },
            ]}
          >
            <Text style={styles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: chatTheme.spacing.lg,
    paddingVertical: chatTheme.spacing.xl,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: chatTheme.radius.pill,
    backgroundColor: chatTheme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: chatTheme.spacing.md,
  },
  icon: {
    fontSize: 22,
    color: chatTheme.colors.accent,
  },
  title: {
    fontSize: chatTheme.font.title,
    fontWeight: '600',
    color: chatTheme.colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: chatTheme.font.small,
    color: chatTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: chatTheme.spacing.lg,
  },
  suggestions: {
    width: '100%',
    gap: chatTheme.spacing.sm,
  },
  chip: {
    paddingHorizontal: chatTheme.spacing.md,
    paddingVertical: chatTheme.spacing.sm + 2,
    borderRadius: chatTheme.radius.md,
    borderWidth: 1,
    borderColor: chatTheme.colors.border,
    backgroundColor: chatTheme.colors.background,
  },
  chipText: {
    fontSize: chatTheme.font.small,
    color: chatTheme.colors.textPrimary,
  },
});

export default EmptyState;
