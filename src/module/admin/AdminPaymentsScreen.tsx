import RoyaltyReportReviews from './RoyaltyReportReviews';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  return <AdminPage activeTab="payments" onRefresh={refresh}><ScrollView contentContainerStyle={s.content}>
    <RoyaltyReportReviews />
    <Text style={s.title}>Payment Controls</Text><Text style={s.note}>Find transactions and manage eligible releases and refunds.</Text>
    <TextInput accessibilityLabel="Search payments" placeholder="Search artwork, buyer, artist, reference or payment ID" value={search} onChangeText={value => { setSearch(value); setPage(1); }} style={s.search} />
    <View style={s.filters}>{['all', 'pending', 'paid', 'refunded', 'expired'].map(value => <TouchableOpacity key={value} onPress={() => { setStatus(value); setPage(1); }} style={[s.filter, value === status && s.active]}><Text style={{ color: value === status ? '#FFF' : '#746865', textTransform: 'capitalize' }}>{value}</Text></TouchableOpacity>)}</View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {loading ? <ActivityIndicator color="#C15656" /> : <>
      <Text style={s.note}>{total} matching transactions</Text>
      {rows.map(payment => <View style={s.card} key={payment.id}>
        <View style={s.top}><Text style={s.artwork}>{payment.artwork}</Text><Text style={s.status}>{payment.status}</Text></View>
        <Text style={s.note}>#{payment.id} · {payment.reference_id}</Text><Text style={s.note}>Buyer: {payment.buyer} · Artist: {payment.artist}</Text>
        <Text style={s.amount}>{money(payment.gross_amount)}</Text><Text style={s.note}>Artist: {money(payment.artist_amount)} · Platform fee: {money(payment.platform_fee)}</Text>
        {payment.can_release && <View style={s.filters}>
          <TouchableOpacity disabled={working !== null} onPress={() => void act(payment, 'release')} style={[s.action, { backgroundColor: '#5D8A63' }]}><Text style={s.white}>{working === payment.id ? 'Saving...' : 'Release artist funds'}</Text></TouchableOpacity>
          <TouchableOpacity disabled={working !== null} onPress={() => void act(payment, 'refund')} style={[s.action, { backgroundColor: '#A86868' }]}><Text style={s.white}>Refund</Text></TouchableOpacity>
        </View>}
      </View>)}
      {!rows.length && <Text style={s.note}>No payments match these filters.</Text>}
      <View style={s.filters}><TouchableOpacity disabled={page <= 1} onPress={() => setPage(value => value - 1)} style={s.filter}><Text>Previous</Text></TouchableOpacity><Text style={s.note}>Page {page} of {pages}</Text><TouchableOpacity disabled={page >= pages} onPress={() => setPage(value => value + 1)} style={s.filter}><Text>Next</Text></TouchableOpacity></View>
    </>}
  </ScrollView></AdminPage>;
}
const s = StyleSheet.create({
  content: { maxWidth: 1100, width: '100%', alignSelf: 'center', padding: 24, gap: 14, paddingBottom: 60 }, title: { fontSize: 25, fontWeight: '800', color: '#322B29' }, note: { fontSize: 12, color: '#746865', lineHeight: 19 },
  search: { backgroundColor: '#FFF', padding: 14, borderWidth: 1, borderColor: '#E3D8CC', borderRadius: 10 }, filters: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }, filter: { padding: 11, borderRadius: 20, backgroundColor: '#F5EDE7' }, active: { backgroundColor: '#C15656' },
  error: { color: '#B91C1C' }, card: { padding: 18, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E3D8CC', borderRadius: 12, gap: 8 }, top: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }, artwork: { fontSize: 17, fontWeight: '800', color: '#443633' }, status: { color: '#A86868', fontWeight: '700', textTransform: 'capitalize' },
  amount: { fontSize: 22, fontWeight: '800', color: '#342B28' }, action: { padding: 12, borderRadius: 8 }, white: { color: '#FFF', fontWeight: '700' },
});
