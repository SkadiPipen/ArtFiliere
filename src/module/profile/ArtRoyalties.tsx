import TransactionHeader from '@/components/TransactionHeader';
import { Text } from '@/components/Typography';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';

type License = { id: number; title: string; is_buyer: boolean; artist: string; buyer: string; license_status: 'active' | 'expired'; status_label: string; starts_on: string | null; ends_on: string | null; exclusivity: string; outstanding_reports: number; terms: { subtype?: string; rate?: string; minimum_guarantee?: string; reporting_frequency?: string; calculation?: { basis?: string; rate?: string } } };
const date = (value: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not started';
const label = (value?: string) => value?.replaceAll('_', ' ') || 'Not specified';
export default function ArtRoyalties({ onClose }: { onClose: () => void }) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [tab, setTab] = useState<'active' | 'expired'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw Error('Please sign in to view your royalty licenses.');
      const response = await fetch(`${API_URL}/api/users/royalties/`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await readApiResponse(response);
      setLicenses(data.agreements); setError('');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const stop = auth.onAuthStateChanged(user => { if (user) void load(); else { setLicenses([]); setLoading(false); setError('Please sign in to view your royalty licenses.'); } }); return stop; }, [load]);
  const visible = licenses.filter(item => item.license_status === tab);
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={{ flex: 1, backgroundColor: '#FAF7F4' }}>
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 850, width: '100%', alignSelf: 'center' }}>
      <TransactionHeader title="Art Royalties" onBack={onClose} />
      <Text style={{ color: '#81756D', lineHeight: 20 }}>Your royalty-bearing artwork and commission licenses, as buyer or artist.</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>{(['active', 'expired'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={{ flex: 1, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: tab === value ? '#E68A50' : '#E5DAD3', backgroundColor: tab === value ? '#FFF0E4' : '#FFFFFF' }}><Text style={{ textAlign: 'center', fontWeight: '700', color: '#70482F' }}>{value === 'active' ? 'Active' : 'Expired'} ({licenses.filter(item => item.license_status === value).length})</Text></Pressable>)}</View>
      <Text style={{ color: '#81756D', fontSize: 12, lineHeight: 19 }}>{tab === 'active' ? 'Includes accepted agreements awaiting signatures or final commission delivery. Each card shows its current status.' : 'Expiry ends the agreed term; outstanding reporting and payment obligations may remain due.'}</Text>
      <Pressable accessibilityRole="button" disabled={loading} onPress={load} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}><RefreshCw size={16} color="#A33F45" /><Text style={{ color: '#A33F45', fontWeight: '600' }}>Refresh licenses</Text></Pressable>
      {loading && <ActivityIndicator color="#C15656" />}
      {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}
      {!loading && !error && !visible.length && <Text style={{ color: '#81756D', padding: 20 }}>No {tab} royalty licenses yet.</Text>}
      {visible.map(item => <View key={item.id} style={s.card}>
        <View style={s.heading}>
          <View style={s.identity}><Text style={s.title}>{item.title}</Text><Text style={s.meta}>Agreement #{item.id} / {item.is_buyer ? 'You pay royalties' : 'You receive royalties'}</Text></View>
          <View style={[s.badge, tab === 'expired' && s.expiredBadge]}><Text style={{ fontWeight: '600', fontSize: 12, color: tab === 'expired' ? '#8C6151' : '#477452' }}>{item.status_label}</Text></View>
        </View>
        <View style={s.details}>
          <View style={s.column}>
            <Text style={s.detail}>{item.is_buyer ? `Artist: ${item.artist}` : `Buyer: ${item.buyer}`}</Text>
            <Text style={s.detail}>Royalty: {label(item.terms.subtype)}{item.terms.rate || item.terms.calculation?.rate ? ` / ${item.terms.rate || item.terms.calculation?.rate}${item.terms.subtype?.includes('per_unit') || item.terms.calculation?.basis === 'units' ? ' PHP per item' : '%'}` : ''}</Text>
            {item.terms.minimum_guarantee && <Text style={s.detail}>Minimum guarantee: PHP {item.terms.minimum_guarantee} per period</Text>}
          </View>
          <View style={s.column}>
            <Text style={s.detail}>{date(item.starts_on)} to {item.ends_on ? date(item.ends_on) : 'End date not recorded'}</Text>
            <Text style={s.meta}>{item.ends_on ? 'End date excluded / ' : ''}{label(item.terms.reporting_frequency)} reporting / {label(item.exclusivity)}</Text>
          </View>
        </View>
        <View style={s.footer}>
          <Text style={s.meta}>Outstanding reports: <Text style={{ fontWeight: '700', color: '#A33F45' }}>{item.outstanding_reports}</Text></Text>
          <Pressable accessibilityRole="button" onPress={() => { onClose(); router.push({ pathname: '/royalty-reports', params: { agreementId: String(item.id) } }); }} style={s.reportsButton}><Text style={s.buttonLabel}>View Reports &amp; Payments</Text></Pressable>
        </View>
      </View>)}
    </ScrollView>
  </SafeAreaView></Modal>;
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 12, padding: 16, backgroundColor: '#FFFFFF', gap: 12 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  identity: { flex: 1, minWidth: 180, gap: 4 }, title: { fontSize: 18, fontWeight: '700', color: '#70482F' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: '#EDF4EE' }, expiredBadge: { backgroundColor: '#F5E8E3' },
  meta: { color: '#81756D', fontSize: 12, lineHeight: 18 }, detail: { fontSize: 13, lineHeight: 19, color: '#3A2D2A' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, column: { flex: 1, minWidth: 220, gap: 5 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: '#EFE1DC', paddingTop: 10 },
  reportsButton: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center', backgroundColor: '#F5E8E3', borderRadius: 8 },
  buttonLabel: { fontSize: 12, fontWeight: '700', color: '#A33F45' },
});
