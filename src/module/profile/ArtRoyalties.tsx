import { Text } from '@/components/Typography';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { X, RefreshCw } from 'lucide-react-native';
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Text style={{ fontSize: 25, fontWeight: '700', color: '#70482F' }}>Art Royalties</Text><Text style={{ color: '#81756D', lineHeight: 20, marginTop: 6 }}>Your royalty-bearing artwork and commission licenses, as buyer or artist.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close Art Royalties" onPress={onClose} style={{ padding: 12 }}><X size={22} color="#70482F" /></Pressable></View>
      <View style={{ flexDirection: 'row', gap: 10 }}>{(['active', 'expired'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={{ flex: 1, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: tab === value ? '#E68A50' : '#E5DAD3', backgroundColor: tab === value ? '#FFF0E4' : '#FFFFFF' }}><Text style={{ textAlign: 'center', fontWeight: '700', color: '#70482F' }}>{value === 'active' ? 'Active' : 'Expired'} ({licenses.filter(item => item.license_status === value).length})</Text></Pressable>)}</View>
      <Text style={{ color: '#81756D', fontSize: 12, lineHeight: 19 }}>{tab === 'active' ? 'Includes accepted agreements awaiting signatures or final commission delivery. Each card shows its current status.' : 'Expiry ends the agreed term; outstanding reporting and payment obligations may remain due.'}</Text>
      <Pressable accessibilityRole="button" disabled={loading} onPress={load} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}><RefreshCw size={16} color="#A33F45" /><Text style={{ color: '#A33F45', fontWeight: '600' }}>Refresh licenses</Text></Pressable>
      {loading && <ActivityIndicator color="#C15656" />}
      {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}
      {!loading && !error && !visible.length && <Text style={{ color: '#81756D', padding: 20 }}>No {tab} royalty licenses yet.</Text>}
      {visible.map(item => <View key={item.id} style={{ borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 16, padding: 18, backgroundColor: '#FFFFFF', gap: 9 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#70482F' }}>{item.title}</Text>
        <Text style={{ fontWeight: '600', color: tab === 'expired' ? '#8C6151' : '#477452' }}>{item.status_label}</Text>
        <Text>Agreement #{item.id} · {item.is_buyer ? 'You pay royalties' : 'You receive royalties'}</Text>
        <Text>{item.is_buyer ? `Artist: ${item.artist}` : `Buyer: ${item.buyer}`}</Text>
        <Text>Starts: {date(item.starts_on)}{item.ends_on ? ` · Expires: ${date(item.ends_on)} (end date excluded)` : ' · End date not recorded'}</Text>
        <Text>Royalty: {label(item.terms.subtype)}{item.terms.rate || item.terms.calculation?.rate ? ` · ${item.terms.rate || item.terms.calculation?.rate}${item.terms.subtype?.includes('per_unit') || item.terms.calculation?.basis === 'units' ? ' PHP per item' : '%'}` : ''}</Text>
        <Text>Reporting: {label(item.terms.reporting_frequency)} · {label(item.exclusivity)}</Text>
        {item.terms.minimum_guarantee && <Text>Minimum guarantee: PHP {item.terms.minimum_guarantee} per period</Text>}
        <Text>Outstanding reports: {item.outstanding_reports}</Text>
        <Pressable accessibilityRole="button" onPress={() => { onClose(); router.push({ pathname: '/royalty-reports', params: { agreementId: String(item.id) } }); }} style={{ marginTop: 4, padding: 13, backgroundColor: '#FFF7F0', borderRadius: 10, borderWidth: 1, borderColor: '#E68A50' }}><Text style={{ textAlign: 'center', fontWeight: '700', color: '#A33F45' }}>View reports & payments</Text></Pressable>
      </View>)}
    </ScrollView>
  </SafeAreaView></Modal>;
}
