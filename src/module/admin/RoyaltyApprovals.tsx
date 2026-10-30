import { Text, TextInput } from '@/components/Typography';
import { markAdminQueueRead } from '@/services/adminNotifications';
import { AuthContext } from '@/context/AuthContext';
import { useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';

type Application = { id: number; username: string; name: string; age: number | null; status: string; permit_expires_on: string; business_permit_image: string; review_note: string; royalty_enabled: boolean };
export default function RoyaltyApprovals() {
  const { user, loading: authLoading } = useContext(AuthContext);
  const [items, setItems] = useState<Application[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  async function request(path = '', body?: object) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw Error('Please sign in again.');
    const response = await fetch(`${API_URL}/auth/royalty/reviews/${path}`, { method: body ? 'PATCH' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || data.detail || 'Unable to load royalty applications.');
    return data;
  }
  async function load() {
    setError(''); setLoading(true);
    try { const rows: Application[] = await request(); setItems(rows); void markAdminQueueRead('royalty', rows.map(row => row.id)); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { if (!authLoading && user) load(); else if (!authLoading) { setLoading(false); setError('Please sign in to review applications.'); } }, [authLoading, user?.uid]);
  async function review(item: Application, action: 'approve' | 'reject') {
    setBusy(item.id); setError('');
    try { const updated = await request(`${item.id}/`, { action, review_note: notes[item.id] || '' }); setItems(previous => previous.map(value => value.id === item.id ? updated : value)); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  return <View style={{ gap: 16 }}>
    <Text style={{ fontSize: 24, fontWeight: '700' }}>Royalty applications</Text>
    <Pressable onPress={load}><Text style={{ color: '#C15656' }}>Refresh applications</Text></Pressable>
    {loading && <ActivityIndicator />}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#b00020' }}>{error}</Text>}
    {!loading && !items.length && <Text>No royalty applications yet.</Text>}
    {[...items].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')).map(item => <View key={item.id} style={{ padding: 18, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, gap: 10 }}>
      <Text style={{ fontSize: 18, fontWeight: '700' }}>@{item.username}</Text>
      <Text>Name: {item.name}</Text><Text>Age: {item.age ?? 'Not provided'}</Text>
      <Text>Permit expires: {item.permit_expires_on}</Text>
      <Text>Status: {item.status}{item.status === 'approved' && !item.royalty_enabled ? ' (permit expired)' : ''}</Text>
      <Pressable onPress={() => setPreview(item.business_permit_image)}><Image source={{ uri: item.business_permit_image }} resizeMode="contain" accessibilityLabel={`Business permit for ${item.username}`} style={{ width: '100%', height: 220 }} /><Text style={{ color: '#C15656' }}>View full business permit</Text></Pressable>
      {item.status === 'pending' ? <>
        <TextInput accessibilityLabel={`Review note for ${item.username}`} placeholder="Review note (optional)" value={notes[item.id] || ''} maxLength={1000} onChangeText={value => setNotes(previous => ({ ...previous, [item.id]: value }))} multiline style={{ padding: 12, borderWidth: 1, borderColor: '#ddd' }} />
        <View style={{ flexDirection: 'row', gap: 24 }}><Pressable disabled={busy !== null} onPress={() => review(item, 'approve')}><Text style={{ color: '#257347', fontWeight: '700' }}>{busy === item.id ? 'Saving…' : 'Approve'}</Text></Pressable><Pressable disabled={busy !== null} onPress={() => review(item, 'reject')}><Text style={{ color: '#b00020', fontWeight: '700' }}>Reject</Text></Pressable></View>
      </> : !!item.review_note && <Text>Review note: {item.review_note}</Text>}
    </View>)}
    <Modal visible={!!preview} onRequestClose={() => setPreview(null)}><View style={{ flex: 1, padding: 24 }}><Pressable onPress={() => setPreview(null)}><Text style={{ padding: 12 }}>Close permit</Text></Pressable><ScrollView contentContainerStyle={{ flexGrow: 1 }}>{preview && <Image source={{ uri: preview }} resizeMode="contain" style={{ width: '100%', height: 750 }} />}</ScrollView></View></Modal>
  </View>;
}
