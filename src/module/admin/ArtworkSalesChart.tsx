import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { Text } from '@/components/Typography';
import { adminType as t } from './adminDesign';

type Day = { date: string; digital: number; physical: number; total: number };
type Period = { starts_on: string; ends_on: string; series: Day[]; summary: { digital: number; physical: number; total: number; collected: string } };
export type ArtworkSales = { week: Period; month: Period; timezone: string; undated_paid_purchases: number };
const digitalColor = '#B95353', physicalColor = '#887A9E';
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function ArtworkSalesChart({ data }: { data?: ArtworkSales }) {
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [format, setFormat] = useState<'all' | 'digital' | 'physical'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [figures, setFigures] = useState(false);
  if (!data) return null;
  const current = data[period], rows = current.series;
  const selectedDay = rows.find(row => row.date === selected) || rows[rows.length - 1];
  const max = Math.max(1, ...rows.map(row => format === 'all' ? row.total : row[format]));
  const height = 210, bottom = 175, top = 25;
  const chartWidth = Math.max(600, rows.length * 32), step = (chartWidth - 40) / Math.max(1, rows.length);
  const choice = (label: string, active: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.choice, active && s.active]}><Text style={[t.button, { color: active ? '#A74646' : '#746865' }]}>{label}</Text></Pressable>;
  return <View style={s.panel}>
    <View style={s.header}><View style={{ gap: 6 }}><Text style={t.sectionTitle}>Artwork sales</Text><Text style={t.muted}>Paid purchases · {dateLabel(current.starts_on)} – {dateLabel(current.ends_on)} · {data.timezone}</Text></View><View style={s.controls}>{choice('This week', period === 'week', () => { setPeriod('week'); setSelected(null); })}{choice('This month', period === 'month', () => { setPeriod('month'); setSelected(null); })}</View></View>
    <View style={s.summary}><Text style={t.metric}>{current.summary.total.toLocaleString()} purchases</Text><View style={s.controls}><Text style={[t.body, { color: digitalColor }]}>■ {current.summary.digital} digital</Text><Text style={[t.body, { color: physicalColor }]}>■ {current.summary.physical} physical</Text></View><Text style={t.muted}>PHP {Number(current.summary.collected).toLocaleString('en-PH', { minimumFractionDigits: 2 })} collected</Text></View>
    <View style={s.controls}>{choice('Both formats', format === 'all', () => setFormat('all'))}{choice('Digital', format === 'digital', () => setFormat('digital'))}{choice('Physical', format === 'physical', () => setFormat('physical'))}</View>
    <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ justifyContent: 'space-between', height: bottom, paddingTop: top }}><Text style={t.label}>{max}</Text><Text style={t.label}>{Math.floor(max / 2)}</Text><Text style={t.label}>0</Text></View><ScrollView horizontal style={{ flex: 1 }}><View style={{ width: chartWidth }}>
      <Svg width={chartWidth} height={height} viewBox={`0 0 ${chartWidth} ${height}`} accessibilityLabel="Daily digital and physical artwork purchases">
        {[0, .5, 1].map(fraction => <Line key={fraction} x1={20} x2={chartWidth - 20} y1={bottom - fraction * (bottom - top)} y2={bottom - fraction * (bottom - top)} stroke="#E5DAD3" strokeDasharray="4 5" />)}
        {rows.map((row, index) => {
          const digital = format === 'physical' ? 0 : row.digital, physical = format === 'digital' ? 0 : row.physical;
          const dh = digital / max * (bottom - top), ph = physical / max * (bottom - top), x = 20 + index * step + step * .2;
          return <ViewBar key={row.date} x={x} width={step * .6} bottom={bottom} dh={dh} ph={ph} />;
        })}
      </Svg>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20 }}>{rows.map((row, index) => <Pressable key={row.date} accessibilityRole="button" accessibilityLabel={`${dateLabel(row.date)}: ${row.digital} digital, ${row.physical} physical purchases`} onPress={() => setSelected(row.date)} style={{ width: step, minHeight: 44, alignItems: 'center' }}><Text style={[t.label, row.date === selectedDay?.date && { color: '#A74646', fontWeight: '800' }]}>{index % (rows.length > 15 ? 3 : 1) === 0 ? row.date.slice(-2) : '·'}</Text></Pressable>)}</View>
    </View></ScrollView></View>
    {selectedDay && <Text accessibilityLiveRegion="polite" style={t.body}>{dateLabel(selectedDay.date)}: {selectedDay.digital} digital · {selectedDay.physical} physical purchases</Text>}
    {!current.summary.total && <Text style={t.muted}>No paid artwork purchases recorded in this period.</Text>}
    <Text style={t.muted}>Digital licenses can sell more than once; this chart counts purchases, not unique artworks. Simulated, refunded and unpaid transactions are excluded.</Text>
    {!!data.undated_paid_purchases && <Text style={t.muted}>{data.undated_paid_purchases} paid purchases have no payment date and are excluded.</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: figures }} onPress={() => setFigures(!figures)} style={s.choice}><Text style={[t.button, { color: '#A74646' }]}>{figures ? 'Hide' : 'View'} daily figures</Text></Pressable>
    {figures && rows.map(row => <View key={row.date} style={s.figures}><Text style={t.body}>{dateLabel(row.date)}</Text><Text style={t.body}>{row.digital} digital · {row.physical} physical</Text></View>)}
  </View>;
}
function ViewBar({ x, width, bottom, dh, ph }: { x: number; width: number; bottom: number; dh: number; ph: number }) {
  return <><Rect x={x} y={bottom - dh} width={width} height={dh} fill={digitalColor} /><Rect x={x} y={bottom - dh - ph} width={width} height={ph} fill={physicalColor} /></>;
}
const s = StyleSheet.create({
  panel: { padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#E5DAD3', backgroundColor: '#FFF', gap: 18 },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { padding: 10, borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 10, alignSelf: 'flex-start', minHeight: 44 },
  active: { backgroundColor: '#F5E8E3', borderColor: '#C98A80' }, summary: { gap: 8 },
  figures: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F2EAE5' },
});
