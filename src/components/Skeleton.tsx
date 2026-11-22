import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

type Layout = 'list' | 'cards' | 'dashboard' | 'profile' | 'form';
function Block({ width = '100%', height = 14, round = false }: { width?: DimensionValue; height?: number; round?: boolean }) {
  return <View style={{ width, height, borderRadius: round ? height / 2 : 6, backgroundColor: '#E6DCD6' }} />;
}

/** Content placeholders only: never replace payment, saving, or upload progress. */
export default function Skeleton({ layout = 'list', count = 3, style }: { layout?: Layout; count?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    const update = (reduce: boolean) => {
      animation?.stop(); opacity.setValue(1);
      if (!active || reduce) return;
      animation = Animated.loop(Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 850, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1, duration: 850, useNativeDriver: Platform.OS !== 'web' }),
      ]));
      animation.start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) update(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => { active = false; subscription.remove(); animation?.stop(); };
  }, [opacity]);
  const rows = Array.from({ length: count }, (_, i) => i);
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading content" accessibilityState={{ busy: true }} style={[s.root, style]}>
    <Animated.View style={{ opacity, gap: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {(layout === 'dashboard' || layout === 'profile' || layout === 'form') && <Block width="45%" height={26} />}
      {layout === 'profile' && <View style={s.card}><Block height={110} /><View style={s.row}><Block width={64} height={64} round /><View style={s.copy}><Block width="55%" /><Block width="35%" /></View></View></View>}
      {layout === 'dashboard' && <View style={s.grid}>{[0, 1, 2, 3].map(i => <View key={i} style={[s.card, s.metric]}><Block width="70%" /><Block width="45%" height={30} /></View>)}</View>}
      {layout === 'cards' ? <View style={s.grid}>{rows.map(i => <View key={i} style={[s.card, s.artwork]}><Block height={145} /><Block width="75%" height={18} /><Block width="45%" /><Block width="30%" /></View>)}</View>
        : layout === 'form' ? <View style={s.card}>{rows.map(i => <View key={i} style={{ gap: 10 }}><Block width="30%" /><Block height={44} /></View>)}</View>
        : rows.map(i => <View key={i} style={[s.card, s.row]}><Block width={52} height={52} round={layout === 'profile'} /><View style={s.copy}><Block width="65%" height={18} /><Block width="90%" /><Block width="40%" /></View></View>)}
    </Animated.View>
  </View>;
}
const s = StyleSheet.create({
  root: { width: '100%', maxWidth: 1320, alignSelf: 'center', padding: 18, flexShrink: 1 },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#FFFCF9', borderWidth: 1, borderColor: '#EEE5DF', gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  copy: { flex: 1, minWidth: 0, gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metric: { flexGrow: 1, flexBasis: 170 },
  artwork: { flexGrow: 1, flexBasis: 220 },
});
