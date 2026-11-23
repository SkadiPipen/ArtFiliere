import Skeleton from '@/components/Skeleton';
import { Text, TextInput } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import ArtworkHistoryPanel from '@/module/blockchain/ArtworkHistoryPanel';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAdminRefresh } from './AdminRefresh';
import { adminType } from './adminDesign';
import AdminTabs from './AdminTabs';
import AttributionReviewsScreen from '@/module/blockchain/AttributionReviewsScreen';
import { useLocalSearchParams } from 'expo-router';
import CommissionInvestigations from './CommissionInvestigations';

type Listing = { id: number; title: string; artist: string; status: string };
export default function ArtworkInvestigations() {
  const { tab: requestedTab } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'artworks' | 'commissions' | 'reviews' | 'failed'>(requestedTab === 'failed' || requestedTab === 'reviews' || requestedTab === 'commissions' ? requestedTab : 'artworks');
  useEffect(() => { if (requestedTab === 'failed' || requestedTab === 'reviews' || requestedTab === 'artworks' || requestedTab === 'commissions') setTab(requestedTab); }, [requestedTab]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Listing[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const load = async (page = 1) => {
    const current = ++version.current;
    setBusy(true); setError('');
    try {
      const result = await purchaseRequest(`blockchain/investigations/?q=${encodeURIComponent(search)}&page=${page}`);
      if (version.current !== current) return;
      setRows(previous => page === 1 ? result.items : [...previous, ...result.items]);
      setNext(result.next_page);
    } catch (e: any) { if (version.current === current) setError(e.message || 'Unable to load artworks.'); }
    finally { if (version.current === current) setBusy(false); }
  };
  useEffect(() => { setRows([]); setNext(null); void load(); return () => { version.current++; }; }, [search]);
  useAdminRefresh(() => load());
  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: 28 }}><AdminTabs items={[{ id: 'artworks', label: 'Artwork investigations' }, { id: 'commissions', label: 'Commissions' }, { id: 'reviews', label: 'Attribution disputes' }, { id: 'failed', label: 'Failed blockchain records' }]} value={tab} onChange={setTab} /></View>
    {tab === 'commissions' ? <CommissionInvestigations /> : tab !== 'artworks' ? <AttributionReviewsScreen key={tab} embedded mode={tab} /> : <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <Text style={adminType.pageTitle}>Blockchain & artwork investigations</Text>
    <Text style={adminType.body}>Review artwork registration, ownership records, sales, agreements, and issued digital copies. Investigation access is restricted to administrators.</Text>
    <View style={s.search}>
      <TextInput accessibilityLabel="Search artwork investigations" value={query} onChangeText={setQuery} placeholder="Artwork title, artist username, or listing ID" onSubmitEditing={() => query.trim() === search ? void load() : setSearch(query.trim())} style={s.input} />
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => query.trim() === search ? void load() : setSearch(query.trim())} style={s.button}><Text style={s.buttonText}>Search</Text></TouchableOpacity>
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A74646' }}>{error}</Text>}
    {!busy && !error && !rows.length && <Text>No matching artworks.</Text>}
    {rows.map(row => <View key={row.id} style={s.card}>
      <Text style={adminType.sectionTitle}>{row.title}</Text>
      <Text>Listing #{row.id} · @{row.artist} · {row.status}</Text>
      <ArtworkHistoryPanel artworkId={row.id} buttonLabel="Open investigation" />
    </View>)}
    {busy && <Skeleton layout="list" />}
    {!!next && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void load(next)} style={s.button}><Text style={s.buttonText}>Load more artworks</Text></TouchableOpacity>}
  </ScrollView>}
  </View>;
}
const s = StyleSheet.create({
  page: { padding: 28, gap: 16, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  search: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  input: { flex: 1, minWidth: 200, padding: 12, borderWidth: 1, borderColor: '#DCCAC1', backgroundColor: '#FFF', borderRadius: 8 },
  card: { padding: 18, gap: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8DBD2', borderRadius: 12 },
  button: { padding: 12, backgroundColor: '#B95353', borderRadius: 9, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '700' },
});
