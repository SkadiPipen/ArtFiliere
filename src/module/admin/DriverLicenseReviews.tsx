import { Text, TextInput } from '@/components/Typography';
import { openSettingsDocument } from '@/module/settings/settingsApi';
import { purchaseRequest } from '@/services/purchases';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, View } from 'react-native';
import { useAdminRefresh } from './AdminRefresh';
import { adminType, adminWorkspaceStyles } from './adminDesign';

const path = 'users/admin/driver-license-renewals/';
type Renewal = { id: number; driver: string; expires_on: string; document_name: string };

export default function DriverLicenseReviews({ onDecision }: { onDecision: () => Promise<void> }) {
  const [items, setItems] = useState<Renewal[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const result = await purchaseRequest(path);
      setItems(result.results);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load driver license renewals.');
    }
  };
  useEffect(() => { void load(); }, []);
  useAdminRefresh(load);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await work(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to complete the review.'); }
    finally { setBusy(false); }
  };
  const decide = (id: number, action: 'approve' | 'reject') => run(async () => {
    await purchaseRequest(`${path}${id}/`, 'PATCH', { action, note });
    setSelected(null);
    setNote('');
    await Promise.all([load(), onDecision()]);
  });

  return <View style={{ gap: 12 }}>
    <Text style={adminType.sectionTitle}>Driver licenses awaiting review</Text>
    {!!error && <Text accessibilityRole="alert" style={adminWorkspaceStyles.error}>{error}</Text>}
    {!items && !error && <ActivityIndicator />}
    {items?.length === 0 && <Text>No driver license renewals awaiting review.</Text>}
    {items?.map(item => <View key={item.id} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 14, gap: 10 }}>
      <Text style={adminType.cardTitle}>{item.driver}</Text>
      <Text>New expiry date: {item.expires_on}</Text>
      <Button title={selected === item.id ? 'Close review' : 'Review renewal'} color="#B65150" disabled={busy} onPress={() => {
        setSelected(selected === item.id ? null : item.id);
        setNote('');
      }} />
      {selected === item.id && <>
        <Button title="Open submitted license" color="#B65150" disabled={busy} onPress={() => void run(async () => {
          const file = await purchaseRequest(`${path}${item.id}/`);
          await openSettingsDocument(file.document, file.document_name);
        })} />
        <TextInput accessibilityLabel="Review note" placeholder="Review note (required for rejection)" value={note} onChangeText={setNote} maxLength={1000} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button title="Approve renewal" color="#B65150" disabled={busy} onPress={() => void decide(item.id, 'approve')} />
          <Button title="Reject renewal" color="#B65150" disabled={busy || !note.trim()} onPress={() => void decide(item.id, 'reject')} />
        </View>
      </>}
    </View>)}
  </View>;
}
