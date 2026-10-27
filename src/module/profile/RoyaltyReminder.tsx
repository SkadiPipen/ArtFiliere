import { Text } from '@/components/Typography';
import { router } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

export type RoyaltyReminderData = {
  status: string; message: string; report_opens_on?: string; due_on?: string;
  days_until_report?: number; days_until_due?: number; can_submit?: boolean; overdue?: boolean;
};
const date = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
export default function RoyaltyReminder({ data, onOpen }: { data?: RoyaltyReminderData | null; onOpen: () => void }) {
  if (!data) return null;
  const waiting = (data.days_until_report ?? 0) > 0;
  return <View style={{ padding: 14, gap: 6, borderRadius: 10, backgroundColor: data.overdue ? '#FCE7E4' : '#F5E8E3' }}>
    <Text style={{ fontWeight: '800', color: '#5A4944' }}>Royalty reporting reminder</Text>
    <Text>{data.message}</Text>
    {waiting && <Text>Reporting opens in {data.days_until_report} day(s) · {date(data.report_opens_on!)}</Text>}
    {!!data.due_on && <Text>Deadline: {date(data.due_on)}{data.can_submit ? ` · ${data.overdue ? `${Math.abs(data.days_until_due!)} day(s) overdue` : `${data.days_until_due} day(s) remaining`}` : ''}</Text>}
    <TouchableOpacity accessibilityRole="button" onPress={() => { onOpen(); router.push('/royalty-reports'); }}>
      <Text style={{ color: '#A74646', fontWeight: '700', marginTop: 4 }}>{data.can_submit ? 'Submit royalty report →' : 'View royalty reports →'}</Text>
    </TouchableOpacity>
  </View>;
}
