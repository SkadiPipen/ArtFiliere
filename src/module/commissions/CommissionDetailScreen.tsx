import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import SigningModal from '@/module/chat-negotiations/SigningModal';
import AvailabilityCalendar from './AvailabilityCalendar';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export async function commissionApi(path: string, body?: any) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in.');
  const multipart = body instanceof FormData;
  const response = await fetch(`${API_URL}/api/commissions/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.detail || JSON.stringify(data));
  return data;
}

const card = { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, gap: 12, borderWidth: 1, borderColor: '#E8DCD4' } as const;
const input = { borderWidth: 1, borderColor: '#DDCEC7', borderRadius: 8, padding: 12, color: '#40322E' } as const;
function Button({ text, onPress, disabled }: { text: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={{ padding: 12, borderRadius: 8, backgroundColor: disabled ? '#DDD' : '#C15656', alignSelf: 'flex-start' }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{text}</Text></TouchableOpacity>;
}

export default function CommissionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [counter, setCounter] = useState<any>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [tracking, setTracking] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState('');
  const [payout, setPayout] = useState<Record<string, string>>({ routing_type: 'WALLET', routing_value: 'PH_GCASH' });
  const [resalePrice, setResalePrice] = useState('');
  const load = useCallback(async () => {
    try { setData(await commissionApi(`flow/${id}/`)); }
    catch (e: any) { setError(e.message); }
  }, [id]);
  useEffect(() => { void load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [load]);
  const action = async (action: string, extra: any = {}) => {
    setBusy(true); setError('');
    try {
      const result = await commissionApi(`flow/${id}/`, { action, version: data.proposal?.version, ...extra });
      if (action === 'fund') {
        if (!result.checkout_url) throw new Error('Checkout could not be confirmed. Retry to reconcile the same payment reference.');
        await Linking.openURL(result.checkout_url);
      } else setData(result);
      setCounter(null);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const upload = async (milestone: any) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      const body = new FormData(); body.append('action', 'submit'); body.append('milestone_id', String(milestone.id));
      if (Platform.OS === 'web') body.append('file', await (await fetch(file.uri)).blob(), file.name);
      else body.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
      setBusy(true); setError(''); setData(await commissionApi(`flow/${id}/`, body));
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const file = async (submission: any, inspect: boolean) => {
    setError('');
    try {
      const url = `${API_URL}/api/commissions/flow/${id}/files/${submission.id}/${inspect ? '?preview=1' : ''}`;
      const token = await auth.currentUser?.getIdToken();
      if (Platform.OS === 'web') {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error((await response.json()).detail || 'File unavailable.');
        const blob = await response.blob();
        if (inspect && submission.type.startsWith('image/')) {
          const reader = new FileReader(); reader.onload = () => setPreview(String(reader.result)); reader.readAsDataURL(blob);
        } else {
          const objectURL = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = objectURL; link.download = submission.name; link.click(); setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
        }
      } else {
        const fs = await import('expo-file-system/legacy');
        const sharing = await import('expo-sharing');
        const path = `${fs.cacheDirectory}commission-${id}-${submission.id}${inspect ? '-preview' : ''}.${submission.type.split('/')[1]}`;
        const result = await fs.downloadAsync(url, path, { headers: { Authorization: `Bearer ${token}` } });
        if (result.status !== 200) throw new Error('File unavailable.');
        if (inspect && submission.type.startsWith('image/')) setPreview(path);
        else await sharing.shareAsync(path, { mimeType: submission.type });
      }
    } catch (e: any) { setError(e.message); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF6EF' }}>
    <ScrollView contentContainerStyle={{ padding: 24, maxWidth: 1000, width: '100%', alignSelf: 'center', gap: 18 }}>
      <Button text="Back to commissions" onPress={() => router.replace('/commissions')} />
      {!!error && <Text accessibilityRole="alert" style={{ color: '#A13030' }}>{error}</Text>}
      {!data ? <ActivityIndicator color="#C15656" /> : <>
        <View style={card}><Text style={{ fontSize: 24, fontWeight: '800' }}>{data.title}</Text><Text>{data.status} · {data.artist} / {data.buyer}</Text><Text>{data.description}</Text>
          <Text>One consolidated buyer revision request/comment per stage. No automatic approval.</Text>
          {data.reference_images?.map((uri: string, index: number) => <Image key={index} source={{ uri }} style={{ width: '100%', height: 220 }} resizeMode="contain" />)}
          {['STAGE_1', 'STAGE_2', 'STAGE_3'].includes(data.status) && <Button text="Open commission chat" onPress={() => router.push('/commission-workspace')} />}
          {data.disputed && <Text style={{ color: '#A13030' }}>Unreleased funds frozen for Customer Service review.</Text>}
        </View>
        {data.proposal && <View style={card}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>Proposal version {data.proposal.version} · {data.proposal.status}</Text>
          {Object.entries(data.proposal.terms).map(([key, value]) => <Text key={key}>{key.replace(/_/g, ' ')}: {Array.isArray(value) ? value.join(' / ') : String(value)}</Text>)}
          {data.status === 'NEGOTIATING' && <>
            {!data.proposal.is_proposer && <View style={{ flexDirection: 'row', gap: 12 }}><Button text="Accept terms" disabled={busy} onPress={() => action('accept')} /><Button text="Decline" disabled={busy} onPress={() => action('decline')} /></View>}
            <Button text="Negotiate / counter-offer" onPress={() => setCounter({ ...data.proposal.terms, milestones: data.proposal.terms.milestones.join(',') })} />
            {counter && <View style={{ gap: 10 }}>
              <Text>Total PHP</Text><TextInput style={input} value={counter.price} onChangeText={price => setCounter({ ...counter, price })} />
              {data.art_type.toLowerCase() === 'physical' && <>
                <Text>Shipping fee included in total PHP</Text><TextInput style={input} value={counter.delivery_fee || '0'} onChangeText={delivery_fee => setCounter({ ...counter, delivery_fee })} />
                <TextInput style={input} placeholder="Delivery destination" value={counter.delivery_address || ''} onChangeText={delivery_address => setCounter({ ...counter, delivery_address })} />
                <TextInput style={input} placeholder="Pickup address" value={counter.pickup_address || ''} onChangeText={pickup_address => setCounter({ ...counter, pickup_address })} />
              </>}
              <Text>Milestone percentages, comma separated</Text><TextInput style={input} value={counter.milestones} onChangeText={milestones => setCounter({ ...counter, milestones })} />
              <AvailabilityCalendar artistId={data.artist_id} selectedDate={counter.deadline.slice(0, 10)} onSelect={date => setCounter({ ...counter, deadline: `${date}T17:00:00+08:00` })} />
              <Text>Counter-offer notes</Text><TextInput multiline style={input} value={counter.note} onChangeText={note => setCounter({ ...counter, note })} />
              <Button text="Submit counter-offer" disabled={busy} onPress={() => action('counter', { terms: { ...counter, milestones: counter.milestones.split(',').map(Number) } })} />
            </View>}
          </>}
        </View>}
        {!!data.agreement_id && <View style={card}><Button text={data.fully_signed ? 'View signed agreement / PDF' : 'Review and sign agreement'} onPress={() => setSigning(true)} />
          {data.funding_due_at && <Text>Funding due: {new Date(data.funding_due_at).toLocaleString()}</Text>}
          {!data.is_artist && data.status === 'AWAITING_FUNDS' && <Button text="Fund full commission via Xendit" disabled={busy} onPress={() => action('fund')} />}
          <Text>Verified funding: {data.funded_at ? new Date(data.funded_at).toLocaleString() : 'Awaiting payment confirmation'}</Text><Text>Holding balance PHP {data.held_amount}</Text>
          {!data.is_artist && <Button text="Refresh verified payment status" disabled={busy} onPress={() => action('refresh_payment')} />}
        </View>}
        {data.milestones.map((m: any) => <View key={m.id} style={card}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>Stage {m.number}: {m.label} · {m.percentage}%</Text><Text>Artist payout PHP {m.amount} · {m.status}</Text><Text>Payout: {m.payout_status} {m.payout_error}</Text>
          {!!m.review_due_at && <Text>Review due: {new Date(m.review_due_at).toLocaleString()}</Text>}
          {m.submissions.map((s: any) => <View key={s.id} style={{ gap: 8 }}>
            <Text>{s.name} · uploaded {new Date(s.uploaded_at).toLocaleString()}</Text><Text selectable>SHA-256: {s.sha256}</Text><Text>{s.caption}</Text>
            {!!s.cid && <Text selectable>Encrypted IPFS CID: {s.cid}</Text>}
            {s.proof && <Text selectable>Blockchain proof: {s.proof.status} {s.proof.transaction_hash}</Text>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button text="Inspect preview" onPress={() => file(s, true)} />{s.download_allowed && <Button text="Download file" onPress={() => file(s, false)} />}</View>
          </View>)}
          {!!m.revision_comment && <Text>Buyer revision comment (1/1 used): {m.revision_comment}</Text>}
          {data.is_artist && data.status === `STAGE_${m.number}` && ['PENDING', 'REVISION_REQUESTED'].includes(m.status) && <Button text={m.number === 3 && data.art_type.toLowerCase() === 'digital' ? 'Upload original final image (up to 30 MB)' : 'Upload milestone / revised submission'} disabled={busy} onPress={() => upload(m)} />}
          {!data.is_artist && m.status === 'SUBMITTED' && !data.disputed && <>
            {!m.revision_used && <><TextInput style={input} multiline placeholder="One consolidated revision comment for this stage" value={comments[m.id] || ''} onChangeText={text => setComments({ ...comments, [m.id]: text })} /><Button text="Request revision (1 per stage)" disabled={busy} onPress={() => action('revise', { milestone_id: m.id, comment: comments[m.id] })} /></>}
            <Button text="Approve milestone" disabled={busy} onPress={() => action('approve', { milestone_id: m.id })} />
          </>}
          {m.number === 3 && data.art_type.toLowerCase() === 'physical' && m.status === 'SUBMITTED' && <>
            {data.is_artist ? <><TextInput style={input} placeholder="Courier and tracking reference" value={tracking} onChangeText={setTracking} /><Button text="Record shipment" onPress={() => action('ship', { milestone_id: m.id, tracking })} /></> : <><Text>Tracking: {data.courier_tracking || 'Not shipped'}</Text>{data.courier_tracking && !data.delivered_at && <Button text="Confirm receipt and inspect" onPress={() => action('receive', { milestone_id: m.id })} />}</>}
          </>}
          {data.is_artist && m.approved_at && ['CONFIG_REQUIRED', 'RETRY_PENDING', 'NOT_REQUESTED'].includes(m.payout_status) && <Button text="Retry / reconcile payout" onPress={() => action('payout', { milestone_id: m.id })} />}
        </View>)}
        {!!preview && <View style={card}><Image source={{ uri: preview }} style={{ width: '100%', height: 500 }} resizeMode="contain" /><Button text="Close preview" onPress={() => setPreview('')} /></View>}
        {data.asset && <View style={card}><Text>Completed asset · Owner: {data.asset.owner}</Text><Text selectable>Provenance record: {data.asset.record_hash}</Text>
          <Text selectable>Blockchain: {data.asset.proof_status} {data.asset.transaction_hash}</Text>
          {!data.is_artist && data.asset.license.allow_resale && <><TextInput style={input} value={resalePrice} onChangeText={setResalePrice} placeholder="Resale listing price PHP" /><Button text="List deliverable for resale" onPress={async () => { try { await commissionApi(`assets/${data.asset.id}/resale/`, { price: resalePrice }); setError('Resale listing submitted for creative moderation.'); } catch (e: any) { setError(e.message); } }} /></>}
        </View>}
        {data.is_artist && <View style={card}><Text style={{ fontWeight: '700' }}>Bank / e-wallet payout recipient</Text>
          {['given_name', 'surname', 'account_holder_name', 'account_number', 'routing_type', 'routing_value', 'street', 'city', 'province', 'postal_code'].map(key => <TextInput key={key} style={input} placeholder={key.replace(/_/g, ' ')} value={payout[key] || ''} onChangeText={text => setPayout({ ...payout, [key]: text })} />)}
          <Text>Use SWIFT with your bank’s supported SWIFT code, or WALLET with its Xendit routing code (for example PH_GCASH). Recipient address is required.</Text>
          <Button text="Save payout recipient" onPress={async () => { try { await commissionApi('payout-profile/', payout); setError('Payout recipient saved.'); } catch (e: any) { setError(e.message); } }} />
        </View>}
        {data.status !== 'CANCELLED' && <View style={card}><TextInput style={input} multiline placeholder="Explain dispute or cancellation request" value={reason} onChangeText={setReason} />
          <View style={{ flexDirection: 'row', gap: 12 }}><Button text="File dispute" disabled={busy} onPress={() => action('dispute', { reason })} /><Button text="Request cancellation" disabled={busy} onPress={() => action('cancel_request', { reason })} /></View>
        </View>}
      </>}
    </ScrollView>
    {signing && data?.agreement_id && <SigningModal id={data.agreement_id} onClose={() => { setSigning(false); void load(); }} onSigned={load} />}
  </SafeAreaView>;
}
