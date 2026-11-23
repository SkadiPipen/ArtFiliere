import CalendarDateField from '@/components/CalendarDateField';
import { parseDateValue } from '@/components/calendarDateValue';
import { Text } from '@/components/Typography';
import { COLORS } from '@/constants/colors';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

export type AuctionScheduleProps = { label: string; value: string; minimum: string; onChange: (value: string) => void };

export default function AuctionScheduleField({ label, value, minimum, onChange }: AuctionScheduleProps) {
  const [open, setOpen] = useState(false);
  const [day, clock = '12:00'] = value.split('T');
  const [hour, minute] = clock.split(':').map(Number);
  const selected = parseDateValue(day) ?? new Date();
  selected.setHours(hour, minute, 0, 0);
  return <View style={{ gap: 8 }}>
    <CalendarDateField label={`${label} date`} value={day} minimumDate={parseDateValue(minimum.slice(0, 10)) ?? undefined} onChange={date => onChange(`${date}T${clock}`)} />
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} time`} disabled={!day} onPress={() => setOpen(!open)}
      style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, opacity: day ? 1 : .5 }}>
      <Text style={{ color: COLORS.textDark }}>{day ? `${clock} PHT` : 'Choose a date first'}</Text>
    </Pressable>
    {open && !!day && <DateTimePicker value={selected} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, time) => {
      if (Platform.OS !== 'ios') setOpen(false);
      if (event.type === 'set' && time) onChange(`${day}T${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
    }} />}
  </View>;
}
