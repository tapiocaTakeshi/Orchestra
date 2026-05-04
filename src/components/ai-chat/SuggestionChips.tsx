import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

interface Props {
  items: string[];
  onPress: (text: string) => void;
}

export const SuggestionChips: React.FC<Props> = ({ items, onPress }) => {
  if (!items.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.wrap}
    >
      {items.map((item) => (
        <Pressable
          key={item}
          onPress={() => onPress(item)}
          style={({ pressed }) => [
            styles.chip,
            pressed && styles.chipPressed,
          ]}
        >
          <Text style={styles.chipText}>{item}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECECEE',
    backgroundColor: '#FAFAFA',
  },
  chipPressed: {
    backgroundColor: '#F4F4F5',
  },
  chipText: {
    fontSize: 12,
    color: '#111114',
  },
});

export default SuggestionChips;
