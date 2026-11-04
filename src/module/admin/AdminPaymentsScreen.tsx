import AdminTabs from './AdminTabs';
import { adminType, adminSurfaces } from './adminDesign';
import { Banknote, Search, FileCheck2 } from 'lucide-react-native';
import { Text, TextInput } from '@/components/Typography';
import RoyaltyReportReviews from './RoyaltyReportReviews';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import AdminPage from './AdminPage';

type Payment = { id: number; reference_id: string; status: string; artwork: string; artist: string; buyer: string; gross_amount: string; artist_amount: string; platform_fee: string; can_release: boolean };
const money = (value: string) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
async function request(path: string, body?: object) {
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in with your admin account.');
  const response = await fetch(`${API_URL}/api/admin/wallet/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.detail || 'Payment request failed.');
  return data;
}

export default function AdminPaymentsScreen() {
  const [section, setSection] = useState<'transactions' | 'royalties'>('transactions');
  const [rows, setRows] = useState<Payment[]>([]), [search, setSearch] = useState(''), [status, setStatus] = useState('all');
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [working, setWorking] = useState<number | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void request(`payments/?status=${status}&search=${encodeURIComponent(search)}&page=${page}`).then(data => {
        if (!active) return;
        setRows(data.payments); setPage(data.page); setPages(data.pages); setTotal(data.total); setError('');
      }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, status, page, revision]);
  const act = async (payment: Payment, action: 'release' | 'refund') => {
    const run = async () => {
      setWorking(payment.id); setError('');
      try { await request(`payments/${payment.id}/`, { action }); refresh(); }
      catch (e: any) { setError(e.message); }
      finally { setWorking(null); }
    };
    const message = `${action === 'release' ? 'Release artist funds' : 'Refund this payment'} for ${payment.artwork} (#${payment.id})?`;
    if (Platform.OS === 'web') { if (window.confirm(message)) await run(); }
    else Alert.alert('Confirm payment action', message, [{ text: 'Cancel', style: 'cancel' }, { text: action === 'release' ? 'Release' : 'Refund', onPress: () => void run() }]);
  };
  return <AdminPage activeTab="payments" onRefresh={() => { if (section === 'transactions') refresh(); }}><ScrollView contentContainerStyle={s.content}>
    <View style={s.hero}><View style={s.heading}><Banknote size={30} color="#B65B50" /><Text style={s.title}>Payment Controls</Text></View><Text style={s.description}>Manage transaction releases, refunds, and royalty report verification.</Text></View>
    <AdminTabs items={[{ id: 'transactions', label: 'Transactions', icon: Banknote }, { id: 'royalties', label: 'Royalty reviews', icon: FileCheck2 }]} value={section} onChange={setSection} />
    {section === 'royalties' ? <View style={s.royaltyPanel}><RoyaltyReportReviews /></View> : <>
    <View style={s.toolbar}><Text style={s.panelTitle}>Find transactions</Text><View style={s.searchRow}><Search size={20} color="#9B8175" />
    <TextInput accessibilityLabel="Search payments" placeholder="Search artwork, buyer, artist, reference or payment ID" value={search} onChangeText={value => { setSearch(value); setPage(1); }} style={s.search} /></View>
    <View style={s.filters}>{['all', 'pending', 'paid', 'refunded', 'expired'].map(value => <TouchableOpacity key={value} onPress={() => { setStatus(value); setPage(1); }} style={[s.filter, value === status && s.active]}><Text style={{ color: value === status ? '#FFF' : '#746865', textTransform: 'capitalize' }}>{value}</Text></TouchableOpacity>)}</View></View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {loading ? <ActivityIndicator color="#C15656" /> : <>
      <Text style={s.note}>{total} matching transactions</Text>
      {rows.map(payment => <View style={s.card} key={payment.id}>
        <View style={s.top}><View style={{ flex: 1, gap: 6 }}><Text style={s.artwork}>{payment.artwork}</Text><Text selectable style={s.note}>Payment #{payment.id} | {payment.reference_id}</Text></View><View style={[s.badge, payment.status === 'paid' && { backgroundColor: '#EAF3EC' }]}><Text style={[s.status, payment.status === 'paid' && { color: '#477452' }]}>{payment.status}</Text></View></View>
        <View style={s.people}><View style={s.detail}><Text style={s.label}>BUYER</Text><Text style={s.detailText}>{payment.buyer || 'Unavailable'}</Text></View><View style={s.detail}><Text style={s.label}>ARTIST</Text><Text style={s.detailText}>{payment.artist || 'Unavailable'}</Text></View></View>
        <View style={s.breakdown}><View style={s.detail}><Text style={s.label}>TOTAL PAYMENT</Text><Text style={s.amount}>{money(payment.gross_amount)}</Text></View><View style={s.detail}><Text style={s.label}>ARTIST SHARE</Text><Text style={s.detailText}>{money(payment.artist_amount)}</Text></View><View style={s.detail}><Text style={s.label}>PLATFORM FEE</Text><Text style={s.detailText}>{money(payment.platform_fee)}</Text></View></View>
        {payment.can_release && <View style={s.cardActions}>
          <TouchableOpacity disabled={working !== null} onPress={() => void act(payment, 'release')} style={[s.action, { backgroundColor: '#B95353' }]}><Text style={s.white}>{working === payment.id ? 'Saving...' : 'Release artist funds'}</Text></TouchableOpacity>
          <TouchableOpacity disabled={working !== null} onPress={() => void act(payment, 'refund')} style={[s.action, { backgroundColor: '#F5E8E3', borderWidth: 1, borderColor: '#DFC5BC' }]}><Text style={{ color: '#A74646', fontWeight: '700' }}>Refund</Text></TouchableOpacity>
        </View>}
      </View>)}
      {!rows.length && <Text style={s.note}>No payments match these filters.</Text>}
      <View style={s.pagination}><TouchableOpacity disabled={page <= 1} onPress={() => setPage(value => value - 1)} style={[s.filter, page <= 1 && { opacity: 0.4 }]}><Text>Previous</Text></TouchableOpacity><Text style={s.note}>Page {page} of {pages}</Text><TouchableOpacity disabled={page >= pages} onPress={() => setPage(value => value + 1)} style={[s.filter, page >= pages && { opacity: 0.4 }]}><Text>Next</Text></TouchableOpacity></View>
    </>}
    </>}
  </ScrollView></AdminPage>;
}
const s = StyleSheet.create({
  hero: { gap: 12 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 14 }, description: { ...adminType.body, },
  sectionTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 8 }, sectionTab: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E5DAD3', backgroundColor: '#FFFFFF' }, sectionSelected: { backgroundColor: '#F5E8E3', borderColor: '#DAB5AA' },
  toolbar: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 16, padding: 20, gap: 16 }, panelTitle: { ...adminType.cardTitle, }, searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 12, paddingHorizontal: 14 },
  royaltyPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 16, padding: 24 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, paddingVertical: 8 }, detail: { flexGrow: 1, flexBasis: 170, gap: 7 }, label: { ...adminType.label,  letterSpacing: 0.8, color: '#958176', }, detailText: { ...adminType.body, },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, padding: 18, backgroundColor: '#FAF7F3', borderRadius: 12, alignItems: 'center' }, badge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F5E8E3', alignSelf: 'flex-start' }, cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }, pagination: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  content: { maxWidth: 1360, width: '100%', alignSelf: 'center', padding: 28, gap: 14, paddingBottom: 60 }, title: { ...adminType.pageTitle, }, note: { ...adminType.muted, },
  search: { flex: 1, minWidth: 0, paddingVertical: 14, fontSize: 14, color: '#59453D' }, filters: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }, filter: { ...adminSurfaces.button, backgroundColor: '#F5E8E3' }, active: { backgroundColor: '#C15656' },
  error: { color: '#B91C1C' }, card: { padding: 22, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 16, gap: 16 }, top: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }, artwork: { ...adminType.cardTitle, }, status: { ...adminType.label,  color: '#A86868', textTransform: 'capitalize' },
  amount: { ...adminType.metric, }, action: { ...adminSurfaces.button }, white: { ...adminType.button,  color: '#FFF', },
});
