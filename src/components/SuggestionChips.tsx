import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { chatTheme } from '../theme/chatTheme';

interface Props {
  suggestions: string[];
  onSelect: (s: string) => void;
}

export const SuggestionChips: React.FC<Props> = ({ suggestions, onSelect }) => {
  if (!suggestions?.length) return null;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>よく使う質問</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {suggestions.map((s) => (
          <TouchableOpacity
            key={s}
            activeOpacity={0.7}
            onPress={() => onSelect(s)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: chatTheme.spacing.xs,
    paddingBottom: chatTheme.spacing.xs,
  },
  label: {
    paddingHorizontal: chatTheme.spacing.md,
    marginBottom: chatTheme.spacing.xs,
    fontSize: chatTheme.font.sizeXs,
    color: chatTheme.colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  scroll: {
    paddingHorizontal: chatTheme.spacing.md,
    gap: chatTheme.spacing.xs,
  },
  chip: {
    paddingHorizontal: chatTheme.spacing.sm,
    paddingVertical: chatTheme.spacing.xs,
    borderRadius: chatTheme.radius.pill,
    backgroundColor: chatTheme.colors.surface,
    borderWidth: 1,
    borderColor: chatTheme.colors.border,
    marginRight: chatTheme.spacing.xs,
  },
  chipText: {
    fontSize: chatTheme.font.sizeSm,
    color: chatTheme.colors.textPrimary,
  },
});

export default SuggestionChips;
