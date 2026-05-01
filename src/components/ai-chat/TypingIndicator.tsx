import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/**
 * AI が考え中であることを示す 3 ドットインジケータ。
 * Minimal デザインに合わせ、控えめなフェードのみ。
 */
export const TypingIndicator: React.FC = () => {
  const dots = [useRef(new Animated.Value(0.3)).current,
                useRef(new Animated.Value(0.3)).current,
                useRef(new Animated.Value(0.3)).current];

  useEffect(() => {
    const animations = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, {
            toValue: 1,
            duration: 360,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0.3,
            duration: 360,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={styles.wrap}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F4F4F5',
    borderRadius: 14,
    borderTopLeftRadius: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#52525B',
  },
});

export default TypingIndicator;
