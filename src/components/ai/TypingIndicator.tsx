import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { chatTheme as t } from '../../theme/chatTheme';

const Dot: React.FC<{ delay: number }> = ({ delay }) => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);

  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

  return <Animated.View style={[styles.dot, { opacity, transform: [{ translateY }] }]} />;
};

export const TypingIndicator: React.FC = () => {
  return (
    <View style={styles.wrap} accessibilityLabel="AI が入力中">
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.md,
    backgroundColor: t.color.aiBubble,
    borderRadius: t.radius.lg,
    alignSelf: 'flex-start',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.color.textMuted,
    marginHorizontal: 2,
  },
});

export default TypingIndicator;
