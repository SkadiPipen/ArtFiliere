import { Text, TextInput } from '@/components/Typography';
import ProductImage from '@/components/ProductImage';
import EarningsChart, { earningsSeries as series } from './components/EarningsChart';
import CalendarDateField from '@/components/CalendarDateField';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { exportEarnings } from '@/services/exportEarnings';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Download, Search, SlidersHorizontal, CalendarDays, ChevronDown, X, ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react-native';

type Row = { preview_image: string; id: string; title: string; buyer: string; category: string; date: string; gross: string; fees: string; shipping: string; royalty_deduction: string; net: string; status: string; reason: string; reference: string; destination: string; history: { at: string; label: string; amount: string }[] };
type Bucket = { label: string; received: string; available: string; pending: string; processing: string };
type Data = { summary: Record<string, string>; chart: Bucket[]; results: Row[]; count: number; page_size: number; pages: number; page: number; years: number[]; wallet: { available: string; pending: string; paid_out: string } };
const currency = (value: string | number = 0) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));
const categories: Record<string, string> = { '': 'All types', shop: 'Buy & Sell', auction: 'Auction', commission: 'Commission', commercial_royalty: 'Commercial Royalties', resale_royalty: 'Resale Royalties' };
const statuses: Record<string, string> = { '': 'All statuses', received: 'Received', available: 'Available in wallet', pending: 'Pending release', processing: 'Processing payout', failed: 'Payout failed / reversed', awaiting_payment: 'Awaiting payment', refunded: 'Refunded', expired: 'Expired', cancelled: 'Cancelled' };


export default function ArtistEarningsScreen({ onBack }: { onBack: () => void }) {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  const compact = width < 768;
  const [period, setPeriod] = useState('yearly'); const [year, setYear] = useState(new Date().getFullYear()); const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [tableWidth, setTableWidth] = useState(480);
  const [menu, setMenu] = useState<'period' | 'year' | 'month' | null>(null);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [search, setSearch] = useState(''); const [query, setQuery] = useState(''); const [category, setCategory] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [expanded, setExpanded] = useState<string | null>(null); const [exporting, setExporting] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true; let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!alive) return;
      if (reduce) { entrance.setValue(1); return; }
      animation = Animated.timing(entrance, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }); animation.start();
    }).catch(() => entrance.setValue(1));
    return () => { alive = false; animation?.stop(); };
  }, [entrance]);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350); return () => clearTimeout(timer); }, [search]);
  const parameters = () => `period=${period}&year=${year}&month=${month}&search=${encodeURIComponent(query)}&category=${category}&status=${status}&page=${page}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  async function request(exportCsv = false, signal?: AbortSignal) {
    await auth.authStateReady();
    const token = await auth.currentUser?.getIdToken(); if (!token) throw Error('Sign in with your artist account to view earnings.');
    const response = await fetch(`${API_URL}/api/artist/earnings/?${parameters()}${exportCsv ? '&export=csv' : ''}`, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!response.ok) { const value = await response.json().catch(() => ({})); throw Error(value.error || `Unable to load earnings (${response.status}).`); }
    return exportCsv ? response.text() : response.json();
  }
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setExpanded(null);
    request(false, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); }).catch(e => { if (!controller.signal.aborted) { setError(e.message); setData(null); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, year, month, from, to, query, category, status, page]);
  const select = (fn: () => void) => { setPage(1); fn(); };
  const chip = (label: string, selected: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.chip, selected && s.active]}><Text style={[s.chipText, selected && { color: '#FFF' }]}>{label}</Text></Pressable>;
  const dropdown = (kind: 'period' | 'year') => (menu === kind || (kind === 'period' && menu === 'month')) ? <View style={s.dropdown}>
    <View style={[s.headingRow, { marginBottom: 4 }]}><Text style={[s.chipText, { flex: 1 }]}>{menu === 'period' ? 'Select period' : menu === 'year' ? 'Select year' : 'Select month'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close filter" onPress={() => setMenu(null)} style={{ padding: 6 }}><X size={16} color="#A6453E" /></Pressable></View>
    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled">
      {menu === 'period' && ['monthly', 'yearly', 'all'].map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: period === value }} style={[s.dropdownOption, period === value && s.active]} onPress={() => { select(() => setPeriod(value)); setMenu(null); }}><Text style={[s.chipText, period === value && { color: '#FFF' }]}>{value === 'all' ? 'All time' : value === 'monthly' ? 'Monthly' : 'Yearly'}</Text></Pressable>)}
      {menu === 'year' && (data?.years || [year]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: year === value }} style={[s.dropdownOption, year === value && s.active]} onPress={() => { select(() => setYear(value)); setMenu(null); }}><Text style={[s.chipText, year === value && { color: '#FFF' }]}>{value}</Text></Pressable>)}
      {menu === 'month' && Array.from({ length: 12 }, (_, index) => <Pressable key={index} accessibilityRole="button" style={[s.dropdownOption, month === index + 1 && s.active]} onPress={() => { select(() => setMonth(index + 1)); setMenu(null); }}><Text style={[s.chipText, month === index + 1 && { color: '#FFF' }]}>{new Date(2024, index).toLocaleString('en', { month: 'long' })}</Text></Pressable>)}
    </ScrollView>
  </View> : null;
  const exactWidth = compact ? 560 : Math.max(480, tableWidth - 2);
  return <SafeAreaView style={s.page} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={[s.content, compact && { padding: 16 }]}>
      <View style={s.headingRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" onPress={onBack} style={s.icon}><ArrowLeft size={22} color="#A6453E" /></Pressable>
        <View style={{ flex: 1 }}><Text style={s.heading}>Artist Earnings & Transactions</Text><Text style={s.muted}>Your private earnings overview · PHP</Text></View>

      </View>
      <Animated.View style={{ height: 3, width: 64, backgroundColor: '#C15656', marginBottom: 24, transform: [{ scaleX: entrance }] }} />
      <Animated.View style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
        <View style={[s.panel, { zIndex: 20 }]}>
          <Text style={s.section}>Period and filters</Text>
          <View style={[s.filterRow, compact && { gap: 6 }]}>
            <View style={{ flexDirection: 'row', gap: compact ? 4 : 8, alignSelf: 'flex-end', paddingBottom: 4 }}>
              <View style={{ position: 'relative', zIndex: 30 }}><Pressable accessibilityRole="button" accessibilityLabel={`Period filter: ${period === 'all' ? 'All time' : period}`} accessibilityState={{ expanded: menu === 'period' }} onPress={() => setMenu(menu === 'period' ? null : 'period')} style={[s.filterIcon, compact && { padding: 8 }]}><SlidersHorizontal size={19} color="#A6453E" />{!compact && <Text style={s.chipText}>{period === 'all' ? 'All time' : period === 'monthly' ? 'Monthly' : 'Yearly'}</Text>}{!compact && <ChevronDown size={14} color="#A6453E" />}</Pressable>{dropdown('period')}</View>
              <View style={{ position: 'relative', zIndex: 30 }}><Pressable accessibilityRole="button" accessibilityLabel={`Year filter: ${year}`} accessibilityState={{ expanded: menu === 'year' }} onPress={() => setMenu(menu === 'year' ? null : 'year')} style={[s.filterIcon, compact && { padding: 8 }]}><CalendarDays size={19} color="#A6453E" />{!compact && <Text style={s.chipText}>{year}</Text>}{!compact && <ChevronDown size={14} color="#A6453E" />}</Pressable>{dropdown('year')}</View>
            </View>
            <View style={{ flex: 1, maxWidth: compact ? undefined : 560, marginLeft: 'auto', flexDirection: 'row', gap: compact ? 6 : 12, minWidth: 0 }}>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={s.muted}>From date</Text><CalendarDateField label="From date" value={from} onChange={value => select(() => setFrom(value))} /></View>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={s.muted}>To date</Text><CalendarDateField label="To date" value={to} onChange={value => select(() => setTo(value))} /></View>
            </View>
          </View>
          {(period === 'monthly' || from || to) ? <View style={s.wrap}>{period === 'monthly' && chip(new Date(year, month - 1).toLocaleString('en', { month: 'long' }), false, () => setMenu(menu === 'month' ? null : 'month'))}{!!(from || to) && chip('Clear dates', false, () => select(() => { setFrom(''); setTo(''); }))}</View> : null}
          <View style={s.search}><Search size={18} color="#8A8072" /><TextInput accessibilityLabel="Search earnings by title, buyer or reference" placeholder="Search artwork, buyer or transaction reference" value={search} onChangeText={setSearch} style={s.input} /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.wrap}>{Object.entries(categories).map(([value, label]) => chip(label, category === value, () => select(() => setCategory(value))))}</ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.wrap}>{Object.entries(statuses).map(([value, label]) => chip(label, status === value, () => select(() => setStatus(value))))}</ScrollView>
        </View>
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {loading ? <ActivityIndicator style={{ padding: 40 }} color="#C15656" /> : data && <>
          <Text style={s.muted}>Summary follows the selected period, search, and filters.</Text>
          <View style={[s.wrap, { marginVertical: 16 }]}>{[['received', 'Received payouts'], ['available', 'Available in wallet'], ['pending', 'Pending release'], ['processing', 'Processing payout'], ['failed', 'Payout needs attention'], ['fees', 'Platform fees'], ['shipping', 'Delivery charges'], ['refunds', 'Refunded payments']].map(([key, label]) => <View key={key} style={[s.summary, { width: compact ? '47%' : '23%' }]}><Text style={s.muted}>{label}</Text><Text style={s.amount}>{currency(data.summary[key])}</Text></View>)}</View>
          <Text style={s.note}>Received means a recorded payout. Available means funds released to the platform wallet. Unpaid and refunded transactions are excluded from earnings. Delivery charges are shown separately from artist net earnings.</Text>
          <View style={s.panel}>
            <Text style={s.section}>Earnings overview · {period === 'monthly' ? `${new Date(year, month - 1).toLocaleString('en', { month: 'long' })} ${year}` : year}</Text>
            {period === 'all' && <Text style={s.muted}>Chart shows the selected year; the summary and transactions include all time.</Text>}
            <View style={s.wrap}>{series.map(item => <Text key={item.key} style={{ color: item.color, fontSize: 12 }}>● {item.label}</Text>)}</View>
            <View style={{ flexDirection: width >= 1000 ? 'row' : 'column', gap: 20, alignItems: 'stretch' }}>
              <View style={{ flex: 1, minWidth: 0 }}><EarningsChart buckets={data.chart} /></View>
              <View onLayout={event => setTableWidth(event.nativeEvent.layout.width)} style={[s.chartTable, { flex: width >= 1000 ? 1 : undefined }]}>
                <Text style={[s.section, { padding: 12 }]}>Exact amounts</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={{ width: exactWidth }}><View style={s.tableRow}>{['Period', ...series.map(item => item.label)].map(label => <Text key={label} style={[s.cellHead, { width: exactWidth / 5 }, label === 'Period' && { paddingLeft: 14 }]}>{label}</Text>)}</View>{data.chart.map(bucket => <View key={bucket.label} style={s.tableRow}><Text style={[s.cell, { width: exactWidth / 5, paddingLeft: 14 }]}>{bucket.label}</Text>{series.map(item => <Text key={item.key} style={[s.cell, { width: exactWidth / 5 }]}>{currency(bucket[item.key])}</Text>)}</View>)}</View></ScrollView>
              </View>
            </View>
          </View>
          <View style={s.headingRow}><View style={{ flex: 1 }}><Text style={s.section}>Transaction history</Text><Text style={s.muted}>{data.count} records · newest first</Text></View><Pressable accessibilityRole="button" disabled={exporting} style={s.chip} onPress={async () => { setExporting(true); setError(''); try { await exportEarnings(await request(true)); } catch (e: any) { setError(e.message); } finally { setExporting(false); } }}><Download size={16} color="#A6453E" /><Text style={s.chipText}>{exporting ? 'Exporting…' : 'Export CSV'}</Text></Pressable></View>
          {!data.results.length && <Text style={s.note}>No transactions match these filters.</Text>}
          {data.results.map(row => <View key={row.id} style={s.panel}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === row.id }} onPress={() => setExpanded(expanded === row.id ? null : row.id)} style={{ flexDirection: 'row', gap: compact ? 12 : 24 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
              <View style={[s.headingRow, compact && { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}><Text style={[s.section, { flex: compact ? undefined : 1 }]}>{row.title}</Text><Text style={s.badge}>{statuses[row.status] || row.status}</Text></View>
              <Text style={s.muted}>{categories[row.category]} · @{row.buyer} · {new Date(row.date).toLocaleDateString()}</Text>
              <View style={[s.wrap, { marginTop: 12 }]}>{[['Gross', row.gross], ['Fees', row.fees], ['Shipping', row.shipping], ...(Number(row.royalty_deduction) > 0 ? [['Resale royalty', row.royalty_deduction]] : []), ['Artist net', row.net]].map(([label, value]) => <View key={label} style={{ minWidth: 110 }}><Text style={s.muted}>{label}</Text><Text style={label === 'Artist net' ? s.net : s.value}>{currency(value)}</Text></View>)}</View>
              <Text style={s.reason}>{row.reason}</Text><Text style={s.link}>{expanded === row.id ? 'Hide details −' : 'View details +'}</Text>
              </View>
              <View style={[s.preview, { width: compact ? 78 : 190, height: compact ? 96 : 164 }]}>
                {row.preview_image ? <ProductImage source={{ uri: row.preview_image }} accessibilityLabel={`Preview of ${row.title}`} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <><ImageIcon size={compact ? 24 : 36} color="#B7A198" /><Text style={{ color: '#9B887E', fontSize: 10, textAlign: 'center', padding: 6 }}>No preview yet</Text></>}
              </View>
            </Pressable>
            {expanded === row.id && <View style={s.detail}><Text selectable style={s.muted}>Reference: {row.reference}</Text><Text style={s.muted}>Recorded: {new Date(row.date).toLocaleString()}</Text>{!!row.destination && <Text style={s.muted}>Payout destination: {row.destination}</Text>}{row.history.map((item, index) => <Text key={index} style={s.value}>{new Date(item.at).toLocaleString()} · {item.label}{item.amount ? ` · ${currency(item.amount)}` : ''}</Text>)}</View>}
          </View>)}
          <View style={[s.wrap, { justifyContent: 'center', marginBottom: 16 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous transaction page" disabled={page <= 1} onPress={() => setPage(n => n - 1)} style={[s.pageButton, page <= 1 && { opacity: 0.4 }]}><ChevronLeft size={18} color="#A6453E" /></Pressable>
            {Array.from({ length: data.pages }, (_, index) => index + 1).filter(n => n === 1 || n === data.pages || Math.abs(n - page) <= 1).map((n, index, shown) => <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{index > 0 && n - shown[index - 1] > 1 && <Text style={s.muted}>…</Text>}<Pressable accessibilityRole="button" accessibilityLabel={`Transaction page ${n}`} accessibilityState={{ selected: page === n }} onPress={() => setPage(n)} style={[s.pageButton, page === n && s.active]}><Text style={[s.chipText, page === n && { color: '#FFF' }]}>{n}</Text></Pressable></View>)}
            <Pressable accessibilityRole="button" accessibilityLabel="Next transaction page" disabled={page >= data.pages} onPress={() => setPage(n => n + 1)} style={[s.pageButton, page >= data.pages && { opacity: 0.4 }]}><ChevronRight size={18} color="#A6453E" /></Pressable>
          </View>
          <Text style={[s.muted, { textAlign: 'center' }]}>Page {data.page} of {data.pages} · Up to 4 transactions per page</Text>
        </>}
      </Animated.View>
    </ScrollView>

  </SafeAreaView>;
}

const s = StyleSheet.create({
  dropdown: { position: 'absolute', top: '100%', left: 0, marginTop: 6, width: 200, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4C9C0', borderRadius: 12, padding: 8, zIndex: 100, elevation: 12, shadowColor: '#3A2D2A', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  dropdownOption: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 8, marginVertical: 2 },
  filterRow: { zIndex: 30, flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  filterIcon: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 12, borderRadius: 12, backgroundColor: '#F7EEEA', borderWidth: 1, borderColor: '#EADBD3', minHeight: 40 },
  chartTable: { minWidth: 0, borderWidth: 1, borderColor: '#E8DDEB', borderRadius: 14, overflow: 'hidden', backgroundColor: '#FFF' },
  preview: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#F5EEEA', borderWidth: 1, borderColor: '#EADBD3', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'center' },
  pageButton: { minWidth: 36, height: 36, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F7EEEA' },
  page: { flex: 1, backgroundColor: '#FAF7F3' }, content: { padding: 32, paddingBottom: 70, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }, heading: { color: '#3A2D2A', fontSize: 24, fontWeight: '800' },
  icon: { padding: 10, backgroundColor: '#F5E8E3', borderRadius: 24 }, muted: { color: '#786862', fontSize: 12, lineHeight: 19 },
  section: { color: '#3A2D2A', fontSize: 17, fontWeight: '700', marginBottom: 8 }, panel: { padding: 18, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EADBD3', marginBottom: 18, gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, chip: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#F7EEEA', borderRadius: 20 }, active: { backgroundColor: '#C15656' }, chipText: { color: '#A6453E', fontSize: 12, fontWeight: '600' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#DDB5AB', borderRadius: 10, paddingHorizontal: 12, marginVertical: 8 }, input: { flex: 1, minWidth: 0, paddingVertical: 12, color: '#3A2D2A', fontSize: 14 },
  summary: { padding: 16, minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: '#EADBD3', backgroundColor: '#FFF', flexGrow: 1 }, amount: { fontSize: 21, fontWeight: '800', color: '#A6453E', marginTop: 8 },
  note: { color: '#786862', fontSize: 12, lineHeight: 19, padding: 14, backgroundColor: '#F3EAE2', borderRadius: 10, marginBottom: 18 }, error: { color: '#B42318', padding: 14, backgroundColor: '#FDEBE7', borderRadius: 10, marginBottom: 12 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EFE5DF', paddingVertical: 10 }, cell: { width: 130, color: '#5B514B', fontSize: 12 }, cellHead: { width: 130, color: '#3A2D2A', fontSize: 12, fontWeight: '700' }, badge: { color: '#A6453E', backgroundColor: '#FAEEEA', padding: 7, borderRadius: 8, fontSize: 11 },
  value: { color: '#5B514B', fontSize: 13 }, net: { color: '#28765E', fontWeight: '700', fontSize: 15 }, reason: { color: '#786862', fontSize: 12, lineHeight: 19, marginTop: 12 }, link: { color: '#C15656', fontSize: 12, fontWeight: '700', marginTop: 10 }, detail: { borderTopWidth: 1, borderTopColor: '#EADBD3', paddingTop: 12, gap: 8 },
});
