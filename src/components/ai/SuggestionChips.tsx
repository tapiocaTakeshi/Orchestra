import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { aiChatTheme as t } from '../../theme/aiChatTheme';

interface Props {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export const SuggestionChips: React.FC<Props> = ({ suggestions, onSelect }) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {suggestions.map((s) => (
        <Pressable
          key={s}
          onPress={() => onSelect(s)}
          style={({ pressed }) => [
            styles.chip,
            pressed && { backgroundColor: t.colors.accentSoft },
          ]}
        >
          <Text style={styles.chipText} numberOfLines={1}>
            {s}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.sm,
  },
  chip: {
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.background,
    marginRight: t.spacing.sm,
  },
  chipText: {
    fontSize: t.font.small,
    color: t.colors.textPrimary,
  },
});

export default SuggestionChips;
