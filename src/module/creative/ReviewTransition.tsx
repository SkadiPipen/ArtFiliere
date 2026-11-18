import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

export default function ReviewTransition({ children }: { children: ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!active) return;
      if (reduce) { progress.setValue(1); return; }
      animation = Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true });
      animation.start();
    }).catch(() => progress.setValue(1));
    return () => { active = false; animation?.stop(); };
  }, [progress]);
  return <Animated.View style={{ flex: 1, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>{children}</Animated.View>;
}
