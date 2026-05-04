import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
  onPress: () => void;
}

const SuggestionChip: React.FC<Props> = ({ label, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
  >
    <Text style={styles.text} numberOfLines={1}>
      {label}
    </Text>
  </Pressable>
);

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
    backgroundColor: '#FAFAFA',
    borderColor: '#DCDCDC',
  },
  text: {
    fontSize: 12.5,
    color: '#5B5B63',
    fontWeight: '500',
  },
});

export default SuggestionChip;
