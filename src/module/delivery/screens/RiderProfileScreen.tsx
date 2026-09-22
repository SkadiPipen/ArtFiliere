import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth } from '@/firebase/config';
import { fetchRiderProfile } from '@/services/deliveryApi';
import { Portal, Action, s } from '../components/Portal';
export default function RiderProfileScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { fetchRiderProfile().then(setData).catch(e => setError(e.message)); }, []);
  useFocusEffect(load);
  return <Portal title="Rider Profile" error={error}>
    {data && <View style={s.card}><Text>{data.fullName} ({data.username})</Text><Text>{data.email}</Text><Text>{data.phoneNum || 'No contact number saved'}</Text><Text>Completed deliveries: {data.total_delivery}</Text></View>}
    <Action title="Edit profile and address" onPress={() => router.push('/(home)/edit-profile')} />
    <Action title="Sign out" onPress={async () => { try { await signOut(auth); router.replace('/rider/login' as any); } catch (e: any) { setError(e.message); } }} />
  </Portal>;
}
