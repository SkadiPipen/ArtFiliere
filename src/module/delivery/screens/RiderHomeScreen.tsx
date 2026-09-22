import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { fetchRiderProfile, fetchActiveDeliveryApi, setRiderClock, updateRiderLocationApi } from '@/services/deliveryApi';
import { Portal, Action, s } from '../components/Portal';
import type { ActiveDelivery } from '../types/delivery';

export default function RiderHomeScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [delivery, setDelivery] = useState<ActiveDelivery | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const [p, d] = await Promise.all([fetchRiderProfile(), fetchActiveDeliveryApi()]); setProfile(p); setDelivery(d); setError(''); }
    catch (e: any) { setError(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  return <Portal title="Rider Portal" error={error}>
    {!profile && !error && <ActivityIndicator />}
    {profile && <View style={s.card}>
      <Text>Welcome, {profile.fullName}</Text><Text>{profile.is_clocked_in ? 'Clocked in' : 'Clocked out'}</Text>
      {profile.clock_in_time && <Text>Started: {new Date(profile.clock_in_time).toLocaleString()}</Text>}
      <Text>Completed deliveries: {profile.total_delivery}</Text>
      <Action disabled={busy} title={profile.is_clocked_in ? 'Clock out' : 'Clock in'} onPress={() => run(async () => setProfile(await setRiderClock(!profile.is_clocked_in)))} />
      {profile.is_clocked_in && <Action disabled={busy} title="Update my GPS location" onPress={() => run(async () => {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Location permission is needed to share your position.');
        const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await updateRiderLocationApi(result.coords.latitude, result.coords.longitude); await load();
      })} />}
      {profile.location_updated_at && <Text>GPS last updated: {new Date(profile.location_updated_at).toLocaleString()}</Text>}
    </View>}
    {delivery ? <View style={s.card}><Text>Active order #{delivery.id}: {delivery.step.replaceAll('_', ' ')}</Text><Text>{delivery.artist.name} to {delivery.buyer.name}</Text><Action title="Continue delivery" onPress={() => router.push({ pathname: '/delivery-details', params: { id: String(delivery.id) } } as any)} /></View> : <Text>No active delivery. Open Orders to accept one.</Text>}
    <Action title="Refresh" onPress={load} />
  </Portal>;
}
