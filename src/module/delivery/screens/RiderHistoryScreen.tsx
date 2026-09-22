import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchDeliveryHistory } from '@/services/deliveryApi';
import { Portal, Action, s } from '../components/Portal';
export default function RiderHistoryScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(() => { fetchDeliveryHistory().then(data => { setRows(data); setError(''); }).catch(e => setError(e.message)); }, []);
  useFocusEffect(load);
  return <Portal title="Delivery History" error={error}><Action title="Refresh" onPress={load} />
    {!rows.length && <Text>No completed deliveries yet.</Text>}
    {rows.map(row => <View style={s.card} key={row.id}><Text>Order #{row.id}: {row.artwork_title}</Text><Text>{row.customer_name}</Text><Text>{row.address}</Text><Text>Delivered: {row.delivered_at ? new Date(row.delivered_at).toLocaleString() : 'Not recorded'}</Text><Text>Delivery fee: PHP {row.fee}</Text><Action title="View delivery and proof" onPress={() => router.push({ pathname: '/delivery-details', params: { id: String(row.id) } } as any)} /></View>)}
  </Portal>;
}
