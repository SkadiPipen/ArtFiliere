import { Text } from '@/components/Typography';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, ScrollView, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export type EarningsBucket = { label: string; received: string; available: string; pending: string; processing: string };
export const earningsSeries = [
  { key: 'received', label: 'Received', color: '#8B1E2D' },
  { key: 'available', label: 'Available', color: '#F28C28' },
  { key: 'pending', label: 'Pending', color: '#EF746F' },
  { key: 'processing', label: 'Processing', color: '#D4A017' },
] as const;
const amount = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value);

export default function EarningsChart({ buckets }: { buckets: EarningsBucket[] }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(360);
  useEffect(() => {
    let active = true; let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!active) return;
      if (reduce) { progress.setValue(1); return; }
      progress.setValue(0);
      animation = Animated.timing(progress, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: false }); animation.start();
    }).catch(() => progress.setValue(1));
    return () => { active = false; animation?.stop(); };
  }, [buckets, progress]);
  const peak = Math.max(1, ...buckets.flatMap(bucket => earningsSeries.map(item => Number(bucket[item.key]))));
  const max = Math.ceil(peak / Math.pow(10, Math.floor(Math.log10(peak)))) * Math.pow(10, Math.floor(Math.log10(peak)));
  const plotWidth = Math.max(width - 80, buckets.length * 40);
  const totals = earningsSeries.map(item => ({ ...item, amount: buckets.reduce((sum, bucket) => sum + Number(bucket[item.key]), 0) }));
  const total = totals.reduce((sum, item) => sum + item.amount, 0);
  const circumference = 2 * Math.PI * 54;
  let offset = 0;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ gap: 16, minWidth: 0 }}>
    <View style={{ borderWidth: 1, borderColor: '#EAD4C8', borderRadius: 14, padding: 12, backgroundColor: '#FFFBF8' }}>
      <Text style={{ fontWeight: '700', color: '#824B39', fontSize: 14, marginBottom: 14 }}>Earnings by period</Text>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 58, height: 204, justifyContent: 'space-between', paddingBottom: 14 }}>{[4, 3, 2, 1, 0].map(n => <Text key={n} style={{ fontSize: 10, color: '#937E73' }}>{amount(max * n / 4)}</Text>)}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ width: plotWidth, height: 226 }}>
            {[0, 1, 2, 3, 4].map(n => <View key={n} style={{ position: 'absolute', top: n * 46, left: 0, right: 0, height: 1, backgroundColor: '#F0E1D8' }} />)}
            <View style={{ height: 184, flexDirection: 'row', alignItems: 'flex-end' }}>{buckets.map(bucket => <View key={bucket.label} accessibilityLabel={`${bucket.label}: ${earningsSeries.map(item => `${item.label} ${amount(Number(bucket[item.key]))}`).join(', ')}`} style={{ width: plotWidth / buckets.length, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 184 }}>{earningsSeries.map(item => <Animated.View key={item.key} style={{ width: 6, height: Animated.multiply(progress, Number(bucket[item.key]) / max * 180), backgroundColor: item.color, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderWidth: Number(bucket[item.key]) ? 0.5 : 0, borderColor: item.color }} />)}</View>
              <Text style={{ position: 'absolute', top: 192, fontSize: 10, color: '#937E73' }}>{bucket.label}</Text>
            </View>)}</View>
          </View>
        </ScrollView>
      </View>
      {!total && <Text style={{ color: '#937E73', fontSize: 12 }}>No earnings recorded for this chart period.</Text>}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, padding: 16, borderWidth: 1, borderColor: '#EAD4C8', borderRadius: 14 }}>
      <Animated.View accessibilityLabel={`Earnings distribution, total ${amount(total)}`} style={{ width: 140, height: 140, opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
        <Svg width={140} height={140} viewBox="0 0 140 140"><Circle cx={70} cy={70} r={54} fill="none" stroke="#F6E9E0" strokeWidth={16} />{totals.map(item => {
          const length = total ? item.amount / total * circumference : 0; const start = offset; offset += length;
          return <Circle key={item.key} cx={70} cy={70} r={54} fill="none" stroke={item.color} strokeWidth={16} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-start} rotation={-90} origin="70, 70" />;
        })}</Svg>
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 10, color: '#937E73' }}>Chart total</Text><Text style={{ fontSize: 13, color: '#824B39', fontWeight: '700' }}>{amount(total)}</Text></View>
      </Animated.View>
      <View style={{ flex: 1, minWidth: 120, gap: 8 }}><Text style={{ fontWeight: '700', fontSize: 14, color: '#824B39' }}>Earnings distribution</Text>{totals.map(item => <View key={item.key} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}><Text style={{ color: item.color, fontSize: 11 }}>● {item.label}</Text><Text style={{ color: '#786862', fontSize: 11 }}>{amount(item.amount)}</Text></View>)}</View>
    </View>
  </View>;
}
