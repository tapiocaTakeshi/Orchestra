import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { chatColors } from '../../theme/chatTheme';

const Dot: React.FC<{ delay: number }> = ({ delay }) => {
  const opacity = useRef(new Animated.Value(0.25)).current;

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
          toValue: 0.25,
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
  <View style={styles.row} accessibilityLabel="AI is typing">
    <Dot delay={0} />
    <Dot delay={120} />
    <Dot delay={240} />
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: chatColors.textTertiary,
    marginHorizontal: 2,
  },
});

export default TypingDots;
