import { Text, TextInput } from '@/components/Typography';
import { getDriverPosition } from '@/services/driverLocation';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { purchaseRequest } from '@/services/purchases';

const fields = ['label', 'street', 'barangay', 'city', 'province', 'region', 'postal_code'] as const;
const empty = { label: 'Home', street: '', barangay: '', city: '', province: '', region: '', postal_code: '', is_default: false };
export type SavedAddress = typeof empty & { id: number; formatted: string; latitude?: number | null; longitude?: number | null };

export default function AddressBook({ onChanged, showLocationFields = true }: { onChanged?: () => void; showLocationFields?: boolean }) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [form, setForm] = useState<typeof empty | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pinLat, setPinLat] = useState('');
  const [pinLng, setPinLng] = useState('');
  const [locating, setLocating] = useState(false);
  const reload = async () => setAddresses(await purchaseRequest('addresses/'));
  useEffect(() => { reload().catch(e => setError(e.message)); }, []);
  const change = async (path: string, method: string, body?: object) => {
    setBusy(true); setError('');
    try {
      await purchaseRequest(path, method, body);
      setForm(null); setEditing(null); setRemoving(null);
      await reload(); onChanged?.();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const saveAddress = () => {
    const hasPin = !!pinLat.trim() || !!pinLng.trim();
    const latitude = hasPin ? Number(pinLat) : null;
    const longitude = hasPin ? Number(pinLng) : null;
    if (hasPin && (!pinLat.trim() || !pinLng.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude!) > 85 || Math.abs(longitude!) > 180)) {
      setError('Enter both valid latitude and longitude coordinates.'); return;
    }
    void change(editing ? `addresses/${editing}/` : 'addresses/', editing ? 'PATCH' : 'POST', { ...form, ...(showLocationFields ? { latitude, longitude } : {}) });
  };
  const useGps = async () => {
    setLocating(true); setError('');
    try { const point = await getDriverPosition(); setPinLat(point.latitude.toFixed(7)); setPinLng(point.longitude.toFixed(7)); }
    catch (e: any) { setError(e.message); }
    finally { setLocating(false); }
  };
  return <View style={styles.container}>
    <Text style={styles.title}>Saved addresses</Text>
    <Text>Your default address is used for new deliveries. You can choose another when proposing a contract. Changes do not alter addresses already agreed on existing orders.</Text>
    {!addresses.length && <Text>No saved addresses yet. Add your delivery or pickup address below.</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {addresses.map(address => <View key={address.id} style={styles.card}>
      <Text style={styles.title}>{address.label}{address.is_default ? ' (Default)' : ''}</Text>
      <Text>{address.formatted}</Text>
      <View style={styles.row}>
        <TouchableOpacity disabled={busy} onPress={() => { setEditing(address.id); setForm({ ...address }); setPinLat(address.latitude == null ? '' : String(address.latitude)); setPinLng(address.longitude == null ? '' : String(address.longitude)); }}><Text style={styles.link}>Edit</Text></TouchableOpacity>
        {!address.is_default && <TouchableOpacity disabled={busy} onPress={() => change(`addresses/${address.id}/`, 'PATCH', { is_default: true })}><Text style={styles.link}>Make default</Text></TouchableOpacity>}
        <TouchableOpacity disabled={busy} onPress={() => setRemoving(address.id)}><Text style={styles.error}>Remove</Text></TouchableOpacity>
      </View>
      {removing === address.id && <View style={styles.row}>
        <Text>Remove this saved address?</Text>
        <TouchableOpacity disabled={busy} onPress={() => change(`addresses/${address.id}/`, 'DELETE')}><Text style={styles.error}>Remove address</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setRemoving(null)}><Text>Keep</Text></TouchableOpacity>
      </View>}
    </View>)}
    {!form && <TouchableOpacity disabled={busy} onPress={() => { setEditing(null); setForm({ ...empty }); setPinLat(''); setPinLng(''); }}><Text style={styles.link}>+ Add address</Text></TouchableOpacity>}
    {form && <View style={styles.card}>
      <Text style={styles.title}>{editing ? 'Edit address' : 'Add address'}</Text>
      {fields.map(field => <View key={field}>
        <Text>{field === 'label' ? 'Label (Home, Work, Studio...)' : field.replace('_', ' ')}</Text>
        <TextInput accessibilityLabel={field.replace('_', ' ')} editable={!busy} style={styles.input} value={form[field]} maxLength={field === 'label' ? 50 : field === 'postal_code' ? 10 : field === 'street' ? 255 : 150} onChangeText={value => { setForm({ ...form, [field]: value }); if (field !== 'label') { setPinLat(''); setPinLng(''); } }} />
      </View>)}
      {showLocationFields && <>
      <Text style={styles.title}>Exact delivery location (optional)</Text>
      <Text>Use a precise location pin if your street cannot be found. Only use your current GPS when you are at this saved address.</Text>
      <TextInput accessibilityLabel="Address latitude" placeholder="Latitude" keyboardType="numbers-and-punctuation" value={pinLat} onChangeText={setPinLat} style={styles.input} editable={!busy && !locating} />
      <TextInput accessibilityLabel="Address longitude" placeholder="Longitude" keyboardType="numbers-and-punctuation" value={pinLng} onChangeText={setPinLng} style={styles.input} editable={!busy && !locating} />
      <TouchableOpacity accessibilityRole="button" disabled={busy || locating} onPress={() => void useGps()}><Text style={styles.link}>{locating ? 'Locating…' : 'Use my current GPS for this address'}</Text></TouchableOpacity>
      </>}
      <View style={styles.row}><Text>Default address</Text><Switch disabled={busy} value={form.is_default} onValueChange={value => setForm({ ...form, is_default: value })} /></View>
      <View style={styles.row}>
        <TouchableOpacity disabled={busy || locating} onPress={saveAddress}><Text style={styles.link}>Save address</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={() => setForm(null)}><Text>Cancel</Text></TouchableOpacity>
      </View>
    </View>}
    {busy && <ActivityIndicator />}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 12, marginVertical: 16 }, title: { fontWeight: '600', fontSize: 16 },
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 10, marginTop: 4, color: '#222' },
  link: { color: '#A75A2C', paddingVertical: 8 }, error: { color: '#B91C1C' },
});
