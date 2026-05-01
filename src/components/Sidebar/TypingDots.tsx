import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import { palette } from './aiChatStyles';

const Dot: React.FC<{ delay: number }> = ({ delay }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          delay,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, opacity]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
};

export const TypingDots: React.FC = () => (
  <View style={styles.row}>
    <Dot delay={0} />
    <Dot delay={150} />
    <Dot delay={300} />
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.muted,
    marginHorizontal: 2,
  },
});

export default TypingDots;
