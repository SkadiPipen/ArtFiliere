import { Text } from '@/components/Typography';
import { useRouter } from 'expo-router';
import { Paintbrush } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';

export default function FindArtistShortcut({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const progress = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (reducedMotion || !size.width) return;
    progress.setValue(0);
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 4200, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false }));
    loop.start();
    return () => loop.stop();
  }, [progress, reducedMotion, size.width, size.height]);
  // Sample the straight edges and rounded corners, keeping the spark on the border.
  const w = Math.max(24, size.width - 2), h = Math.max(24, size.height - 2), r = 11;
  const lengths = [w - 2*r, Math.PI*r/2, h - 2*r, Math.PI*r/2, w - 2*r, Math.PI*r/2, h - 2*r, Math.PI*r/2];
  const total = lengths.reduce((a,b) => a+b, 0);
  const points = Array.from({ length: 81 }, (_, i) => {
    let d = total*i/80, part = 0;
    while (part < 7 && d > lengths[part]) d -= lengths[part++];
    const t = d/lengths[part];
    if (part === 0) return [r+d, 0];
    if (part === 2) return [w, r+d];
    if (part === 4) return [w-r-d, h];
    if (part === 6) return [0, h-r-d];
    const centers = [[w-r,r], [w-r,h-r], [r,h-r], [r,r]];
    const corner = (part-1)/2, angle = (-1+corner)*Math.PI/2+t*Math.PI/2;
    return [centers[corner][0]+r*Math.cos(angle), centers[corner][1]+r*Math.sin(angle)];
  });
  const inputRange = points.map((_,i) => i/80);
  return <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/(home)/artists')} onLayout={e => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} style={[styles.button, style]}>
    <Paintbrush size={18} color="#C15656" /><Text style={styles.label}>Find an artist</Text>
    {!reducedMotion && size.width > 0 && <Animated.View pointerEvents="none" style={[styles.spark, { transform: [
      { translateX: progress.interpolate({ inputRange, outputRange: points.map(p => p[0]) }) },
      { translateY: progress.interpolate({ inputRange, outputRange: points.map(p => p[1]) }) },
    ] }]} />}
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  button: { padding: 14, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#C15656', backgroundColor: 'transparent', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  label: { color: '#B54C4C', fontWeight: '700', textAlign: 'center' },
  spark: { position: 'absolute', left: -3, top: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: '#C15656', borderWidth: 1, borderColor: '#d5abab', shadowColor: '#F57E37', shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
});
