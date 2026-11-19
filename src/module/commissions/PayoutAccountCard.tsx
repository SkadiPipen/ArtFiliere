import { payoutDestinationName } from './PayoutDestinationSelect';
import { Text } from '@/components/Typography';
import { LinearGradient } from 'expo-linear-gradient';
import { CreditCard, Pencil, Wallet } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';

export default function PayoutAccountCard({ info, loading, error, message, onEdit }: {
  info: any; loading: boolean; error: string; message: string; onEdit: () => void;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!active) return;
      if (reduce) { entrance.setValue(1); return; }
      animation = Animated.sequence([
        Animated.timing(entrance, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(shine, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]);
      animation.start();
    }).catch(() => entrance.setValue(1));
    return () => { active = false; animation?.stop(); };
  }, [entrance, shine]);
  const routing = info?.routing || '';
  const provider = payoutDestinationName(routing) || 'Bank / e-wallet';
  return <Animated.View id="commission-detail-payout" style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
    <LinearGradient colors={['#AD4549', '#7C2537', '#4E1E32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={s.ring} /><View style={[s.ring, { right: -105, top: -125 }]} />
        <Animated.View style={{ position: 'absolute', top: -80, bottom: -80, width: 90, opacity: shine.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.2, 0.2, 0] }), transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-140, 650] }) }, { rotate: '22deg' }] }}>
          <LinearGradient colors={['transparent', '#FFFFFF', 'transparent']} style={{ flex: 1 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
        </Animated.View>
      </View>
      <View style={s.row}><Text style={s.title}>Payout account</Text><Text style={s.badge}>{loading ? 'Loading…' : error ? 'Needs attention' : info?.configured ? 'Saved' : 'Setup required'}</Text></View>
      <View style={s.row}>
        <View style={s.chip}><View style={s.chipVertical} /><View style={s.chipHorizontal} /></View>
        {info?.fields?.routing_type === 'SWIFT' ? <CreditCard size={25} color="#F1D4A8" /> : <Wallet size={25} color="#F1D4A8" />}
      </View>
      {loading ? <ActivityIndicator color="#FFF" /> : <Text style={s.number}>{info?.configured ? `••••  ••••  ${info.account_last4}` : '••••  ••••  ••••'}</Text>}
      <View style={s.row}><View style={{ flex: 1, gap: 4 }}><Text style={s.label}>PAYOUT DESTINATION</Text><Text style={s.provider}>{provider}</Text></View><Text style={s.brand}>ArtFiliere</Text></View>
      <Text style={s.note}>{info?.configured ? 'Milestone payout updates appear on each stage card.' : 'Add your payout account to receive milestone payments.'}</Text>
      {!!error && <Text accessibilityRole="alert" style={s.notice}>{error}</Text>}
      {!!message && <Text accessibilityLiveRegion="polite" style={s.notice}>{message}</Text>}
      <Pressable accessibilityRole="button" disabled={loading} onPress={onEdit} style={({ pressed }) => [s.edit, { opacity: loading ? 0.5 : pressed ? 0.8 : 1 }]}><Pencil size={14} color="#762B37" /><Text style={s.editText}>{info?.configured ? 'Edit payout account' : 'Add payout account'}</Text></Pressable>
    </LinearGradient>
  </Animated.View>;
}

const s = StyleSheet.create({
  card: { padding: 22, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#BC7377', gap: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  title: { color: '#FFF4E7', fontSize: 17, fontWeight: '700' },
  badge: { color: '#FFF5DC', backgroundColor: '#FFFFFF22', borderWidth: 1, borderColor: '#FFFFFF33', borderRadius: 16, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: '600' },
  ring: { position: 'absolute', width: 270, height: 270, borderRadius: 135, borderWidth: 30, borderColor: '#FFFFFF08', right: -150, top: -60 },
  chip: { width: 42, height: 32, backgroundColor: '#DDBB80', borderRadius: 7, borderWidth: 1, borderColor: '#F9DFAB', overflow: 'hidden' },
  chipVertical: { position: 'absolute', top: 0, bottom: 0, left: 13, width: 14, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#AE8751' },
  chipHorizontal: { position: 'absolute', top: 15, left: 0, right: 0, height: 1, backgroundColor: '#AE8751' },
  number: { color: '#FFF6E8', fontSize: 21, fontWeight: '600', letterSpacing: 2 },
  label: { fontSize: 9, color: '#F0C9C1', letterSpacing: 1.3 },
  provider: { color: '#FFF5E8', fontSize: 16, fontWeight: '700' },
  brand: { color: '#F0C99D', fontSize: 14, fontWeight: '700' },
  note: { color: '#EFD5CE', fontSize: 11, lineHeight: 17 },
  notice: { color: '#FFF5E8', backgroundColor: '#FFFFFF15', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 18 },
  edit: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF2E3', paddingHorizontal: 15, paddingVertical: 11, borderRadius: 10 },
  editText: { color: '#762B37', fontSize: 12, fontWeight: '700' },
});
