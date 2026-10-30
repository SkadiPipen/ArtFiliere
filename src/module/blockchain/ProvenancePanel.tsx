import { Text, TextInput } from '@/components/Typography';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { purchaseRequest, downloadProtectedFile } from '@/services/purchases';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import RightsSummary from './RightsSummary';

export default function ProvenancePanel({ artworkId, recordId }: { artworkId?: number | string; recordId?: string }) {
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [links, setLinks] = useState('');
  const [creator, setCreator] = useState('');
  const [price, setPrice] = useState('');
  const [reviews, setReviews] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const path = `blockchain/${recordId ? `records/${recordId}` : `artworks/${artworkId}`}`;
  const load = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${API_URL}/api/${path}/provenance/`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || 'Provenance has not been registered yet.');
      setData(result); setError('');
      if (result.can_review) setReviews(await purchaseRequest(`${path}/attribution-reviews/`));
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => {
    if (!open) return;
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [open, artworkId, recordId]);
  const run = async (action: () => Promise<any>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const button = (label: string, action: () => void) => <TouchableOpacity disabled={busy} style={s.button} onPress={action}><Text style={s.buttonText}>{label}</Text></TouchableOpacity>;
  const checkFile = async () => {
    const selected = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (selected.canceled) return;
    const file = selected.assets[0];
    const form = new FormData();
    if (Platform.OS === 'web') form.append('file', file.file || await (await fetch(file.uri)).blob(), file.name);
    else form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
    const response = await fetch(`${API_URL}/api/${path}/integrity/`, { method: 'POST', body: form });
    const result = await response.json();
    if (!response.ok || !result.matches) throw new Error(result.detail || 'The selected file does not match the registered original. Previews and converted files have different hashes.');
  };
  if (!artworkId && !recordId) return null;
  return <>
    <TouchableOpacity accessibilityRole="button" onPress={() => setOpen(true)}><Text style={s.link}>View creator & ownership history</Text></TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={s.overlay}><View style={s.card}>
        <View style={s.heading}><Text style={s.title}>Creator & artwork history</Text><TouchableOpacity onPress={() => setOpen(false)}><Text style={s.link}>Close</Text></TouchableOpacity></View>
        <ScrollView contentContainerStyle={s.content}>
          {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          {!!message && <Text style={s.message}>{message}</Text>}
          {data && <>
            <Text style={s.label}>Created by @{data.created_by.username}</Text>
            <Text style={s.id}>Creator information recorded by the platform.</Text>
            <Text>Creation date: {data.creation_date ? new Date(data.creation_date).toLocaleDateString() : 'Not provided'}</Text>
            {data.first_listed_at && <Text>First listed on: {new Date(data.first_listed_at).toLocaleDateString()}</Text>}
            {data.claimed_creator.id !== data.created_by.id && <Text>Original attribution claim: @{data.claimed_creator.username}</Text>}
            {data.disputed && <Text style={s.error}>Attribution under review. New ownership transfers are on hold.</Text>}
            {!data.disputed && data.attribution_review_pending && <Text>An attribution review has been requested. A submitted claim alone does not change ownership or creator verification.</Text>}
            {data.can_admin && <TouchableOpacity onPress={() => setShowDetails(value => !value)}><Text style={s.link}>{showDetails ? 'Hide administrative proof details' : 'Administrative proof details'}</Text></TouchableOpacity>}
            {data.can_admin && showDetails && <>
            <Text>Registration: {data.registered_at ? 'Recorded on blockchain' : 'Awaiting confirmation'}</Text>
            <Text selectable style={s.id}>Artwork ID: {data.artwork_id}</Text>
            <Text style={s.disclaimer}>{data.disclaimer}</Text>
            <Text selectable style={s.id}>Original file SHA-256: {data.file_hash}</Text>
            <Text>Compare an original file with the registered file fingerprint. Edited, resized, or watermarked copies may not match.</Text>
            {button('Verify an original file', () => run(checkFile, 'File integrity matches the registered original. This does not prove authorship.'))}
            {data.can_download_original && button('Download registered original', () => run(() => downloadProtectedFile(`${path}/original/`, data.original_filename), 'Original file downloaded. Its SHA-256 matches the registration.'))}
            </>}
            {data.entitlements?.length > 0 && <>
              <Text style={s.label}>Ownership & license history</Text>
              <Text style={s.id}>A license holder has permission to use the artwork; this does not always mean copyright ownership. Private buyers use holder references.</Text>
              {data.entitlements.map((entry: any) => <RightsSummary key={entry.key} entry={entry} />)}
              <Text style={s.id}>Full signed agreements are private. Review the rights offered in the current listing before purchasing.</Text>
            </>}
            {!data.entitlements?.length && <Text>No purchases or rights transfers recorded yet.</Text>}
            {data.can_admin && showDetails && <>
            <Text style={s.label}>Administrative transaction history</Text>
            {data.history.map((entry: any) => <View key={entry.id} style={s.section}>
              <Text style={s.label}>{entry.kind === 'review' ? 'Attribution review' : entry.kind === 'transfer' ? 'Recorded entitlement transfer' : 'Artwork registration'} · {entry.status}</Text>
              {entry.kind === 'transfer' && <Text>{entry.previous_owner?.label} → {entry.new_owner?.label}</Text>}
              {entry.reason === 'approved_refund' && <Text>Ownership return after an approved refund</Text>}
              <Text>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : entry.status === 'failed' ? 'Blockchain confirmation failed. Contact support.' : entry.kind === 'registration' ? 'Registration is waiting for blockchain confirmation.' : 'Transfer is waiting for blockchain confirmation; the recorded holder has not changed.'}</Text>
              {showDetails && <>
              {entry.transaction_reference ? <Text selectable style={s.id}>Transaction: {entry.transaction_reference}</Text> : <Text>Transaction queued</Text>}
              {!!entry.block_number && <Text>Block {entry.block_number} · Chain {entry.chain_id}</Text>}
              </>}
              {!!entry.review_note && <Text>{entry.review_note}</Text>}
              {showDetails && entry.previous_attempts?.map((attempt: any) => <Text key={attempt.transaction_hash} selectable style={s.id}>Previous failed transaction: {attempt.transaction_hash}</Text>)}
              {data.can_admin && entry.retry_allowed && button('Review and retry failed transaction', () => run(() => purchaseRequest(`${path}/reconcile/`, 'POST', { event_id: entry.id }), 'Transaction queued again after checking its prior failure.'))}
            </View>)}
            </>}
            {data.can_resell && !recordId && <View style={s.section}>
              <Text style={s.label}>List an authorized resale</Text>
              <Text>The same artwork ID, creator credit, and license restrictions will be retained. The listing requires moderation.</Text>
              {data.seller_verified ? <>
                <TextInput value={price} onChangeText={setPrice} placeholder="Resale price (PHP)" keyboardType="decimal-pad" style={s.input} />
                {button('Submit resale listing', () => run(() => purchaseRequest(`${path}/resale/`, 'POST', { price }), 'Resale listing submitted for moderation.'))}
              </> : button('Complete reseller verification', () => { setOpen(false); router.push('/reseller-verification' as any); })}
            </View>}
            {auth.currentUser && <TouchableOpacity onPress={() => setShowReview(value => !value)}><Text style={s.link}>{showReview ? 'Hide correction request' : 'Report incorrect creator information'}</Text></TouchableOpacity>}
            {auth.currentUser && showReview && <View style={s.section}>
              <Text style={s.label}>Request attribution review</Text>
              <TextInput style={s.input} multiline value={reason} onChangeText={setReason} maxLength={4000} placeholder="Explain the claim or correction" />
              <TextInput style={s.input} value={creator} onChangeText={setCreator} placeholder="Correct creator account ID (optional)" keyboardType="number-pad" />
              <TextInput style={s.input} value={links} onChangeText={setLinks} placeholder="Evidence links, one per line" multiline />
              {button('Submit for review', () => run(() => purchaseRequest(`${path}/attribution-reviews/`, 'POST', { reason, proposed_creator_id: creator || null, evidence_links: links.split('\n').map(x => x.trim()).filter(Boolean) }), 'Attribution review submitted. Original history is preserved.'))}
            </View>}
            {data.can_review && <View style={s.section}>
              <Text style={s.label}>Moderator attribution reviews</Text>
              <TextInput style={s.input} value={note} onChangeText={setNote} placeholder="Public decision explanation" multiline />
              {reviews.filter(r => r.status === 'pending').map(review => <View key={review.id} style={s.section}>
                <Text>#{review.id}: {review.reason}</Text><Text selectable>{review.evidence_links.join('\n')}</Text>
                <Text>Proposed creator account: {review.proposed_creator_id || 'Existing attribution'}</Text>
                {['approve', 'reject'].map(decision => <View key={decision}>{button(decision === 'approve' ? 'Approve reviewed attribution' : 'Reject claim', () => run(() => purchaseRequest(`${path}/attribution-reviews/`, 'PATCH', { review_id: review.id, decision, note }), 'Decision queued for blockchain confirmation.'))}</View>)}
              </View>)}
            </View>}
          </>}
          {busy ? <ActivityIndicator /> : button('Refresh history', () => void load())}
        </ScrollView>
      </View></View>
    </Modal>
  </>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, padding: 18, backgroundColor: '#0008', justifyContent: 'center', alignItems: 'center' },
  card: { maxWidth: 760, width: '100%', maxHeight: '92%', backgroundColor: '#FFFCF8', borderRadius: 18, padding: 20 },
  content: { gap: 12, paddingBottom: 24 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 23, fontWeight: '800', color: '#382C26' }, label: { fontWeight: '700', fontSize: 16, color: '#382C26' },
  link: { color: '#B74F50', fontWeight: '700', paddingVertical: 10 }, id: { color: '#73665F', fontSize: 12 },
  section: { gap: 8, borderWidth: 1, borderColor: '#E9DDD4', borderRadius: 10, padding: 14 },
  disclaimer: { backgroundColor: '#F5EDE4', padding: 14, borderRadius: 10, lineHeight: 21 },
  button: { alignSelf: 'flex-start', backgroundColor: '#B74F50', padding: 12, borderRadius: 9 }, buttonText: { color: '#FFF', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#D9C9BF', borderRadius: 8, padding: 12, backgroundColor: '#FFF' },
  error: { color: '#AD3535' }, message: { color: '#317447' },
});
