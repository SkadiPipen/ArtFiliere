import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { ChartNoAxesCombined, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react-native';
import { Text } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import AdminPage from './AdminPage';
import AdminOverview, { type AdminAnalytics } from './AdminOverview';
import { adminType as t, adminWorkspaceStyles as workspace } from './adminDesign';

type Channel = 'total' | 'shop' | 'auction' | 'commission' | 'royalty';
type Day = { royalty: string; royalty_count: number; royalty_earnings: string; date: string; shop: string; auction: string; commission: string; total: string; shop_count: number; auction_count: number; commission_count: number; shop_earnings: string; auction_earnings: string; commission_earnings: string; total_earnings: string };
type Summary = { artist_royalties?: string; collected: string; earnings: string; payments: number; average_payment: string };
type Performance = { days: number; as_of: string; starts_on: string; ends_on: string; summary: Summary; previous: Summary; series: Day[]; channels: { shop: string; auction: string; commission: string; royalty: string }; channel_summaries: Record<Exclude<Channel, 'total'>, { current: Summary; previous: Summary }>; overview: AdminAnalytics; undated_shop_payments: number; undated_completed_commissions: number };
const money = (value: number | string) => `PHP ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const comparison = (current: number, previous: number) => previous > 0 ? `${current >= previous ? '+' : ''}${((current - previous) / previous * 100).toFixed(1)}% vs previous period` : current > 0 ? 'No activity in the previous period' : 'No change from previous period';

function CompactSelect<T extends string | number>({ label, value, items, onChange }: { label: string; value: T; items: { label: string; value: T }[]; onChange: (value: T) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${items.find(item => item.value === value)?.label}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={s.selectButton}><Text style={[t.button, { color: '#59453D' }]}>{items.find(item => item.value === value)?.label}</Text><ChevronDown size={17} color="#81756D" /></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><View style={s.selectOverlay}><Pressable accessibilityRole="button" accessibilityLabel="Close filter choices" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal style={s.selectDialog}><Text style={t.cardTitle}>{label}</Text>{items.map(item => <Pressable key={String(item.value)} accessibilityRole="radio" accessibilityState={{ checked: value === item.value }} onPress={() => { onChange(item.value); setOpen(false); }} style={[s.selectOption, value === item.value && s.controlSelected]}><Text style={[t.button, { color: value === item.value ? '#A74646' : '#59453D' }]}>{item.label}</Text></Pressable>)}<Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={s.selectOption}><Text style={t.muted}>Cancel</Text></Pressable></View></View></Modal>
  </>;
}

function CollectionChart({ rows, channel, metric }: { rows: Day[]; channel: Channel; metric: 'earnings' | 'collected' }) {
  const [selected, setSelected] = useState(rows.length - 1);
  const [width, setWidth] = useState(1);
  const [showFigures, setShowFigures] = useState(false);
  const gradientId = `performance-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const W = 840, H = 200, left = 24, bottom = 176;
  const values = rows.map(row => Number(row[channel]));
  const maximum = Math.max(...values, 1);
  const points = values.map((value, index) => ({ x: left + index / Math.max(1, rows.length - 1) * (W - left * 2), y: bottom - value / maximum * 140 }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  const currentIndex = Math.min(selected, rows.length - 1);
  const day = rows[currentIndex];
  const point = points[currentIndex];
  return <View style={s.panel}>
    <View style={{ gap: 6 }}><Text style={t.sectionTitle}>{metric === 'earnings' ? 'Platform earnings trend' : 'Collection trend'}</Text><Text style={t.muted}>{metric === 'earnings' ? 'Recorded platform fees for the selected channel' : 'Daily recorded payments, before refunds'}</Text></View>
    <View style={s.plotRow}><View style={s.yAxis}>{[1, .5, 0].map(fraction => <Text key={fraction} style={t.label}>{Math.round(maximum * fraction).toLocaleString('en-PH')}</Text>)}</View><View style={{ flex: 1, minWidth: 0 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${metric === 'earnings' ? 'Platform earnings' : 'Collections'} in pesos. Selected ${dateLabel(day.date)}: ${money(day[channel])}. Select a day on the chart or use the date controls below.`} onPress={event => setSelected(Math.max(0, Math.min(rows.length - 1, Math.round(((event.nativeEvent.locationX / width * W - left) / (W - left * 2)) * (rows.length - 1)))))}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <Defs><LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#C46D65" stopOpacity={.25} /><Stop offset="1" stopColor="#C46D65" stopOpacity={0} /></LinearGradient></Defs>
          {[36, 106, bottom].map(y => <Line key={y} x1={left} x2={W-left} y1={y} y2={y} stroke="#EBE2DC" strokeDasharray="4 6" />)}
          <Path d={`${path} L${W-left},${bottom} L${left},${bottom} Z`} fill={`url(#${gradientId})`} />
          <Path d={path} fill="none" stroke="#B95353" strokeWidth={2.5} />
          <Line x1={point.x} x2={point.x} y1={24} y2={bottom} stroke="#CBAFA4" strokeDasharray="4 5" />
          <Circle cx={point.x} cy={point.y} r={5} fill="#B95353" stroke="#FFFFFF" strokeWidth={2} />
        </Svg>
      </Pressable>
      <View style={s.axisLabels}><Text style={t.label}>{dateLabel(rows[0].date)}</Text><Text style={t.label}>{dateLabel(rows[Math.floor(rows.length / 2)].date)}</Text><Text style={t.label}>{dateLabel(rows[rows.length - 1].date)}</Text></View>
    </View></View>
    {!values.some(value => value > 0) && <Text style={t.muted}>No {metric === 'earnings' ? 'platform earnings' : 'collections'} recorded for this channel in the selected period.</Text>}
    <View style={s.dayDetail}><View style={s.controls}><Pressable accessibilityRole="button" accessibilityLabel="Previous day" disabled={currentIndex === 0} onPress={() => setSelected(currentIndex - 1)} style={[s.control, currentIndex === 0 && { opacity: .35 }]}><ChevronLeft size={18} color="#A74646" /></Pressable><Text style={t.button}>{dateLabel(day.date)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next day" disabled={currentIndex === rows.length - 1} onPress={() => setSelected(currentIndex + 1)} style={[s.control, currentIndex === rows.length - 1 && { opacity: .35 }]}><ChevronRight size={18} color="#A74646" /></Pressable></View><Text accessibilityLiveRegion="polite" style={t.cardTitle}>{money(day[channel])}</Text><Text style={t.muted}>{day.shop_count} shop | {day.auction_count} auction | {day.commission_count} commissions | {day.royalty_count} royalties</Text></View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFigures }} onPress={() => setShowFigures(!showFigures)} style={s.disclosure}><Text style={[t.button, { color: '#A74646' }]}>{showFigures ? 'Hide daily figures' : 'View daily figures'}</Text>{showFigures ? <ChevronUp size={18} color="#A74646" /> : <ChevronDown size={18} color="#A74646" />}</Pressable>
    {showFigures && rows.map(row => <View key={row.date} style={s.tableRow}><Text style={t.muted}>{dateLabel(row.date)}</Text><Text style={t.body}>{money(row[channel])}</Text></View>)}
  </View>;
}

export default function AdminPerformanceScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1250;
  const [showDetails, setShowDetails] = useState(false);
  const [days, setDays] = useState(30);
  const [channel, setChannel] = useState<Channel>('total');
  const [metric, setMetric] = useState<'earnings' | 'collected'>('earnings');
  const [data, setData] = useState<Performance | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++sequence.current;
    setLoading(true);
    try { const result = await purchaseRequest(`admin/performance/?days=${days}`); if (requestId === sequence.current) { setData(result); setError(''); } }
    catch (e: any) { if (requestId === sequence.current) setError(e.message); }
    finally { if (requestId === sequence.current) setLoading(false); }
  }, [days]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  const current = data?.days === days ? data : null;
  const summary = current ? channel === 'total' ? current.summary : current.channel_summaries[channel].current : null;
  const previous = current ? channel === 'total' ? current.previous : current.channel_summaries[channel].previous : null;
  const ranked = current ? ([{ id: 'shop', label: 'Shop', color: '#B95353' }, { id: 'auction', label: 'Auctions', color: '#B98D68' }, { id: 'commission', label: 'Commissions', color: '#887A9E' }, { id: 'royalty', label: 'Royalties', color: '#A7864E' }] as const).map(item => ({ ...item, value: Number(current.channel_summaries[item.id].current[metric]), payments: current.channel_summaries[item.id].current.payments })).sort((a, b) => b.value - a.value) : [];
  const best = ranked.filter(item => item.value > 0 && item.value === ranked[0]?.value);
  const metricTotal = current ? Number(current.summary[metric]) : 0;
  const chartRows = current?.series.map(row => metric === 'earnings' ? { ...row, total: row.total_earnings, shop: row.shop_earnings, auction: row.auction_earnings, commission: row.commission_earnings, royalty: row.royalty_earnings } : row) || [];
  return <AdminPage activeTab="performance" onRefresh={load}><ScrollView contentContainerStyle={[workspace.content, s.content]}>
    <View style={s.panelHeader}><View style={{ gap: 4, flex: 1 }}><View style={[workspace.titleRow, { gap: 10 }]}><ChartNoAxesCombined size={26} color="#B65B50" /><Text style={workspace.title}>Performance</Text></View><Text style={t.muted}>Compare sales and royalty performance across channels.</Text></View>{current && <Text style={t.label}>{dateLabel(current.starts_on)} - {dateLabel(current.ends_on)} | Manila time</Text>}</View>
    <View style={s.toolbar}>
      <View style={s.filterField}><Text style={t.label}>Channel</Text><CompactSelect label="Channel" value={channel} onChange={setChannel} items={[{ label: 'All channels', value: 'total' }, { label: 'Shop', value: 'shop' }, { label: 'Auctions', value: 'auction' }, { label: 'Commissions', value: 'commission' }, { label: 'Royalties', value: 'royalty' }]} /></View>
      <View style={s.filterField}><Text style={t.label}>Measure</Text><CompactSelect label="Measure" value={metric} onChange={setMetric} items={[{ label: 'Platform earnings', value: 'earnings' }, { label: 'Gross collections', value: 'collected' }]} /></View>
      <View style={[s.filterField, { maxWidth: 180 }]}><Text style={t.label}>Period</Text><CompactSelect label="Period" value={days} onChange={setDays} items={[7, 30, 90].map(value => ({ label: `Last ${value} days`, value }))} /></View>
      <Text style={[t.label, { flexGrow: 1, flexBasis: 220, maxWidth: 340 }]}>{metric === 'earnings' ? 'Platform fees earned. Held artist funds are excluded.' : 'Payments received before refunds, including delivery.'}</Text>
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B42318' }}>{error}</Text>}
    {loading && <ActivityIndicator color="#B65B50" />}
    {current && <>
      <View style={s.metricStrip}>{([{ key: 'earnings', label: 'Platform earnings', currency: true }, { key: 'collected', label: 'Gross collected', currency: true }, { key: 'payments', label: 'Recorded payments', currency: false }, { key: 'average_payment', label: 'Average collected', currency: true }] as const).map(({ key, label, currency }) => <View key={key} style={s.metric}><Text style={t.muted}>{label}</Text><Text style={[t.metric, { fontSize: 23, lineHeight: 30 }]}>{currency ? money(summary![key]) : summary![key].toLocaleString()}</Text><Text style={t.label}>{comparison(Number(summary![key]), Number(previous![key]))}</Text></View>)}</View>
      {channel === 'royalty' && <Text style={t.muted}>Platform earnings show released royalty service fees. Artist royalties released in this period: {money(summary?.artist_royalties || 0)}. Gross collections show verified royalty payments, including funds awaiting release.</Text>}
      <View style={[s.mainRow, { flexDirection: wide ? 'row' : 'column' }]}><View style={{ flex: wide ? 1.8 : undefined, minWidth: 0 }}>
      <CollectionChart key={`${days}-${channel}-${metric}`} rows={chartRows} channel={channel} metric={metric} />
      </View><View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
      <View style={s.panel}><View style={{ gap: 8 }}><Text style={t.sectionTitle}>Channel comparison</Text><Text style={t.muted}>All channels ranked by {metric === 'earnings' ? 'platform earnings' : 'gross collections'} in this period.</Text></View>
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#FAF7F3', gap: 6 }}><Text style={t.cardTitle}>{best.length ? `${best.length > 1 ? 'Joint leaders' : 'Leading channel'}: ${best.map(item => item.label).join(' & ')}` : `No ${metric === 'earnings' ? 'platform earnings' : 'collections'} recorded yet`}</Text>{best.length > 0 && <Text style={t.muted}>{money(best[0].value)} each{metricTotal > 0 ? ` | ${(best[0].value / metricTotal * 100).toFixed(1)}% of total ${metric === 'earnings' ? 'platform earnings' : 'collections'}` : ''}</Text>}</View>
        {ranked.map((item, index) => { const share = metricTotal > 0 ? item.value / metricTotal * 100 : 0; return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.label}: ${money(item.value)}. Filter to this channel.`} onPress={() => setChannel(item.id)} style={{ gap: 7 }}><View style={s.tableRow}><Text style={t.body}>{index + 1}. {item.label}</Text><Text style={t.cardTitle}>{money(item.value)} <Text style={t.muted}>({share.toFixed(1)}%)</Text></Text></View><View style={s.track}><View style={{ width: `${Math.min(100, share)}%`, height: 7, borderRadius: 4, backgroundColor: item.color }} /></View><Text style={t.label}>{item.payments} recorded payments</Text></Pressable>; })}
      </View></View></View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(!showDetails)} style={[s.disclosure, { flexDirection: 'row', gap: 8 }]}><Text style={[t.button, { color: '#A74646' }]}>{showDetails ? 'Hide additional details' : 'Activity, catalog & calculation details'}</Text>{showDetails ? <ChevronUp size={18} color="#A74646" /> : <ChevronDown size={18} color="#A74646" />}</Pressable>
      {showDetails && <View style={{ gap: 16 }}>
        <Text style={t.muted}>{metric === 'earnings' ? 'Shop and auction earnings use fees on paid, non-refunded purchases. Commission fees are recognized when completed. Released royalty service fees appear only in Royalties, so they are counted once. Held funds are excluded.' : 'Gross collections include recorded refunded purchases and delivery charges. Commission funding and verified royalty payments are counted when received. Royalties covers recurring license reports; resale royalties remain part of the original shop or auction payment. These totals show money received, not platform earnings.'} Simulated purchases are excluded.{current.undated_shop_payments > 0 ? ` ${current.undated_shop_payments} older purchases have no paid date and are excluded from trends.` : ''}{current.undated_completed_commissions > 0 ? ` ${current.undated_completed_commissions} completed commissions lack a completion record and are excluded from dated earnings.` : ''}</Text>
      <AdminOverview data={current.overview} detailed />
      </View>}
      <Text style={t.label}>Updated {new Date(current.as_of).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} (Manila)</Text>
    </>}
  </ScrollView></AdminPage>;
}
const s = StyleSheet.create({
  panel: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5DAD3', padding: 18, gap: 14 },
  content: { maxWidth: 1800, padding: 20, gap: 16, paddingBottom: 32 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: 14, borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 14, backgroundColor: '#FFFFFF' },
  filterField: { flexGrow: 1, flexShrink: 1, flexBasis: 160, maxWidth: 260, gap: 5 },
  selectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 42, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 10, backgroundColor: '#FAF7F3' },
  selectOverlay: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(43,35,32,.3)' },
  selectDialog: { width: '100%', maxWidth: 340, padding: 20, gap: 10, borderRadius: 16, backgroundColor: '#FFFFFF' },
  selectOption: { padding: 12, borderRadius: 10, minHeight: 44, justifyContent: 'center' },
  mainRow: { alignItems: 'stretch', gap: 16 },
  panelHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, control: { minHeight: 36, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5DAD3' }, controlSelected: { backgroundColor: '#F5E8E3', borderColor: '#DAB5AA' },
  metricStrip: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5DAD3', padding: 8 }, metric: { flex: 1, minWidth: 180, padding: 12, gap: 5 },
  plotRow: { flexDirection: 'row', gap: 10 }, yAxis: { width: 55, paddingTop: 24, paddingBottom: 30, justifyContent: 'space-between' }, axisLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  dayDetail: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderColor: '#EFE3DD' },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 8 }, tableRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, track: { height: 7, backgroundColor: '#F5EDE7', borderRadius: 4, overflow: 'hidden' },
});
