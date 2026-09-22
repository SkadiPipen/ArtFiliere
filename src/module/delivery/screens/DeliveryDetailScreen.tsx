import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Platform, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { fetchDelivery, updateOrderStatusApi, updateRiderLocationApi, uploadDeliveryProofApi } from '@/services/deliveryApi';
import type { ActiveDelivery, DeliveryStep } from '../types/delivery';
import { ArtistPickupCard } from '../components/ArtistPickupCard';
import { BuyerDeliveryCard } from '../components/BuyerDeliveryCard';
import { DeliveryProgressBar } from '../components/DeliveryProgressBar';
import { Portal, Action, s } from '../components/Portal';
import DeliveryMap from '../components/DeliveryMap';
import RiderGate from '../RiderGate';

function Details() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const [delivery, setDelivery] = useState<ActiveDelivery | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const load = useCallback(async () => {
    if (!id) { setError('No delivery was selected.'); return; }
    try { setDelivery(await fetchDelivery(id)); setError(''); } catch (e: any) { setError(e.message); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusEffect(useCallback(() => {
    if (!sharing) return;
    let active = true; let subscription: Location.LocationSubscription | undefined;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (!permission.granted) throw new Error('Location permission is needed to share your position.');
        const watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 20 }, location => {
          if (active) updateRiderLocationApi(location.coords.latitude, location.coords.longitude).catch(e => { if (active) setError(e.message); });
        });
        if (!active) watcher.remove(); else subscription = watcher;
      } catch (e: any) { if (active) { setError(e.message); setSharing(false); } }
    })();
    return () => { active = false; subscription?.remove(); };
  }, [sharing]));
  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const photo = (type: 'PICKUP' | 'DELIVERY') => run(async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error('Camera permission is needed for proof photos.');
    }
    const result = Platform.OS === 'web'
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
      : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64) throw new Error('The photo could not be read. Try again.');
    setDelivery(await uploadDeliveryProofApi(id, type, `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`));
  });
  const next: Partial<Record<DeliveryStep, [DeliveryStep, string]>> = {
    ACCEPTED: ['ARRIVED_AT_ARTIST', 'Confirm arrival at artist'],
    ARRIVED_AT_ARTIST: ['PICKED_UP', 'Confirm artwork collected'],
    PICKED_UP: ['IN_TRANSIT', 'Start delivery'],
    IN_TRANSIT: ['ARRIVED_AT_BUYER', 'Confirm arrival at buyer'],
    ARRIVED_AT_BUYER: ['DELIVERED', 'Complete delivery'],
  };
  const action = delivery ? next[delivery.step] : undefined;
  const missingProof = delivery?.step === 'ARRIVED_AT_ARTIST' && !delivery.has_pickup_proof || delivery?.step === 'ARRIVED_AT_BUYER' && !delivery.has_delivery_proof;
  return <Portal title={`Delivery #${id || ''}`} error={error}>
    <Action title="Back to rider portal" onPress={() => router.replace('/rider/(tabs)' as any)} />
    {!delivery && !error && <ActivityIndicator />}
    {delivery && <>
      <Text>{delivery.paymentMethod} - delivery fee PHP {delivery.fee}</Text>
      <DeliveryProgressBar currentStep={delivery.step} />
      <ArtistPickupCard artist={delivery.artist} isArrived={delivery.step === 'ARRIVED_AT_ARTIST'} photoUri={delivery.artistPhotoUri} onTakePhoto={() => photo('PICKUP')} />
      <BuyerDeliveryCard buyer={delivery.buyer} items={delivery.items} isArrived={delivery.step === 'ARRIVED_AT_BUYER'} photoUri={delivery.buyerPhotoUri} onTakePhoto={() => photo('DELIVERY')} />
      {delivery.step !== 'DELIVERED' && <>
        <DeliveryMap title={['ACCEPTED', 'ARRIVED_AT_ARTIST'].includes(delivery.step) ? 'Navigate to pickup' : 'Navigate to buyer'} address={['ACCEPTED', 'ARRIVED_AT_ARTIST'].includes(delivery.step) ? delivery.artist.address : delivery.buyer.address} onError={setError} />
        <Action title={sharing ? 'Stop sharing GPS' : 'Share GPS while this screen is open'} onPress={() => setSharing(!sharing)} />
      </>}
      {missingProof && <Text>Add the proof photo above before continuing.</Text>}
      {action && <Action disabled={busy || missingProof} title={action[1]} onPress={() => run(async () => { const updated = await updateOrderStatusApi(id, action[0]); setDelivery(updated); if (updated.step === 'DELIVERED') setSharing(false); })} />}
      {delivery.step === 'DELIVERED' && <View style={s.card}><Text>Delivery completed</Text>{[delivery.artistPhotoUri, delivery.buyerPhotoUri].map((uri, index) => uri && <View key={index}><Text>{index === 0 ? 'Pickup proof' : 'Delivery proof'}</Text><Image source={{ uri }} style={{ height: 180, width: '100%' }} resizeMode="contain" /></View>)}</View>}
    </>}
    <Action title="Refresh" disabled={busy} onPress={load} />
  </Portal>;
}
export default function DeliveryDetailScreen() { return <RiderGate><Details /></RiderGate>; }
