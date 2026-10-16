import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Text, TouchableOpacity, View } from 'react-native';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import AuctionDeliveryCheckout, { type AuctionCheckoutContext } from '@/module/cart/components/AuctionDeliveryCheckout';
import { readApiResponse } from './contracts';

// Shared by the chat card and signing modal so they cannot launch twice.
const attempted = new Set<number>();
const running = new Set<number>();
export default function AutomaticCheckout({ id, onChange }: { id: number; onChange?: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [delivery, setDelivery] = useState<AuctionCheckoutContext | null>(null);
  const launchRef = useRef<() => Promise<void>>(async () => {});
  const request = async (method: string, body?: object) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in again to continue checkout.');
    const response = await fetch(`${API_URL}/api/checkout/agreements/${id}/`, { method, headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return readApiResponse(response);
  };
  const remember = () => {
    attempted.add(id);
    if (Platform.OS === 'web') { try { sessionStorage.setItem(`agreement-checkout-${id}`, 'opened'); } catch {} }
  };
  const launch = async (deliveryQuote?: string) => {
    if (running.has(id)) return;
    running.add(id); setBusy(true); setError('');
    try {
      remember();
      if (!deliveryQuote) {
        const context = await request('GET');
        if (context.is_auction && context.delivery_type === 'physical') { setDelivery(context); return; }
      }
      const result = await request('POST', deliveryQuote ? { delivery_quote: deliveryQuote } : {});
      setDelivery(null);
      if (result.simulated || result.paid) { setDone(true); await onChange?.(); return; }
      if (!result.checkout_url || !/^https:\/\//i.test(result.checkout_url)) throw new Error('Checkout did not return a secure payment link.');
      await onChange?.();
      if (Platform.OS === 'web') window.location.assign(result.checkout_url);
      else await Linking.openURL(result.checkout_url);
    } catch (e: any) { setError(e.message || 'Unable to open checkout. Use Continue to checkout to retry.'); if (deliveryQuote) throw e; }
    finally { running.delete(id); setBusy(false); }
  };
  launchRef.current = () => launch();
  useEffect(() => {
    let opened = attempted.has(id);
    if (Platform.OS === 'web') { try { opened ||= sessionStorage.getItem(`agreement-checkout-${id}`) === 'opened'; } catch {} }
    if (!opened) void launchRef.current();
  }, [id]);
  return <View style={{ gap: 10, padding: 14, backgroundColor: '#FFF7F0', borderRadius: 12 }}>
    {delivery && <AuctionDeliveryCheckout agreementId={id} context={delivery} busy={busy} onClose={() => setDelivery(null)} onPay={launch} />}
    <Text style={{ color: '#70482F', fontWeight: '600' }}>{done ? 'Test checkout completed. No money was charged.' : busy ? 'Opening checkout…' : 'Both parties have signed. Continue to payment.'}</Text>
    <Text style={{ color: '#81756D', fontSize: 12 }}>Opening checkout does not charge you. Confirm payment with the payment provider.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}
    {busy ? <ActivityIndicator /> : !done && <TouchableOpacity accessibilityRole="button" onPress={() => void launch()} style={{ padding: 12, borderWidth: 1, borderColor: '#E68A50', borderRadius: 10 }}><Text style={{ color: '#70482F', fontWeight: '600' }}>Continue to checkout</Text></TouchableOpacity>}
  </View>;
}
