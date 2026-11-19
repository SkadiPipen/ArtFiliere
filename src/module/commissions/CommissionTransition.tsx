import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

export default function CommissionTransition({ children, direction = 'up' }: { children: ReactNode; direction?: 'up' | 'left' }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!active) return;
      if (reduce) { progress.setValue(1); return; }
      animation = Animated.timing(progress, { toValue: 1, duration: direction === 'left' ? 550 : 450, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' });
      animation.start();
    }).catch(() => progress.setValue(1));
    return () => { active = false; animation?.stop(); };
  }, [progress, direction]);
  return <Animated.View style={{ flex: 1, opacity: progress, minWidth: 0, minHeight: 0, transform: direction === 'left' ? [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>{children}</Animated.View>;
}

