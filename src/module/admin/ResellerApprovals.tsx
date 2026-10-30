import { Text, TextInput } from '@/components/Typography';
import { markAdminQueueRead } from '@/services/adminNotifications';
import ResellerBadge from '@/components/ResellerBadge';
import { purchaseRequest } from '@/services/purchases';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import PrivateDocumentPreview from '@/components/PrivateDocumentPreview';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

type Application = { id: number; username: string; name: string; tin_number: string; status: string; reviewed_at?: string; verified: boolean; review_note: string; bir_certificate_name: string; sworn_declaration_name: string };

export default function ResellerApprovals() {
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<{ uri: string; mime: string; label: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const previewUrl = useRef<string | null>(null);
  const generation = useRef(0);
  const releasePreview = () => {
    if (previewUrl.current && Platform.OS === 'web') URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  };
  const closePreview = () => {
    generation.current += 1;
    releasePreview();
    setPreview(null); setPreviewOpen(false); setPreviewLoading(false);
  };
  useEffect(() => () => { generation.current += 1; releasePreview(); }, []);
  const load = async () => {
    setLoading(true); setError('');
    try { const rows: Application[] = await purchaseRequest('reseller/reviews/'); setItems(rows); void markAdminQueueRead('reseller', rows.map(row => row.id)); }
    catch (failure: any) { setError(failure.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const review = async (item: Application, action: string) => {
    if (busy) return;
    if (action !== 'approve' && !notes[item.id]?.trim()) { setError('Enter a reason before rejecting or revoking approval.'); return; }
    setBusy(true); setError('');
    try {
      const updated = await purchaseRequest('reseller/reviews/' + item.id + '/', 'PATCH', { action, review_note: notes[item.id] || '' });
      setItems(previous => previous.map(value => value.id === item.id ? { ...value, ...updated } : value));
    } catch (failure: any) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const document = async (item: Application, kind: 'bir_certificate' | 'sworn_declaration') => {
    releasePreview(); setPreview(null); setPreviewError(''); setPreviewOpen(true); setPreviewLoading(true);
    const current = ++generation.current;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw Error('Please sign in again.');
      const response = await fetch(API_URL + '/api/reseller/applications/' + item.id + '/documents/' + kind + '/', { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) throw Error('Document unavailable or access denied. Refresh the review page and try again.');
      const blob = await response.blob();
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw Error('This document format cannot be previewed.');
      if (current !== generation.current) return;
      const label = kind === 'bir_certificate' ? item.bir_certificate_name : item.sworn_declaration_name;
      if (Platform.OS === 'web') {
        const uri = URL.createObjectURL(blob);
        previewUrl.current = uri;
        setPreview({ uri, mime: blob.type, label });
      } else {
        throw Error('Please use the web review dashboard to view seller documents.');
      }
    } catch (failure: any) { if (current === generation.current) setPreviewError(failure.message); }
    finally { if (current === generation.current) setPreviewLoading(false); }
  };
  return <View style={{ gap: 16 }}>
    <Text style={s.title}>Reseller document reviews</Text>
    <Text>Approve seller documents only—not authorship, ownership or permission to resell a specific artwork. Applicants do not need an existing purchase.</Text>
    <TouchableOpacity disabled={loading || busy} onPress={load}><Text style={s.link}>Refresh applications</Text></TouchableOpacity>
    {loading && <ActivityIndicator color="#C15656" />}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B00020' }}>{error}</Text>}
    {!loading && !items.length && <Text>No reseller applications yet.</Text>}
    {[...items].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')).map(item => <View key={item.id} style={s.card}>
      <Text style={s.label}>{item.name} (@{item.username})</Text>
      <Text>Status: {item.status} · Application #{item.id}</Text>
      <ResellerBadge verified={item.verified} />
      <Text>TIN: {item.tin_number}</Text>
      <TouchableOpacity disabled={busy} onPress={() => document(item, 'bir_certificate')}><Text style={s.link}>View BIR certificate: {item.bir_certificate_name}</Text></TouchableOpacity>
      {!!item.sworn_declaration_name && <TouchableOpacity disabled={busy} onPress={() => document(item, 'sworn_declaration')}><Text style={s.link}>View sworn declaration: {item.sworn_declaration_name}</Text></TouchableOpacity>}
      {!!item.review_note && <Text>Last review: {item.review_note}</Text>}
      {['pending', 'approved'].includes(item.status) && <>
        <TextInput accessibilityLabel={'Review note for application ' + item.id} multiline maxLength={1000} placeholder="Review note; required for rejection or revocation" value={notes[item.id] || ''} onChangeText={value => setNotes(previous => ({ ...previous, [item.id]: value }))} style={s.input} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
          {item.status === 'pending' ? <>
            <TouchableOpacity disabled={busy} onPress={() => review(item, 'approve')}><Text style={s.link}>Approve documents</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={() => review(item, 'reject')}><Text style={{ color: '#B00020' }}>Reject</Text></TouchableOpacity>
          </> : <TouchableOpacity disabled={busy} onPress={() => review(item, 'revoke')}><Text style={{ color: '#B00020' }}>Revoke reseller approval</Text></TouchableOpacity>}
        </View>
      </>}
    </View>)}
    <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={closePreview}>
      <Pressable style={s.overlay} onPress={closePreview}>
        <Pressable style={s.previewCard} onPress={event => event.stopPropagation()}>
          <View style={s.previewHeader}>
            <Text style={[s.label, { flex: 1 }]} numberOfLines={2}>{preview?.label || 'Seller document'}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={closePreview}><Text style={s.link}>Close preview</Text></TouchableOpacity>
          </View>
          <Text style={{ color: '#76665F' }}>Private document · Visible only to authorized reviewers and the applicant</Text>
          <View style={{ flex: 1, minHeight: 300 }}>
            {previewLoading && <ActivityIndicator color="#C15656" style={{ marginTop: 30 }} />}
            {!!previewError && <Text accessibilityRole="alert" style={{ color: '#B00020' }}>{previewError}</Text>}
            {!!preview && <PrivateDocumentPreview {...preview} />}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  title: { color: '#C15656', fontSize: 24, fontWeight: '700' },
  label: { color: '#58433C', fontSize: 17, fontWeight: '700' },
  card: { padding: 18, gap: 12, borderWidth: 1, borderColor: '#E8DCD4', borderRadius: 12, backgroundColor: '#FFF' },
  link: { color: '#A74646', fontWeight: '700' },
  input: { padding: 12, borderWidth: 1, borderColor: '#D8C9C0', borderRadius: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(40,25,22,0.65)', padding: 20, alignItems: 'center', justifyContent: 'center' },
  previewCard: { backgroundColor: '#FFFDF6', width: '100%', maxWidth: 1200, height: '92%', borderRadius: 14, padding: 18, gap: 14 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
