import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native';
import AddressBook, { SavedAddress } from '@/components/AddressBook';
import { purchaseRequest } from '@/services/purchases';

export type DeliveryQuote = { token: string; fee: string; distance_km: string; base_fare: string; per_km: string; pickup_address: string; delivery_address: string; expires_in: number };
type Context = { pickup: SavedAddress | null; destination: SavedAddress | null; own_side: 'pickup' | 'destination'; addresses: SavedAddress[] };

export default function DeliveryAddressPicker({ artworkId, revisionId, onQuote }: { artworkId: string | number; revisionId?: number; onQuote: (quote: DeliveryQuote | null) => void }) {
  const [context, setContext] = useState<Context | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manage, setManage] = useState(false);
  const generation = useRef(0);
  const onQuoteRef = useRef(onQuote); onQuoteRef.current = onQuote;
  const expireTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearQuote = () => { if (expireTimer.current) clearTimeout(expireTimer.current); setQuote(null); onQuoteRef.current(null); };
  const calculate = async (id: number) => {
    const version = ++generation.current;
    clearQuote(); setBusy(true); setError(''); setSelected(id);
    try {
      const result: DeliveryQuote = await purchaseRequest(`delivery/quote/${artworkId}/`, 'POST', { address_id: id, agreement_id: revisionId });
      if (version !== generation.current) return;
      setQuote(result); onQuoteRef.current(result);
      expireTimer.current = setTimeout(() => { clearQuote(); setError('Delivery quote expired. Calculate again before sending.'); }, result.expires_in * 1000);
    } catch (e: any) { if (version === generation.current) setError(e.message); }
    finally { if (version === generation.current) setBusy(false); }
  };
  const load = async () => {
    const version = ++generation.current;
    clearQuote(); setBusy(true); setError('');
    try {
      const data: Context = await purchaseRequest(`delivery/quote/${artworkId}/${revisionId ? `?agreement_id=${revisionId}` : ''}`);
      if (version !== generation.current) return;
      setContext(data);
      const id = data[data.own_side]?.id ?? data.addresses[0]?.id;
      setSelected(id ?? null);
      if (id && data.pickup && data.destination) { await calculate(id); return; }
      setError('Both parties need a complete saved address.');
    } catch (e: any) { if (version === generation.current) setError(e.message); }
    finally { if (version === generation.current) setBusy(false); }
  };
  useEffect(() => { load(); return () => { ++generation.current; if (expireTimer.current) clearTimeout(expireTimer.current); }; }, [artworkId, revisionId]);
  const own = context?.addresses.find(a => a.id === selected);
  const pickup = context?.own_side === 'pickup' ? own : context?.pickup;
  const destination = context?.own_side === 'destination' ? own : context?.destination;
  return <View style={{ gap: 10, marginVertical: 14 }}>
    <Text style={{ fontWeight: '600', fontSize: 16 }}>Physical delivery</Text>
    <Text>Pickup: {pickup?.formatted || 'Artist needs to save an address'}</Text>
    <Text>Deliver to: {destination?.formatted || 'Buyer needs to save an address'}</Text>
    <Text>Choose your {context?.own_side === 'pickup' ? 'pickup' : 'delivery'} address. Only the other party can change their address.</Text>
    {context?.addresses.map(address => <TouchableOpacity key={address.id} disabled={manage} onPress={() => calculate(address.id)} style={{ padding: 12, borderWidth: 1, borderRadius: 8, borderColor: selected === address.id ? '#D48C62' : '#ddd', backgroundColor: selected === address.id ? '#FFF5EB' : '#fff' }}>
      <Text style={{ fontWeight: '600' }}>{address.label}{address.is_default ? ' (Default)' : ''}</Text><Text>{address.formatted}</Text>
    </TouchableOpacity>)}
    {busy && <ActivityIndicator />}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}
    {quote && <View style={{ gap: 6 }}>
      <Text>Driving distance: {Number(quote.distance_km).toFixed(3)} km</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        <TouchableOpacity onPress={() => Linking.openURL('https://openrouteservice.org/')}><Text style={{ color: '#A75A2C', fontSize: 12 }}>Routing © openrouteservice</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}><Text style={{ color: '#A75A2C', fontSize: 12 }}>Map data © OpenStreetMap contributors</Text></TouchableOpacity>
      </View>
      <Text>PHP {quote.base_fare} + PHP {quote.per_km}/km = PHP {quote.fee}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(quote.pickup_address + ', Philippines')}&destination=${encodeURIComponent(quote.delivery_address + ', Philippines')}&travelmode=driving`)}><Text style={{ color: '#A75A2C' }}>View addresses in Google Maps</Text></TouchableOpacity>
      <Text>The delivery fee is added to the artwork price and saved with your proposal.</Text>
    </View>}
    <TouchableOpacity disabled={busy || manage} onPress={load}><Text style={{ color: '#A75A2C' }}>Refresh addresses and calculate delivery</Text></TouchableOpacity>
    <TouchableOpacity onPress={() => { ++generation.current; clearQuote(); setBusy(false); setManage(!manage); if (manage) load(); }}><Text style={{ color: '#A75A2C' }}>{manage ? 'Done managing addresses' : 'Manage my addresses'}</Text></TouchableOpacity>
    {manage && <AddressBook onChanged={() => { ++generation.current; clearQuote(); }} />}
  </View>;
}
