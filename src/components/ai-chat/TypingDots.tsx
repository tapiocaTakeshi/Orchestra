import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/**
 * 3 つのドットがふわっと上下する「考え中…」インジケータ。
 */
export const TypingDots: React.FC<{ color?: string }> = ({ color = '#8A8A8A' }) => {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    const anims = [make(a1, 0), make(a2, 120), make(a3, 240)];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [a1, a2, a3]);

  const translate = (v: Animated.Value) =>
    v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const opacity = (v: Animated.Value) =>
    v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  return (
    <View style={styles.row} accessibilityLabel="AI が入力中">
      {[a1, a2, a3].map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: color,
              opacity: opacity(v),
              transform: [{ translateY: translate(v) }],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
});

export default TypingDots;
