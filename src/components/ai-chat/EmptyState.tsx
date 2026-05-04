import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { aiChatTheme as t } from '../../theme/aiChatTheme';

interface Props {
  onPickPrompt?: (prompt: string) => void;
}

const SUGGESTIONS = [
  '今日のタスクを要約して',
  'このコードをレビューして',
  'アイデアを 3 つ出して',
];

const EmptyState: React.FC<Props> = ({ onPickPrompt }) => {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Text style={styles.icon}>✨</Text>
      </View>
      <Text style={styles.title}>AI アシスタント</Text>
      <Text style={styles.subtitle}>
        質問・要約・アイデア出しなど、{'\n'}気軽に話しかけてみてください。
      </Text>

      <View style={styles.suggestions}>
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => onPickPrompt?.(s)}
            style={({ pressed }) => [
              styles.chip,
              pressed && { backgroundColor: t.colors.accentSoft },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`サンプル: ${s}`}
          >
            <Text style={styles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing.xl,
    paddingVertical: t.spacing.xxl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: t.spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  icon: { fontSize: 24 },
  title: {
    ...t.typography.title,
    color: t.colors.textPrimary,
    marginBottom: t.spacing.sm,
  },
  subtitle: {
    ...t.typography.body,
    color: t.colors.textSecondary,
    textAlign: 'center',
    marginBottom: t.spacing.xl,
  },
  suggestions: {
    width: '100%',
    gap: t.spacing.sm,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    backgroundColor: t.colors.background,
    borderRadius: t.radius.pill,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chipText: {
    ...t.typography.body,
    color: t.colors.textPrimary,
  },
});

export default EmptyState;
