import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';
import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type AuctionCheckoutContext = {
  is_auction: boolean; delivery_type: string; price: string;
  recipient_name: string; phone: string; delivery_address: string; notes: string;
};

export default function AuctionDeliveryCheckout({ agreementId, context, busy, onClose, onPay }: {
  agreementId: number; context: AuctionCheckoutContext; busy: boolean;
  onClose: () => void; onPay: (token: string) => Promise<void>;
}) {
  const [name, setName] = useState(context.recipient_name);
  const [phone, setPhone] = useState(context.phone);
  const [address, setAddress] = useState(context.delivery_address);
  const [notes, setNotes] = useState(context.notes);
  const [quote, setQuote] = useState<{ token: string; delivery_fee: string; total: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const update = (setter: (value: string) => void, value: string) => { setter(value); setQuote(null); setError(''); };
  const calculate = async () => {
    setLoading(true); setError(''); setQuote(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please log in again.');
      const response = await fetch(`${API_URL}/api/checkout/agreements/${agreementId}/delivery/`, {
        method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_name: name, recipient_phone: phone, delivery_address: address, delivery_notes: notes }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Unable to calculate delivery.');
      setQuote(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  const money = (value: string) => `PHP ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <Modal visible transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
    <View style={s.overlay}><ScrollView style={s.card} contentContainerStyle={{ padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Delivery and checkout</Text>
      <Text>Your winning bid is fixed. Confirm where we should deliver your artwork.</Text>
      <Text>Recipient name</Text>
      <TextInput accessibilityLabel="Recipient name" style={s.input} value={name} maxLength={150} editable={!busy && !loading} onChangeText={v => update(setName, v)} />
      <Text>Phone number</Text>
      <TextInput accessibilityLabel="Recipient phone number" style={s.input} value={phone} maxLength={20} keyboardType="phone-pad" editable={!busy && !loading} onChangeText={v => update(setPhone, v)} />
      <Text>Delivery address</Text>
      <TextInput accessibilityLabel="Delivery address" style={s.input} value={address} maxLength={255} multiline placeholder="Street, barangay, city, Cebu, postal code" editable={!busy && !loading} onChangeText={v => update(setAddress, v)} />
      <Text>Delivery notes (optional)</Text>
      <TextInput accessibilityLabel="Delivery notes" style={s.input} value={notes} maxLength={1000} multiline editable={!busy && !loading} onChangeText={v => update(setNotes, v)} />
      <Text style={s.hint}>Delivery is currently available within Cebu. The fee uses the current local delivery distance estimate.</Text>
      {!!error && <Text accessibilityRole="alert" style={{ color: '#B42318' }}>{error}</Text>}
      <TouchableOpacity style={s.secondary} disabled={busy || loading || !name.trim() || !phone.trim() || !address.trim()} onPress={calculate}>
        <Text>{loading ? 'Calculating delivery…' : 'Calculate delivery fee'}</Text>
      </TouchableOpacity>
      <View style={s.summary}>
        <Text>Winning bid: {money(context.price)}</Text>
        <Text>Delivery fee: {quote ? money(quote.delivery_fee) : 'Calculate above'}</Text>
        <Text style={{ fontWeight: '700' }}>Total: {quote ? money(quote.total) : 'Awaiting delivery quote'}</Text>
      </View>
      <TouchableOpacity style={[s.pay, (!quote || busy || loading) && { opacity: 0.5 }]} disabled={!quote || busy || loading} onPress={async () => {
        if (!quote) return;
        try { await onPay(quote.token); }
        catch (e: any) { setError(e.message); setQuote(null); }
      }}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Opening payment…' : 'Continue to payment'}</Text></TouchableOpacity>
      {busy && <ActivityIndicator />}
      <TouchableOpacity disabled={busy || loading} onPress={onClose}><Text style={{ textAlign: 'center', padding: 10 }}>Cancel</Text></TouchableOpacity>
    </ScrollView></View>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: '#fff', borderRadius: 16, flexGrow: 0 },
  title: { fontSize: 23, fontWeight: '700', color: '#9b5146' },
  input: { borderWidth: 1, borderColor: '#D5D5D5', borderRadius: 8, padding: 12, color: '#222' },
  hint: { color: '#666', fontSize: 12 },
  summary: { backgroundColor: '#FAF4EF', padding: 16, gap: 8, borderRadius: 8 },
  secondary: { padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#C15656', borderRadius: 8 },
  pay: { padding: 16, alignItems: 'center', backgroundColor: '#C15656', borderRadius: 8 },
});
