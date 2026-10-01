import { Check } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export default function AppToast({ visible, message, onDismiss, duration = 1000 }: { visible: boolean; message: string; onDismiss: () => void; duration?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.72)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  const [mounted, setMounted] = useState(false);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;
    setMounted(true);
    opacity.setValue(0);
    scale.setValue(0.72);
    translateY.setValue(14);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 150, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, friction: 7, tension: 130, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 170, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.9, duration: 170, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          dismissRef.current();
        }
      });
    }, Math.max(0, duration - 180));
    return () => clearTimeout(timer);
  }, [visible, duration, opacity, scale, translateY]);

  if (!visible && !mounted) return null;
  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }, { scale }] }]}>
        <View style={styles.icon}><Check color="#55504E" size={18} strokeWidth={3} /></View>
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  toast: { minWidth: 122, maxWidth: 190, minHeight: 108, backgroundColor: 'rgba(41, 41, 41, 0.88)', borderRadius: 7, paddingHorizontal: 18, paddingVertical: 17, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 12 },
  icon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  text: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
