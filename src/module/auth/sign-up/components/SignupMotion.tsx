import { PropsWithChildren, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, View } from 'react-native';
import { COLORS } from '@/constants/colors';

export function SignupBackdrop() {
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!active) return;
      if (reduce) { reveal.setValue(1); return; }
      animation = Animated.timing(reveal, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: false });
      animation.start();
    }).catch(() => reveal.setValue(1));
    return () => { active = false; animation?.stop(); };
  }, [reveal]);
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    <View style={{ width: 620, height: 620 }}>
      <Image source={require('@/assets/images/logo.png')} resizeMode="contain" style={{ width: '100%', height: '100%', tintColor: '#FFFFFF', opacity: 0.22 }} />
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '100%', backgroundColor: COLORS.red, transform: [{ translateX: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, 660] }) }] }}>
        {Platform.OS !== 'web' && <View style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 2, backgroundColor: '#FFFFFF', opacity: 0.3 }} />}
      </Animated.View>
    </View>
  </View>;
}

export default function SignupMotion({ children, step }: PropsWithChildren<{ step: number }>) {
  const baseline = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!active) return;
      if (reduce) { baseline.setValue(1); return; }
      baseline.setValue(0);
      animation = Animated.timing(baseline, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false });
      animation.start();
    }).catch(() => baseline.setValue(1));
    return () => { active = false; animation?.stop(); };
  }, [step, baseline]);
  return <Animated.View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#DE9289', borderRadius: 16, padding: 24, opacity: baseline, transform: [{ translateY: baseline.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
    <Animated.View style={{ width: 44, height: 3, borderRadius: 2, alignSelf: 'center', backgroundColor: COLORS.red, marginBottom: 18, transform: [{ scaleX: baseline }] }} />
    {children}
  </Animated.View>;
}
