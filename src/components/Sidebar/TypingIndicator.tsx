import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';

/**
 * Minimal な 3 点ローディング。AI 応答待ちで表示。
 */
export const TypingIndicator: React.FC = () => {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.wrapper} accessibilityLabel="AIが応答を生成中です">
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
              transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.bubbleAiBg,
    borderRadius: 14,
    alignSelf: 'flex-start',
    marginVertical: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    marginHorizontal: 2,
    backgroundColor: colors.textSecondary,
  },
});
