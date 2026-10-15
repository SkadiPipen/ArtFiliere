import API_URL from '@/services/api';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function manilaDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export default function AvailabilityCalendar({ artistId, selectedDate, onSelect, onAvailability }: {
  artistId: string | number; selectedDate?: string; onSelect?: (date: string) => void;
  onAvailability?: (dates: string[], ready: boolean) => void;
}) {
  const [month, setMonth] = useState(() => {
    const [year, month] = (selectedDate || manilaDate(new Date())).split('-').map(Number);
    return new Date(year, month - 1, 1);
  });
  const [booked, setBooked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/commissions/artists/${artistId}/availability/`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load availability.');
      setBooked(data.booked_dates); setError(''); onAvailability?.(data.booked_dates, true);
    } catch (error: any) {
      setError(error.message); onAvailability?.([], false);
    } finally { setLoading(false); }
  }, [artistId, onAvailability]);
  useEffect(() => {
    setLoading(true); onAvailability?.([], false);
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh, onAvailability]);
  const today = manilaDate(new Date());
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return <View style={s.panel}>
    <Text style={s.title}>Commission availability</Text>
    <View style={s.heading}>
      <TouchableOpacity accessibilityLabel="Previous month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Text style={s.arrow}>‹</Text></TouchableOpacity>
      <Text style={s.Dtitle}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
      <TouchableOpacity accessibilityLabel="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Text style={s.arrow}>›</Text></TouchableOpacity>
    </View>
    {loading && <ActivityIndicator color="#C15656" />}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error} <Text onPress={refresh}>Retry</Text></Text>}
    <View style={s.grid}>
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <Text key={day} style={s.weekday}>{day}</Text>)}
      {Array.from({ length: month.getDay() }, (_, index) => <View key={`blank-${index}`} style={s.cell} />)}
      {Array.from({ length: days }, (_, index) => {
        const day = index + 1;
        const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const unavailable = booked.includes(key);
        const past = key < today;
        const disabled = unavailable || past || loading || !!error || !onSelect;
        return <TouchableOpacity key={key} disabled={disabled} accessibilityRole="button"
          accessibilityLabel={`${key}, ${unavailable ? 'booked, unavailable' : past ? 'past date' : 'available'}`}
          accessibilityState={{ disabled, selected: key === selectedDate }}
          onPress={() => onSelect?.(key)} style={[s.cell, s.day, unavailable && s.booked, past && s.past, (loading || !!error) && { backgroundColor: '#ECECEC' }, key === selectedDate && s.selected]}>
          <Text style={{ color: unavailable ? '#A13030' : '#40322E' }}>{day}</Text>
        </TouchableOpacity>;
      })}
    </View>
    <Text style={s.caption}>Red: booked · Green: available · Gray: past</Text>
    <Text style={s.caption}>Pending requests do not reserve a day. Accepted commissions do.</Text>
  </View>;
}
const s = StyleSheet.create({
  panel: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E8DCD4', padding: 16, gap: 10 },
  title: { fontSize: 16, fontWeight: '700', color: '#40322E', textAlign: 'center' }, Dtitle: { fontSize: 16, fontWeight: '700', color: '#C15656' }, caption: { fontSize: 12, color: '#75655F', lineHeight: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, arrow: { fontSize: 30, color: '#C15656', paddingHorizontal: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.2857%', textAlign: 'center', fontSize: 11, paddingVertical: 8, color: '#75655F' },
  cell: { width: '14.2857%', minHeight: 38 }, day: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF6EE', borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 8 },
  booked: { backgroundColor: '#FBE0DF' }, past: { opacity: 0.5, backgroundColor: '#ECECEC' }, selected: { borderColor: '#C15656' }, error: { color: '#A13030' },
});
