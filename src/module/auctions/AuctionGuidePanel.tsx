import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { memo, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

const steps = [
  ['Explore the artwork', 'Check its details, current bid, minimum bid increase, and closing time.'],
  ['Review the terms', 'Read and accept the license and delivery terms before placing a bid.'],
  ['Place your bid', 'Your bid must meet or exceed the minimum amount shown. You cannot bid on your own artwork.'],
  ['Follow the auction', 'If someone outbids you, you can place a higher bid before the auction closes.'],
  ['Complete your purchase', 'If you win, sign the agreement and complete payment within 48 hours of winner selection. The winning price and accepted license terms remain fixed. Physical delivery fees are calculated separately at checkout.'],
  ['Receive your artwork', 'Receive the digital artwork or arrange physical delivery according to your agreement.'],
];

export default memo(function AuctionGuidePanel({ width, onDismiss }: { width: number; onDismiss: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useRef(false);
  const closing = useRef(false);
  const mounted = useRef(true);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const webAnimation = useRef<Animation | null>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    animation.current?.stop();
    if (reduced.current) { webAnimation.current?.cancel(); dismiss.current(); return; }
    if (Platform.OS === 'web') {
      const element = document.getElementById('auction-guide-panel');
      if (element?.animate) {
        // Capture the current position before cancelling, including an opening
        // slide interrupted by Escape or a quick second click.
        const current = window.getComputedStyle(element).transform;
        webAnimation.current?.cancel();
        element.style.willChange = 'transform';
        webAnimation.current = element.animate([{ transform: current }, { transform: 'translate3d(100%, 0, 0)' }], {
          duration: 380, easing: 'cubic-bezier(0.4, 0, 0.8, 0.4)', fill: 'both',
        });
        webAnimation.current.onfinish = () => { if (mounted.current) dismiss.current(); };
        return;
      }
    }
    animation.current = Animated.timing(progress, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.cubic), useNativeDriver: Platform.OS !== 'web' });
    animation.current.start(({ finished }) => { if (finished && mounted.current) dismiss.current(); });
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useLayoutEffect(() => {
    mounted.current = true;
    const start = () => {
      if (!mounted.current || closing.current) return;
      if (reduced.current) { progress.setValue(1); return; }
      if (Platform.OS === 'web') {
        const element = document.getElementById('auction-guide-panel');
        if (element?.animate) {
          element.style.willChange = 'transform';
          webAnimation.current = element.animate([
            { transform: 'translate3d(100%, 0, 0)' }, { transform: 'translate3d(0, 0, 0)' },
          ], { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
          webAnimation.current.onfinish = () => { element.style.willChange = 'auto'; };
          return;
        }
      }
      animation.current = Animated.timing(progress, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' });
      animation.current.start();
    };
    if (Platform.OS === 'web') {
      // Start before first paint; do not wait for an asynchronous preference
      // query or send per-frame updates through React Native's JS driver.
      reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      start();
    } else {
      void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted.current) { reduced.current = value; start(); } }).catch(start);
    }
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      reduced.current = value;
      if (value) {
        animation.current?.stop();
        webAnimation.current?.cancel();
        if (closing.current) dismiss.current(); else progress.setValue(1);
      }
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => { closeRef.current(); return true; });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closeRef.current(); }
    };
    if (Platform.OS === 'web') {
      document.addEventListener('keydown', keydown);
      document.getElementById('auction-guide-close')?.focus({ preventScroll: true });
    }
    return () => {
      mounted.current = false;
      animation.current?.stop(); webAnimation.current?.cancel(); motion.remove(); back.remove();
      if (Platform.OS === 'web') document.removeEventListener('keydown', keydown);
    };
  }, [progress]);

  return <Animated.View id="auction-guide-panel" accessibilityLabel="How auctions work" style={[s.panel, { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [Math.max(1, width), 0] }) }] }]}>
    <View style={s.header}>
      <TouchableOpacity id="auction-guide-close" accessibilityRole="button" accessibilityLabel="Close auction guide" style={s.close} onPress={() => closeRef.current()}>
        <Ionicons name="close" size={23} color="#8C534A" />
      </TouchableOpacity>
    </View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.content, width < 600 && s.mobileContent]}>
      <View style={s.intro}>
        <Text style={s.eyebrow}>YOUR GUIDE TO BIDDING</Text>
        <Text accessibilityRole="header" style={[s.title, width < 600 && { fontSize: 27 }]}>How Auctions Work</Text>
        <View style={s.baseline} />
        <Text style={s.introduction}>ArtFiliere auctions let you compete for artworks by placing bids within a set time. The highest eligible bidder wins and proceeds to checkout under the published auction terms.</Text>
        <Text style={s.body}>Each auction brings together an artist’s approved artwork, its license terms, and a bidding deadline. Review the details before joining, then follow these steps from your first bid to receiving your artwork.</Text>
      </View>
      <View style={s.steps}>
        {steps.map(([title, description], index) => <View key={title} style={s.step}>
          <View style={s.number}><Text style={s.numberText}>{index + 1}</Text></View>
          <View style={s.stepCopy}><Text style={s.stepTitle}>{title}</Text><Text style={s.body}>{description}</Text></View>
        </View>)}
      </View>
      <View style={s.notice}>
        <Ionicons name="time-outline" size={22} color="#B74F50" />
        <View style={s.stepCopy}><Text style={s.stepTitle}>If the winner does not pay</Text><Text style={s.body}>An eligible runner-up may receive an optional offer at their own bid amount, with 24 hours to accept.</Text></View>
      </View>
      <TouchableOpacity accessibilityRole="button" style={s.gotIt} onPress={() => closeRef.current()}><Text style={s.gotItText}>Got it</Text><Ionicons name="checkmark" size={19} color="#FFFFFF" /></TouchableOpacity>
    </ScrollView>
  </Animated.View>;
});

const s = StyleSheet.create({
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 2000, elevation: 20, backgroundColor: '#FAF7F3' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EADBD1', backgroundColor: '#FFFFFF' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  backText: { color: '#B74F50', fontWeight: '700', fontSize: 13 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#F6EBE5' },
  content: { width: '100%', maxWidth: 940, alignSelf: 'center', padding: 36, paddingBottom: 44, gap: 24 },
  mobileContent: { padding: 18, paddingBottom: 120, gap: 18 },
  intro: { gap: 12 },
  icon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#F3E1D7' },
  eyebrow: { color: '#AE7060', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#3F2D28', fontSize: 34, fontFamily: 'LoraSemiBold' },
  baseline: { width: 52, height: 3, borderRadius: 2, backgroundColor: '#BC5454', marginBottom: 2 },
  introduction: { color: '#694D43', fontSize: 16, lineHeight: 25 },
  body: { color: '#7C655B', fontSize: 14, lineHeight: 23 },
  steps: { gap: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 18, borderWidth: 1, borderColor: '#ECDCD1', borderRadius: 16, backgroundColor: '#FFFFFF' },
  number: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#BC5454', alignItems: 'center', justifyContent: 'center' },
  numberText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  stepCopy: { flex: 1, minWidth: 0, gap: 5 },
  stepTitle: { color: '#6D3D35', fontWeight: '800', fontSize: 15 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 18, borderRadius: 14, backgroundColor: '#F5E6D9', borderWidth: 1, borderColor: '#EAD3C2' },
  gotIt: { minHeight: 48, paddingHorizontal: 28, borderRadius: 24, backgroundColor: '#BC5454', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  gotItText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
