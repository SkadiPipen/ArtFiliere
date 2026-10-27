import { Text } from '@/components/Typography';
import { ArrowLeft, RefreshCw, ShoppingBag, Wallet, Truck, Star, Percent, Handshake, ShieldCheck, ReceiptText } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

type Props = { title: string; onBack: () => void; onRefresh?: () => void; refreshing?: boolean };
export default function TransactionHeader({ title, onBack, onRefresh, refreshing = false }: Props) {
  return <View style={s.header}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Back from ${title}`} onPress={onBack} style={s.back}><ArrowLeft size={23} color="#62493E" /></Pressable>
    <View style={s.brandCopy}><Text style={s.brand}>ArtFiliere</Text><Text style={s.subtitle}>My transactions</Text></View>
    {onRefresh && <Pressable accessibilityRole="button" accessibilityLabel={`Refresh ${title}`} disabled={refreshing} onPress={onRefresh} style={[s.refresh, refreshing && { opacity: 0.45 }]}><RefreshCw size={22} color="#984E43" /></Pressable>}
  </View>;
}
export function TransactionTitle({ title }: { title: string }) {
  const Icon = title === 'To Pay' ? Wallet : title === 'To Receive' ? Truck : title === 'To Rate' ? Star : title === 'Art Royalties' ? Percent : title === 'Ongoing Negotiations' ? Handshake : (title.startsWith('Verify') || title.startsWith('Reports,') || title === 'Customer Support') ? ShieldCheck : title.startsWith('Royalty Reports') ? ReceiptText : ShoppingBag;
  return <View style={s.titleRow}><Icon size={30} color="#BC5555" /><Text style={s.title}>{title}</Text></View>;
}
const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 18, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8DAD2' },
  back: { width: 32, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  brandCopy: { flex: 1, gap: 4 }, brand: { fontSize: 23, fontFamily: 'LoraSemiBold', fontWeight: '600', color: '#B54848' }, subtitle: { fontSize: 12, lineHeight: 18, color: '#776860' },
  refresh: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { flex: 1, fontSize: 26, fontFamily: 'LoraSemiBold', fontWeight: '600', color: '#302624' },
});
