import { Text } from '@/components/Typography';
import TransactionHeader from '@/components/TransactionHeader';
import DeliveryLeafletMap from '@/module/delivery/components/DeliveryLeafletMap';
import { purchaseRequest } from '@/services/purchases';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tracking = {
  status: string; status_label: string; pickup_address: string; delivery_address: string;
  pickup_coordinates: [number, number] | null; delivery_coordinates: [number, number] | null;
  location_notices: Record<string, string>; location_errors: Record<string, string>;
  timeline: Record<string, string>;
  driver: { name: string; latitude: number | null; longitude: number | null; is_live: boolean; updated_at: string | null } | null;
};
const stages = [['pending', 'Waiting for driver'], ['accepted', 'Driver assigned'], ['arrived_at_artist', 'At artist pickup'], ['picked_up', 'Artwork collected'], ['in_transit', 'In transit'], ['arrived_at_buyer', 'At delivery destination'], ['delivered', 'Delivered']];

export default function BuyerDeliveryTracking({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const [data, setData] = useState<Tracking | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const snapshot = await purchaseRequest(`delivery/tracking/${orderId}/`);
      if (mounted.current) { setData(snapshot); setError(''); }
    } catch (e: any) {
      if (mounted.current) {
        setError(e.message);
        setData(previous => previous ? { ...previous, driver: previous.driver ? { ...previous.driver, latitude: null, longitude: null, is_live: false } : null } : null);
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }, [orderId]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [refresh]);
  const pickup = !data || ['pending', 'accepted', 'arrived_at_artist'].includes(data.status);
  const side = pickup ? 'pickup' : 'delivery';
  const point = pickup ? data?.pickup_coordinates : data?.delivery_coordinates;
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
      <TransactionHeader title="Track delivery" onBack={onClose} onRefresh={() => void refresh()} refreshing={busy} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, maxWidth: 960, width: '100%', alignSelf: 'center', paddingBottom: 40 }}>
        {!!error && <Text accessibilityRole="alert" style={{ color: '#A13030' }}>{error}</Text>}
        {!data && busy && <ActivityIndicator color="#C15656" />}
        {data && <>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#A43F48' }}>{data.status_label}</Text>
          <Text>Driver: {data.driver?.name || 'Awaiting assignment'}</Text>
          <Text>{data.status === 'delivered' ? 'Delivery completed. Driver location sharing has ended.' : data.driver?.is_live ? 'Driver location is updating. Refreshes every 5 seconds while this screen is open.' : 'Waiting for a recent driver location. The driver must be clocked in with location permission enabled and the app open.'}</Text>
          {data.driver?.is_live && data.driver.updated_at && <Text>Location updated: {new Date(data.driver.updated_at).toLocaleTimeString()}</Text>}
          <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E8DCD4' }}>
            <DeliveryLeafletMap driverLat={data.driver?.latitude} driverLng={data.driver?.longitude} targetLat={point?.[1] ?? null} targetLng={point?.[0] ?? null} targetLabel={pickup ? data.pickup_address : data.delivery_address} isPickupStep={pickup} />
          </View>
          {!!data.location_notices?.[side] && <Text style={{ color: '#795500' }}>{data.location_notices[side]}</Text>}
          {!!data.location_errors?.[side] && <Text style={{ color: '#A13030' }}>{data.location_errors[side]}</Text>}
          <Text style={{ fontWeight: '700' }}>Artist pickup</Text><Text>{data.pickup_address}</Text>
          <Text style={{ fontWeight: '700' }}>Delivery destination</Text><Text>{data.delivery_address}</Text>
          <Text style={{ fontWeight: '700', fontSize: 17 }}>Delivery timeline</Text>
          {stages.map(([key, label]) => <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: data.timeline[key] ? '#C15656' : '#E8DCD4', paddingLeft: 12, paddingVertical: 6, gap: 4 }}>
            <Text style={{ fontWeight: data.timeline[key] ? '700' : '400' }}>{label}</Text>
            <Text style={{ color: '#806E66', fontSize: 12 }}>{data.timeline[key] ? new Date(data.timeline[key]).toLocaleString() : 'Pending'}</Text>
          </View>)}
          <Text style={{ color: '#806E66', fontSize: 12 }}>The map shows the driver’s reported device location, not a GPS sensor attached to the artwork. Routes are estimates.</Text>
        </>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
