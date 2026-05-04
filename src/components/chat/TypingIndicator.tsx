import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { chatTheme as t } from '../../theme/chatTheme';

export const TypingIndicator: React.FC = () => {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>AI</Text>
      </View>
      <View style={styles.bubble}>
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
                transform: [
                  {
                    translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: t.spacing.xs,
    paddingHorizontal: t.spacing.lg,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: t.radius.pill,
    backgroundColor: t.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: t.spacing.sm,
  },
  avatarText: {
    color: t.color.accent,
    fontSize: t.font.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.color.bubbleAiBg,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm + 2,
    borderRadius: t.radius.lg,
    borderTopLeftRadius: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.color.textSecondary,
    marginHorizontal: 2,
  },
});

export default TypingIndicator;
