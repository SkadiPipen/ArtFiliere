import { createContext, useContext, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import ArtistEarningsScreen from './ArtistEarningsScreen';

export const ArtistEarningsContext = createContext<(() => void) | null>(null);

export function useOpenArtistEarnings() {
  const open = useContext(ArtistEarningsContext);
  if (!open) throw Error('Artist earnings must be opened inside the home workspace.');
  return open;
}

export default function ArtistEarningsPanel({ left, onDismiss }: { left: number; onDismiss: () => void }) {
  const { width } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);
  const closing = useRef(false);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    animation.current?.stop();
    if (reduceMotion.current) { dismiss.current(); return; }
    animation.current = Animated.timing(progress, {
      toValue: 0, duration: 450, easing: Easing.inOut(Easing.cubic), useNativeDriver: Platform.OS !== 'web',
    });
    animation.current.start(({ finished }) => { if (finished) dismiss.current(); });
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!active || closing.current) return;
      reduceMotion.current = reduce;
      if (reduce) { progress.setValue(1); return; }
      animation.current = Animated.timing(progress, {
        toValue: 1, duration: 550, easing: Easing.inOut(Easing.cubic), useNativeDriver: Platform.OS !== 'web',
      });
      animation.current.start();
    }).catch(() => { if (active && !closing.current) progress.setValue(1); });
    const reduced = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      reduceMotion.current = value;
      if (value && !closing.current) { animation.current?.stop(); progress.setValue(1); }
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => { closeRef.current(); return true; });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closeRef.current(); }
    };
    if (Platform.OS === 'web') document.addEventListener('keydown', escape);
    return () => {
      active = false; animation.current?.stop(); reduced.remove(); back.remove();
      if (Platform.OS === 'web') document.removeEventListener('keydown', escape);
    };
  }, [progress]);

  return <Animated.View accessibilityViewIsModal={left === 0} style={[StyleSheet.absoluteFill, {
    left, zIndex: 10, elevation: 10, backgroundColor: '#FAF7F3',
    transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [Math.max(1, width - left), 0] }) }],
  }]}>
    <ArtistEarningsScreen onBack={() => closeRef.current()} />
  </Animated.View>;
}
