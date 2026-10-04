import { AuthContext } from '@/context/AuthContext';
import { auth } from '@/firebase/config';
import { purchaseRequest } from '@/services/purchases';
import * as DocumentPicker from 'expo-document-picker';
import { router, usePathname } from 'expo-router';
import { useContext, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Action, styles as s } from '@/module/moderation/ui';

type Restriction = { id: number; source: string; action: string; reason: string; review_note?: string; ends_at?: string };
type Appeal = { id: number; source: string; restriction_id: number; status: string; moderator_note: string; decision_note: string };
type Status = { restricted: boolean; restrictions: Restriction[]; appeals: Appeal[] };

export default function AccountRestrictionNotice({ standalone = false }: { standalone?: boolean }) {
  const { user, setReadOnly } = useContext(AuthContext);
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState<Restriction | null>(null);
  const [explanation, setExplanation] = useState('');
  const [links, setLinks] = useState('');
  const [files, setFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const wasRestricted = useRef(false);
  const refresh = async () => {
    const result: Status = await purchaseRequest('account/restrictions/');
    if (wasRestricted.current && !result.restricted) setRestored(true);
    wasRestricted.current = result.restricted;
    setStatus(result); setError('');
    setReadOnly(result.restricted && !result.restrictions.some(r => r.action === 'ban'));
  };
  useEffect(() => {
    let active = true;
    let running = false;
    setStatus(null); setSelected(null); setRestored(false); wasRestricted.current = false;
    if (!user) return;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        const result: Status = await purchaseRequest('account/restrictions/');
        if (active) {
          if (wasRestricted.current && !result.restricted) setRestored(true);
          wasRestricted.current = result.restricted;
          setStatus(result); setError('');
          setReadOnly(result.restricted && !result.restrictions.some(r => r.action === 'ban'));
        }
      } catch (e: any) { if (active && standalone) setError(e.message); }
      finally { running = false; }
    };
    poll();
    const timer = setInterval(poll, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') poll(); });
    const onFocus = () => { poll(); };
    if (Platform.OS === 'web') window.addEventListener('focus', onFocus);
    return () => { active = false; clearInterval(timer); subscription.remove(); if (Platform.OS === 'web') window.removeEventListener('focus', onFocus); };
  }, [user?.uid, standalone]);
  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      if (files.length + result.assets.length > 5 || result.assets.some(file => (file.size || 0) > 5 * 1024 * 1024)) throw Error('Use up to five files, 5 MB each.');
      setFiles(old => [...old, ...result.assets]);
    } catch (e: any) { setError(e.message); }
  };
  const submit = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('payload', JSON.stringify({ source: selected.source, restriction_id: selected.id, explanation, links: links.split('\n').map(link => link.trim()).filter(Boolean) }));
      for (const file of files) {
        if (Platform.OS === 'web') body.append('files', file.file || await (await fetch(file.uri)).blob(), file.name);
        else body.append('files', { uri: file.uri, name: file.name, type: file.mimeType } as any);
      }
      await purchaseRequest('account/appeals/', 'POST', body);
      setSelected(null); setExplanation(''); setLinks(''); setFiles([]); await refresh();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const content = <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.content, { maxWidth: 650 }]}>
    <Text style={s.title}>{status?.restricted ? status.restrictions.some(r => r.action === 'ban') ? 'Your account is banned' : 'Your account is suspended' : restored ? 'Your account access is restored' : 'Account appeals'}</Text>
    {!user && <Action label="Sign in to view your restriction" onPress={() => router.replace('/login')} />}
    {user && !status && !error && <Text>Checking account status…</Text>}
    {status?.restricted && <Text style={s.text}>{status.restrictions.some(r => r.action === 'ban') ? 'Marketplace access is unavailable. You can appeal or open existing commissions. Banned artists need Customer Service approval for each commission.' : 'You have view-only access, with limited work allowed on commissions accepted before suspension. Use the commission workspace to message that buyer and submit artwork. Purchases, bids, new commissions and unrelated messages remain disabled.'}</Text>}
    {status?.restrictions.map(r => {
      const pending = status.appeals.some(a => a.source === r.source && a.restriction_id === r.id && ['pending', 'recommended'].includes(a.status));
      return <View key={`${r.source}-${r.id}`} style={s.card}><Text style={s.heading}>{r.action === 'ban' ? 'Ban' : 'Suspension'}</Text><Text style={s.text}>Reason: {r.reason}</Text>{!!r.review_note && <Text style={s.text}>Admin note: {r.review_note}</Text>}<Text>{r.ends_at ? `Ends: ${new Date(r.ends_at).toLocaleString()}` : 'No expiry date'}</Text>
        {standalone ? <Action label={pending ? 'Appeal awaiting review' : 'Appeal decision'} disabled={busy || pending} onPress={() => { setSelected(r); setExplanation(''); setLinks(''); setFiles([]); }} /> : <Action label="Appeal decision / view status" onPress={() => router.push('/account-appeal' as any)} />}
      </View>;
    })}
    {standalone && selected && <View style={s.card}><Text style={s.heading}>Appeal this {selected.action}</Text><Text style={s.text}>Your appeal goes directly to admin. Your restriction stays active until it expires or admin lifts it.</Text><TextInput accessibilityLabel="Appeal explanation" placeholder="Explain why this decision should be reconsidered" multiline maxLength={4000} editable={!busy} style={[s.input, { minHeight: 120 }]} value={explanation} onChangeText={setExplanation} />
      <TextInput accessibilityLabel="Appeal evidence links" placeholder="Evidence links (one HTTP/HTTPS URL per line)" multiline editable={!busy} style={s.input} value={links} onChangeText={setLinks} />
      <Action label="Attach evidence files" disabled={busy} onPress={pickFiles} /><Text style={s.text}>Up to five JPG, PNG, WebP or PDF files, 5 MB each.</Text>
      {files.map((file, i) => <View key={i} style={s.row}><Text style={{ flex: 1 }}>{file.name}</Text><Action label="Remove" disabled={busy} onPress={() => setFiles(files.filter((_, index) => index !== i))} /></View>)}
      <Action label={busy ? 'Submitting…' : 'Submit appeal'} disabled={busy || !explanation.trim()} onPress={submit} /><Action label="Cancel" disabled={busy} onPress={() => setSelected(null)} />
    </View>}
    {standalone && status?.appeals.map(a => <View key={a.id} style={s.card}><Text style={s.heading}>Appeal #{a.id} · {a.status}</Text>{!!a.moderator_note && <Text>Customer Service: {a.moderator_note}</Text>}{!!a.decision_note && <Text>Admin decision: {a.decision_note}</Text>}</View>)}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {user && <Action label="Existing commission workspace" onPress={() => router.push('/commission-workspace' as any)} />}
    {user && <Action label="Refresh status" disabled={busy} onPress={() => { refresh().catch(e => setError(e.message)); }} />}
    {status && !status.restrictions.some(r => r.action === 'ban') && <Action label="Continue to home" onPress={() => { setRestored(false); router.replace('/(home)'); }} />}
    {status?.restricted && !status.restrictions.some(r => r.action === 'ban') && <Action label="Contact Customer Service" onPress={() => router.push('/support')} />}
    {user && <Action label="Log out" disabled={busy} onPress={() => { auth.signOut().then(() => router.replace('/login')).catch(e => setError(e.message)); }} />}
  </ScrollView>;
  if (standalone) return <View style={s.page}>{content}</View>;
  const banned = status?.restrictions.some(r => r.action === 'ban');
  if (user && status?.restricted && !banned) return <View accessibilityRole="alert" style={{ backgroundColor: '#FFF0D6', borderTopWidth: 1, borderTopColor: '#E5BF75', paddingHorizontal: 18, paddingVertical: 12, gap: 8 }}>
    <Text style={{ color: '#735012', fontWeight: '700' }}>Suspended · View-only access{status.restrictions[0]?.ends_at ? ` · Ends ${new Date(status.restrictions[0].ends_at!).toLocaleString()}` : ''}</Text>
    <Text style={{ color: '#735012' }}>{status.restrictions.map(r => r.reason).join(' · ')}</Text>
    <View style={s.row}><Action label="Details / appeal" onPress={() => router.push('/account-appeal' as any)} /><Action label="Existing commissions" onPress={() => router.push('/commission-workspace' as any)} /><Action label="Customer Service" onPress={() => router.push('/support')} /></View>
  </View>;
  return <Modal visible={!!user && (banned || restored) && !['/account-appeal', '/commission-workspace'].includes(pathname)} transparent animationType="fade" onRequestClose={() => {}}>
    <View style={{ flex: 1, backgroundColor: 'rgba(35,25,20,.55)', justifyContent: 'center', padding: 18 }}><View style={{ width: '100%', maxWidth: 680, maxHeight: '90%', alignSelf: 'center', backgroundColor: '#FFFDF8', borderRadius: 16 }}>{content}</View></View>
  </Modal>;
}
