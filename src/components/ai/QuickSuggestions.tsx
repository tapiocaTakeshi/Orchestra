import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { chatTheme } from '../../theme/chatTheme';

export interface QuickSuggestionsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export const QuickSuggestions: React.FC<QuickSuggestionsProps> = ({ suggestions, onSelect }) => {
  if (!suggestions?.length) return null;
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>提案</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {suggestions.map((s, i) => (
          <TouchableOpacity
            key={`${i}-${s}`}
            onPress={() => onSelect(s)}
            activeOpacity={0.7}
            style={styles.chip}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: chatTheme.spacing.sm,
    paddingBottom: chatTheme.spacing.xs,
  },
  label: {
    fontSize: chatTheme.typography.tiny,
    color: chatTheme.colors.textMuted,
    paddingHorizontal: chatTheme.spacing.md,
    marginBottom: chatTheme.spacing.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  scroll: {
    paddingHorizontal: chatTheme.spacing.md,
    gap: chatTheme.spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: chatTheme.colors.border,
    backgroundColor: chatTheme.colors.background,
    paddingHorizontal: chatTheme.spacing.md,
    paddingVertical: 6,
    borderRadius: chatTheme.radius.pill,
    marginRight: chatTheme.spacing.sm,
  },
  chipText: {
    fontSize: chatTheme.typography.small,
    color: chatTheme.colors.textPrimary,
  },
});

export default QuickSuggestions;
