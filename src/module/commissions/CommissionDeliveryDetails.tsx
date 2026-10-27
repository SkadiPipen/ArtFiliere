import { Text, TextInput } from '@/components/Typography';
import { RefreshCw } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';

export default function CommissionDeliveryDetails({ artistId, onQuote, floorUnit, onFloorUnit, instruction, onInstruction }: {
  artistId: string; onQuote: (quote: any) => void; floorUnit: string; onFloorUnit: (value: string) => void;
  instruction: string; onInstruction: (value: string) => void;
}) {
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async (addressId?: number) => {
    const current = ++sequence.current;
    setLoading(true); setError(''); onQuote(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Sign in to calculate delivery.');
      const response = await fetch(`${API_URL}/api/commissions/delivery-quote/?artist_id=${encodeURIComponent(artistId)}${addressId ? `&address_id=${addressId}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) {
        const message = Array.isArray(data) ? data : data.detail || data.error || data;
        throw new Error(Array.isArray(message) ? message.join('\n') : typeof message === 'string' ? message : JSON.stringify(message));
      }
      if (current !== sequence.current) return;
      setQuote(data); onQuote(data);
    } catch (e: any) { if (current === sequence.current) { setQuote(null); setError(e.message); } }
    finally { if (current === sequence.current) setLoading(false); }
  }, [artistId, onQuote]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  const input = { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D8C9C3', borderRadius: 8, padding: 12 };
  return <View style={{ gap: 10, padding: 16, backgroundColor: '#FFF8EF', borderRadius: 12 }}>
    <Text style={{ fontWeight: '700' }}>Delivery destination</Text>
    <Text>Shipping is calculated from the artist pickup to your saved address. The artist confirms these details before accepting.</Text>
    {loading && <ActivityIndicator />}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A13030' }}>{error}</Text>}
    {quote && <>
      {quote.addresses.map((address: any) => <TouchableOpacity key={address.id} disabled={loading} onPress={() => void load(address.id)} accessibilityRole="radio" accessibilityState={{ checked: address.id === quote.delivery_address_id }}><Text style={{ fontWeight: address.id === quote.delivery_address_id ? '700' : '400' }}>{address.id === quote.delivery_address_id ? '●' : '○'} {address.label || 'Saved address'}: {address.formatted}</Text></TouchableOpacity>)}
      <Text>Recipient: {quote.recipient_name} · {quote.recipient_phone}</Text>
      {['street', 'barangay', 'city', 'province', 'region', 'postal_code'].map(field => <View key={field}><Text>{field === 'barangay' ? 'Barangay' : field.replace('_', ' ')}</Text><Text style={input}>{quote.delivery_snapshot[field]}</Text></View>)}
      <Text>Artist pickup: {quote.pickup_address}</Text>
      <Text>Driving distance: {quote.distance_km} km</Text>
      {Number(quote.distance_km) === 0 && <Text>Pickup and destination are at the same map location. The base delivery fare still applies; there is no distance surcharge.</Text>}
      <Text>Base fare (first {quote.included_km} km): PHP {quote.base_fare}</Text>
      <Text>Additional distance (PHP {quote.per_km}/km): PHP {quote.distance_fee}</Text>
      <Text style={{ fontWeight: '700' }}>Shipping included in total: PHP {quote.fee}</Text>
    </>}
    <Text>Optional Floor / Unit / Room</Text>
    <TextInput accessibilityLabel="Floor, unit or room (optional)" value={floorUnit} onChangeText={onFloorUnit} maxLength={200} style={input} />
    <Text>Delivery instructions (optional)</Text>
    <TextInput accessibilityLabel="Delivery instructions" placeholder="Give us more information about your address" value={instruction} onChangeText={onInstruction} maxLength={1000} multiline style={input} />
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Recalculate shipping" accessibilityState={{ disabled: loading, busy: loading }} disabled={loading} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, opacity: loading ? 0.5 : 1, paddingVertical: 8 }} onPress={() => void load(quote?.delivery_address_id)}><Text style={{ color: '#B84A4A', fontWeight: '700' }}>Recalculate shipping</Text><RefreshCw size={18} color="#B84A4A" /></TouchableOpacity>
    <Text>Update saved addresses in your profile if any details are incorrect. Quotes are valid for 15 minutes.</Text>
  </View>;
}
