import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface DeliveryQuote {
  token: string;
  delivery_address: string;
  fee: number;
  base_fee?: number;
  priority_fee?: number;
  distance_km?: number;
  is_priority?: boolean;
}

interface DeliveryAddressPickerProps {
  artworkId: number | string;
  artistAddress?: string;
  initialAddress?: unknown;
  revisionId?: number;
  onQuote: (quote: DeliveryQuote | null) => void;
}

type Address = { id: number; formatted: string; label: string };
type QuoteContext = {
  own_side: 'pickup' | 'destination';
  pickup: Address | null;
  destination: Address | null;
  addresses: Address[];
};

export default function DeliveryAddressPicker({ artworkId, revisionId, onQuote }: DeliveryAddressPickerProps) {
  const [context, setContext] = useState<QuoteContext | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const callback = useRef(onQuote);
  callback.current = onQuote;
  const generation = useRef(0);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endpoint = API_URL + '/api/delivery/quote/' + artworkId + '/';

  const invalidate = () => {
    if (expiry.current) clearTimeout(expiry.current);
    setQuote(null);
    callback.current(null);
  };

  useEffect(() => {
    let mounted = true;
    generation.current += 1;
    invalidate();
    setContext(null);
    setSelected(null);
    setError('');
    setLoading(true);
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Sign in to calculate delivery.');
        const response = await fetch(endpoint + (revisionId ? '?agreement_id=' + revisionId : ''), {
          headers: { Authorization: 'Bearer ' + token },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(String(data.error || 'Delivery addresses are unavailable.'));
        if (mounted) {
          setContext(data);
          const own = data.own_side === 'pickup' ? data.pickup : data.destination;
          setSelected(own?.id ?? data.addresses[0]?.id ?? null);
        }
      } catch (failure) {
        if (mounted) setError(failure instanceof Error ? failure.message : 'Delivery addresses are unavailable.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      generation.current += 1;
      if (expiry.current) clearTimeout(expiry.current);
    };
  }, [endpoint, revisionId]);

  const calculate = async () => {
    if (!selected || loading) return;
    invalidate();
    const current = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Sign in to calculate delivery.');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ address_id: selected, agreement_id: revisionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.error || 'Delivery could not be calculated. Please try again.'));
      if (typeof data.token !== 'string' || !data.token || !Number.isFinite(Number(data.fee)) || Number(data.fee) < 0) {
        throw new Error('Invalid delivery quote. Please try again.');
      }
      if (current !== generation.current) return;
      const resolved: DeliveryQuote = { ...data, fee: Number(data.fee) };
      setQuote(resolved);
      callback.current(resolved);
      expiry.current = setTimeout(() => {
        invalidate();
        setError('Delivery quote expired. Calculate delivery again before sending.');
      }, Math.max(1, Number(data.expires_in || 900) - 10) * 1000);
    } catch (failure) {
      if (current === generation.current) setError(failure instanceof Error ? failure.message : 'Delivery could not be calculated.');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };

  return <View style={styles.container}>
    <Text style={styles.heading}>Delivery information</Text>
    <Text style={styles.note}>Choose your saved address, then calculate delivery. Edit saved addresses in your profile if needed.</Text>
    {!!context && <>
      <Text style={styles.note}>Pickup: {context.pickup?.formatted || 'Artist address required'}</Text>
      <Text style={styles.note}>Destination: {quote?.delivery_address || context.destination?.formatted || 'Buyer address required'}</Text>
      <Text style={styles.heading}>Your {context.own_side === 'pickup' ? 'pickup' : 'delivery'} address</Text>
      {context.addresses.map(address => <TouchableOpacity key={address.id} disabled={loading} accessibilityRole="radio" accessibilityState={{ checked: selected === address.id }} style={[styles.address, selected === address.id && styles.selected]} onPress={() => {
        generation.current += 1;
        invalidate();
        setError('');
        setSelected(address.id);
      }}>
        <Text>{selected === address.id ? '● ' : '○ '}{address.label}: {address.formatted}</Text>
      </TouchableOpacity>)}
      {!context.addresses.length && <Text style={styles.error}>Add a complete saved address in your profile first.</Text>}
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {loading && <ActivityIndicator color="#BC5454" />}
    <TouchableOpacity accessibilityRole="button" disabled={loading || !selected} onPress={calculate} style={[styles.button, (loading || !selected) && styles.disabled]}>
      <Text style={styles.buttonText}>{quote ? 'Recalculate delivery' : 'Calculate delivery'}</Text>
    </TouchableOpacity>
    {!!quote && <View style={styles.address}>
      <Text style={styles.note}>Road distance: {Number(quote.distance_km).toFixed(1)} km</Text>
      <Text style={styles.heading}>Delivery fee: ₱{quote.fee.toFixed(2)}</Text>
      <Text style={styles.note}>Server-calculated quote · Valid for 15 minutes</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  container: { marginVertical: 16, gap: 10 },
  heading: { color: '#BC5454', fontWeight: '700', fontSize: 14 },
  note: { color: '#666', fontSize: 12, lineHeight: 18 },
  address: { padding: 12, borderWidth: 1, borderColor: '#DDD', borderRadius: 8, gap: 6 },
  selected: { borderColor: '#BC5454', backgroundColor: '#FFF8F6' },
  button: { backgroundColor: '#BC5454', padding: 12, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { color: '#A13030', fontSize: 13 },
});
