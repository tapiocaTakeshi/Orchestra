import React from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
} from 'react-native';
import { aiChatTheme as t } from './theme';

interface Props {
  actions: string[];
  onPick: (text: string) => void;
}

export const QuickActions: React.FC<Props> = ({ actions, onPick }) => {
  if (!actions.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>クイック質問</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {actions.map((a) => (
          <TouchableOpacity
            key={a}
            style={styles.chip}
            onPress={() => onPick(a)}
            activeOpacity={0.7}
          >
            <Text style={styles.chipText}>{a}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: t.spacing(4),
    paddingTop: t.spacing(2),
    paddingBottom: t.spacing(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.color.border,
    backgroundColor: t.color.bg,
  },
  label: {
    fontSize: t.font.xs,
    color: t.color.textSubtle,
    marginBottom: t.spacing(1.5),
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  row: {
    gap: 8,
    paddingRight: t.spacing(2),
  },
  chip: {
    paddingHorizontal: t.spacing(3),
    paddingVertical: t.spacing(1.5),
    borderRadius: t.radius.pill,
    backgroundColor: t.color.surface,
    borderWidth: 1,
    borderColor: t.color.border,
    marginRight: 8,
  },
  chipText: {
    fontSize: t.font.sm,
    color: t.color.text,
  },
});
