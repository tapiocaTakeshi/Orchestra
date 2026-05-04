import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
  onPress?: () => void;
}

export const SuggestionChip: React.FC<Props> = ({ label, onPress }) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        pressed && styles.chipPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
  },
  chipPressed: {
    backgroundColor: '#F4F4F5',
    borderColor: '#D9D9D9',
  },
  chipText: {
    fontSize: 12,
    color: '#1A1A1A',
  },
});

export default SuggestionChip;
