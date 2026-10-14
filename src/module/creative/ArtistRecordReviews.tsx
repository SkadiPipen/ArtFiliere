import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { auth } from '@/firebase/config';
import { settingsRequest, openSettingsDocument } from '@/module/settings/settingsApi';

type RecordUpdate = { id: number; artist_name: string; tin_number: string; expires_on: string | null; status: string; review_note: string; submitted_at: string; evidence_image?: string; current_tin?: string; current_expiry?: string | null; current_evidence?: string };
const button = { padding: 12, minHeight: 44, borderWidth: 1, borderColor: '#E5C9BD', borderRadius: 9, backgroundColor: '#FFF5F1' };
export default function ArtistRecordReviews() {
  const [items, setItems] = useState<RecordUpdate[]>([]), [selected, setSelected] = useState<RecordUpdate | null>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const load = useCallback(async () => { try { setItems(await settingsRequest('bir/reviews/')); setError(''); } catch (e: any) { setError(e.message); } }, []);
  useEffect(() => auth.onAuthStateChanged(user => { if (user) load(); else { setItems([]); setSelected(null); } }), [load]);
  async function detail(id: number) { setBusy(true); setError(''); try { setSelected(await settingsRequest(`bir/reviews/${id}/`)); setNote(''); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }
  async function review(action: string) {
    if (!selected) return;
    setBusy(true); setError('');
    try { await settingsRequest(`bir/reviews/${selected.id}/`, 'PATCH', { action, note }); setSelected(null); await load(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <View style={{ backgroundColor: '#FFF', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#E8DDD5', gap: 12, marginBottom: 16 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={button}><Text style={{ color: '#A34A40', fontWeight: '700' }}>{open ? 'Hide' : 'Review'} BIR registration updates ({items.filter(item => item.status === 'pending').length} pending)</Text></Pressable>
    {!!error && !selected && <Text accessibilityRole="alert" style={{ color: '#B00020' }}>{error}</Text>}
    {busy && <ActivityIndicator color="#C15656" />}
    {open && <><Pressable onPress={load} style={button}><Text>Refresh document updates</Text></Pressable>{!items.length && <Text>No BIR registration updates.</Text>}{items.map(item => <Pressable disabled={busy} key={item.id} onPress={() => detail(item.id)} style={button}><Text style={{ fontWeight: '600' }}>{item.artist_name} · {item.status}</Text><Text>TIN: {item.tin_number}</Text><Text>Submitted: {new Date(item.submitted_at).toLocaleString()}</Text></Pressable>)}</>}
    <Modal visible={!!selected} onRequestClose={() => { if (!busy) setSelected(null); }} animationType="slide">
      {selected && <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 50, paddingBottom: 80, gap: 16, maxWidth: 850, width: '100%', alignSelf: 'center' }}>
        <Pressable disabled={busy} onPress={() => setSelected(null)} style={button}><Text>Close review</Text></Pressable>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>BIR registration update · {selected.artist_name}</Text>
        {!!error && <Text accessibilityRole="alert" style={{ color: '#B00020' }}>{error}</Text>}
        <Text>Current TIN: {selected.current_tin || 'Not recorded'}</Text><Text>Current expiry: {selected.current_expiry || 'No expiration recorded'}</Text>
        {selected.current_evidence?.startsWith('data:image/') && <Image source={{ uri: selected.current_evidence }} accessibilityLabel="Current BIR registration" resizeMode="contain" style={{ width: '100%', height: 240 }} />}
        {selected.current_evidence?.startsWith('data:application/pdf;') && <Pressable onPress={async () => { try { await openSettingsDocument(selected.current_evidence!); } catch (e: any) { setError(e.message); } }} style={button}><Text>View current BIR document (PDF)</Text></Pressable>}
        <Text style={{ fontWeight: '700' }}>Proposed TIN: {selected.tin_number}</Text><Text>Proposed expiry: {selected.expires_on || 'No expiration shown'}</Text>
        <Image source={{ uri: selected.evidence_image }} accessibilityLabel="Submitted BIR evidence" resizeMode="contain" style={{ width: '100%', height: 400 }} />
        {selected.status === 'pending' ? <>
          <TextInput accessibilityLabel="BIR update review note" multiline maxLength={1000} value={note} onChangeText={setNote} placeholder="Review note (required for rejection)" style={{ padding: 12, minHeight: 80, borderWidth: 1, borderColor: '#DDD', borderRadius: 8 }} />
          <Pressable disabled={busy} onPress={() => review('approve')} style={button}><Text style={{ color: '#286647', fontWeight: '700' }}>Approve registration update</Text></Pressable>
          <Pressable disabled={busy} onPress={() => review('reject')} style={button}><Text style={{ color: '#B04444', fontWeight: '700' }}>Reject registration update</Text></Pressable>
        </> : <Text>Review: {selected.status}{selected.review_note ? ` · ${selected.review_note}` : ''}</Text>}
      </ScrollView>}
    </Modal>
  </View>;
}
