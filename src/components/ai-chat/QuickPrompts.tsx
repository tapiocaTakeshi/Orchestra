import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from './theme';

interface Prompt {
  icon: string;
  label: string;
  prompt: string;
}

const DEFAULT_PROMPTS: Prompt[] = [
  { icon: '✨', label: '今日のまとめ', prompt: '今日のタスクを要約して教えて' },
  { icon: '💡', label: 'アイデア出し', prompt: '新しい企画のアイデアを5つ提案して' },
  { icon: '📝', label: '文章を整える', prompt: '次の文章を自然な日本語に整えて：' },
  { icon: '🔍', label: '質問する', prompt: '〇〇について簡潔に教えて' },
];

interface Props {
  onSelect: (prompt: string) => void;
}

export const QuickPrompts: React.FC<Props> = ({ onSelect }) => {
  return (
    <View style={styles.container}>
      <View style={styles.heroIconWrap}>
        <Text style={styles.heroIcon}>✦</Text>
      </View>
      <Text style={styles.heroTitle}>AI アシスタント</Text>
      <Text style={styles.heroSubtitle}>
        質問や依頼を入力してください{'\n'}下のサンプルからも始められます
      </Text>

      <Text style={styles.sectionLabel}>SUGGESTIONS</Text>
      <View style={styles.grid}>
        {DEFAULT_PROMPTS.map((p) => (
          <TouchableOpacity
            key={p.label}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => onSelect(p.prompt)}
          >
            <Text style={styles.cardIcon}>{p.icon}</Text>
            <Text style={styles.cardLabel}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroIcon: {
    fontSize: 26,
    color: colors.accent,
  },
  heroTitle: {
    ...typography.title,
    fontSize: 18,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.caption,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  cardIcon: {
    fontSize: 18,
    marginBottom: spacing.xs,
  },
  cardLabel: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
});

export default QuickPrompts;
