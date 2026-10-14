import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import type { CalendarDateFieldProps } from './calendarDateValue';
import { dateValue, parseDateValue } from './calendarDateValue';

export default function CalendarDateField({ value, onChange, label, minimumDate, maximumDate }: CalendarDateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(value) || minimumDate || maximumDate || new Date();
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ borderWidth: 1, borderColor: '#DDCFC6', borderRadius: 8, padding: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: '#FFF' }}>
      <Text style={{ color: value ? '#3A2D2A' : '#8C7B70', flex: 1 }}>{value ? selected.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Select date'}</Text>
      <CalendarDays size={20} color="#C15656" />
    </Pressable>
    {open && <>
      <DateTimePicker value={selected} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} minimumDate={minimumDate} maximumDate={maximumDate} onChange={(event, date) => {
        if (Platform.OS !== 'ios') setOpen(false);
        if (event.type === 'set' && date) onChange(dateValue(date));
      }} />
      {Platform.OS === 'ios' && <Pressable accessibilityRole="button" onPress={() => { if (!value) onChange(dateValue(selected)); setOpen(false); }} style={{ alignSelf: 'flex-end', padding: 12 }}><Text style={{ color: '#C15656', fontWeight: '700' }}>Done</Text></Pressable>}
    </>}
  </View>;
}
