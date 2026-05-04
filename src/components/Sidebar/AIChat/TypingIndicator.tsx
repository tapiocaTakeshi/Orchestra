import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Text } from 'react-native';
import { chatTheme } from './theme';

const Dot: React.FC<{ delay: number }> = ({ delay }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, opacity]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
};

export const TypingIndicator: React.FC = () => {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>AI</Text>
      </View>
      <View style={styles.bubble}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: chatTheme.spacing.sm,
    marginBottom: chatTheme.spacing.md,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: chatTheme.radius.pill,
    backgroundColor: chatTheme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: chatTheme.colors.accent,
  },
  bubble: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: chatTheme.spacing.md,
    paddingVertical: chatTheme.spacing.sm + 4,
    borderRadius: chatTheme.radius.lg,
    borderBottomLeftRadius: chatTheme.radius.sm,
    backgroundColor: chatTheme.colors.bubbleAssistant,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: chatTheme.colors.textSecondary,
  },
});

export default TypingIndicator;
