import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { purchaseRequest } from '@/services/purchases';
import { Action, styles as s } from '@/module/moderation/ui';

type Commission = { id: number; title: string; status: string; artist: string; buyer: string; is_artist: boolean; can_work: boolean; eligible: boolean; banned: boolean; decision_note: string; restriction_reasons: string[]; messages: { id: number; sender: string; body: string }[]; photos: { id: number; url: string; caption: string; progress: number }[] };
export default function CommissionWorkspace({ review = false }: { review?: boolean }) {
  const [rows, setRows] = useState<Commission[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [image, setImage] = useState('');
  const [percent, setPercent] = useState('');
  const [caption, setCaption] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const path = review ? 'commissions/access-reviews/' : 'commissions/workspace/';
  const load = async () => setRows(await purchaseRequest(path));
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  useEffect(() => { run(load); }, [review]);
  const send = async (action: string) => {
    await purchaseRequest(`commissions/workspace/${selected}/`, 'POST', { action, body: message, image_url: image, progress_percentage: percent, caption });
    setMessage(''); setImage(''); setCaption(''); setPercent(''); await load();
  };
  const content = <><Text style={review ? s.heading : s.title}>{review ? 'Banned artist commission access' : 'Commission workspace'}</Text>
    <Text style={s.text}>{review ? 'Approve or revoke work for each existing commission. Review the restriction and buyer safety before approving. Marketplace access remains blocked.' : 'Use this workspace to message the buyer or artist about this commission and submit progress or final artwork. Restricted artists cannot accept new commissions. Banned artists need Customer Service approval.'}</Text>
    <Action label="Refresh commissions" disabled={busy} onPress={() => run(load)} />
    {!review && <Action label="Account details / appeal" onPress={() => router.push('/account-appeal' as any)} />}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!rows.length && <Text>{busy ? 'Loading…' : 'No commissions available.'}</Text>}
    {rows.map(c => <View key={c.id} style={s.card}><Text style={s.heading}>#{c.id} · {c.title}</Text><Text>{c.artist} → {c.buyer} · {c.status}</Text>
      <Text>{c.can_work ? 'Commission work enabled' : c.banned && c.eligible ? 'Customer Service approval required' : 'View only'}</Text>
      {!!c.decision_note && <Text>Customer Service: {c.decision_note}</Text>}
      {review ? <><Text>{c.restriction_reasons.join(' · ') || 'Administrator account restriction'}</Text><TextInput accessibilityLabel={`Commission ${c.id} decision reason`} style={s.input} placeholder="Reason for approval or revocation" multiline value={notes[c.id] || ''} onChangeText={text => setNotes(old => ({ ...old, [c.id]: text }))} />
        <View style={s.row}>{[true, false].map(approved => <Action key={String(approved)} label={approved ? 'Approve limited work' : 'Deny / revoke access'} disabled={busy || !c.eligible || !notes[c.id]?.trim()} onPress={() => run(async () => { await purchaseRequest(`${path}${c.id}/`, 'POST', { approved, note: notes[c.id] }); await load(); })} />)}</View></>
        : <Action label={selected === c.id ? 'Close workspace' : 'Open workspace'} onPress={() => { setSelected(selected === c.id ? null : c.id); setMessage(''); setImage(''); setPercent(''); setCaption(''); }} />}
      {!review && selected === c.id && <><Text style={s.heading}>Commission messages</Text>{c.messages.map(m => <View key={m.id}><Text style={{ fontWeight: '700' }}>{m.sender}</Text><Text style={s.text}>{m.body}</Text></View>)}
        {c.can_work && <><TextInput accessibilityLabel="Commission message" style={s.input} multiline maxLength={4000} value={message} onChangeText={setMessage} placeholder="Message about this commission" /><Action label="Send message" disabled={busy || !message.trim()} onPress={() => run(() => send('message'))} /></>}
        <Text style={s.heading}>Progress & deliverables</Text>{c.photos.map(p => <View key={p.id}><Image source={{ uri: p.url }} style={s.photo} resizeMode="contain" /><Text>{p.progress}% · {p.caption}</Text></View>)}
        {c.can_work && c.is_artist && <><Action label="Attach progress / final artwork" disabled={busy} onPress={() => run(async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.85 }); if (!result.canceled && result.assets[0].base64) setImage(`data:${result.assets[0].mimeType || 'image/jpeg'};base64,${result.assets[0].base64}`); })} />
          {!!image && <Image source={{ uri: image }} style={s.photo} resizeMode="contain" />}
          <TextInput accessibilityLabel="Progress percentage" style={s.input} placeholder="Progress 1–100 (100 for final artwork)" keyboardType="numeric" value={percent} onChangeText={setPercent} />
          <TextInput accessibilityLabel="Progress caption" style={s.input} placeholder="Describe this update or delivery" maxLength={255} value={caption} onChangeText={setCaption} />
          <Action label="Submit artwork update" disabled={busy || !image || !percent} onPress={() => run(() => send('progress'))} /></>}
      </>}
    </View>)}
  </>;
  return review ? <View style={s.card}>{content}</View> : <View style={s.page}><ScrollView contentContainerStyle={s.content}>{content}</ScrollView></View>;
}
