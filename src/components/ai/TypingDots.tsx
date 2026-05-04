import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';

const Dot: React.FC<{ delay: number }> = ({ delay }) => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 400,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, v]);

  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  return <Animated.View style={[styles.dot, { transform: [{ translateY }], opacity }]} />;
};

const TypingDots: React.FC = () => (
  <View style={styles.row}>
    <Dot delay={0} />
    <Dot delay={120} />
    <Dot delay={240} />
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', height: 12 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9A9AA2',
    marginHorizontal: 2,
  },
});

export default TypingDots;
