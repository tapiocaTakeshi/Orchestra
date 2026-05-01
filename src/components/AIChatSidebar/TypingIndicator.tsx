import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Easing } from 'react-native';
import { colors, spacing } from './theme';

/**
 * Minimal three-dot typing indicator. Each dot fades in/out
 * with a small phase offset to suggest rhythm without being noisy.
 */
export const TypingIndicator: React.FC = () => {
  const dots = [useRef(new Animated.Value(0.25)).current,
                useRef(new Animated.Value(0.25)).current,
                useRef(new Animated.Value(0.25)).current];

  useEffect(() => {
    const animations = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, {
            toValue: 1,
            duration: 360,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.25,
            duration: 360,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [dots]);

  return (
    <View style={styles.row} accessibilityLabel="AI is typing">
      {dots.map((v, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: v }]} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.textMuted,
  },
});

export default TypingIndicator;
