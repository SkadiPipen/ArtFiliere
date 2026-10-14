import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';

const box = { padding: 16, borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 12, gap: 12, backgroundColor: '#fff' };
const input = { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8 };
const link = { color: '#A33F45', fontWeight: '700' as const, paddingVertical: 8 };
type Evidence = { name: string; data: string };
type Period = { id: number; agreement_id: number; title: string; is_buyer: boolean; starts_on: string; ends_on: string; due_on: string; status: string; overdue: boolean; can_submit: boolean; basis: string; amount: string | null; metrics: Record<string, string>; review_note: string; collection_error: string; evidence: { name: string; path: string }[]; history: { action: string; at: string; amount?: string; note?: string }[] };
type License = { id: number; title: string; is_buyer: boolean; configured: boolean; mandate_status: string };
async function request(path = '', method = 'GET', body?: object) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Error('Please sign in again.');
  return readApiResponse(await fetch(`${API_URL}/api/users/royalties/${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
}

async function viewEvidence(path: string) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Error('Please sign in again.');
  const url = `${API_URL}/api/users/${path}`;
  const headers = { Authorization: `Bearer ${token}` };
  if (Platform.OS === 'web') {
    const result = await fetch(url, { headers });
    if (!result.ok) { await readApiResponse(result); return; }
    const blob = URL.createObjectURL(await result.blob());
    const a = document.createElement('a'); a.href = blob; a.download = 'royalty-evidence'; a.click();
    setTimeout(() => URL.revokeObjectURL(blob), 60000);
  } else {
    const fs = await import('expo-file-system/legacy');
    const sharing = await import('expo-sharing');
    const response = await fetch(url, { headers });
    if (!response.ok) { await readApiResponse(response); return; }
    const mime = response.headers.get('content-type')?.split(';')[0] || 'application/pdf';
    const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const file = `${fs.cacheDirectory}royalty-evidence.${ext}`;
    try {
      const result = await fs.downloadAsync(url, file, { headers });
      if (result.status !== 200) throw Error('Unable to download evidence.');
      if (!await sharing.isAvailableAsync()) throw Error('File sharing is unavailable.');
      await sharing.shareAsync(file, { mimeType: mime });
    } finally { await fs.deleteAsync(file, { idempotent: true }); }
  }
}

function ReportCard({ report, reload }: { report: Period; reload: () => Promise<void> }) {
  const [metrics, setMetrics] = useState<Record<string, string>>(report.metrics);
  const [files, setFiles] = useState<Evidence[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fields = report.basis === 'units' ? ['units'] : report.basis === 'gross_sales' ? ['gross_sales'] : report.basis === 'net_sales' ? ['gross_sales', 'deductions'] : ['gross_sales', 'deductions', 'costs'];
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await work(); await reload(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const attach = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (files.length >= 3 || (asset.size ?? 0) > 5 * 1024 * 1024) throw Error('Attach up to 3 files, no larger than 5 MB total.');
    const mime = asset.mimeType || 'application/pdf';
    let data: string;
    if (Platform.OS === 'web') {
      const blob = await (await fetch(asset.uri)).blob();
      data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('Unable to read evidence.')); reader.readAsDataURL(blob); });
    } else {
      const fs = await import('expo-file-system/legacy');
      data = `data:${mime};base64,${await fs.readAsStringAsync(asset.uri, { encoding: fs.EncodingType.Base64 })}`;
    }
    const selected = [...files, { name: asset.name, data }];
    if (selected.reduce((sum, file) => sum + file.data.split(',')[1].length * 3 / 4, 0) > 5 * 1024 * 1024) throw Error('Evidence may total at most 5 MB.');
    setFiles(selected);
  };
  return <View style={box}>
    <Text style={{ fontWeight: '700', fontSize: 18 }}>{report.title} · Report #{report.id}</Text>
    <Text>{report.starts_on} to {report.ends_on} (end date excluded)</Text>
    <Text>Report and payment due: {report.due_on} UTC</Text>
    <Text style={{ color: report.overdue ? '#A00020' : '#555' }}>{report.status.replaceAll('_', ' ')}{report.overdue ? ' · OVERDUE' : ''}</Text>
    {report.amount !== null && <Text style={{ fontWeight: '700' }}>Calculated royalty: PHP {report.amount}</Text>}
    {Object.entries(report.metrics).map(([key, value]) => <Text key={key}>{key.replaceAll('_', ' ')}: {value}</Text>)}
    {!!report.review_note && <Text>Artist review: {report.review_note}</Text>}
    {!!report.collection_error && <Text style={{ color: '#A00020' }}>{report.collection_error}</Text>}
    {report.evidence.map(file => <Pressable disabled={busy} key={file.path} onPress={() => run(() => viewEvidence(file.path))}><Text style={link}>View evidence: {file.name}</Text></Pressable>)}
    {report.is_buyer && report.can_submit && <>
      <Text>Report this period’s figures only. Enter zero when there were no sales. Attach evidence supporting sales, deductions and costs.</Text>
      {fields.map(field => <View key={field} style={{ gap: 6 }}><Text>{field === 'units' ? 'Items sold (whole number)' : field === 'deductions' ? 'Contractually permitted deductions (PHP)' : field === 'costs' ? 'Contractually permitted costs (PHP)' : 'Gross sales (PHP)'}</Text><TextInput accessibilityLabel={field} keyboardType="decimal-pad" value={metrics[field] || ''} onChangeText={value => setMetrics({ ...metrics, [field]: value })} style={input} /></View>)}
      {files.map((file, i) => <Pressable key={i} onPress={() => setFiles(files.filter((_, index) => index !== i))}><Text>{file.name} · Remove</Text></Pressable>)}
      <Pressable disabled={busy} onPress={() => run(attach)}><Text style={link}>Attach evidence (PDF or image, 5 MB total)</Text></Pressable>
      <Pressable disabled={busy || !files.length} onPress={() => run(async () => { await request(`periods/${report.id}/`, 'POST', { metrics, evidence: files }); setFiles([]); })}><Text style={link}>Submit for artist approval</Text></Pressable>
    </>}
    {!report.is_buyer && report.status === 'submitted' && <>
      <Text>Review the evidence and reported figures before approving. Approval authorizes collection of this calculated amount under the payer’s mandate.</Text>
      <TextInput accessibilityLabel="Artist review note" placeholder="Review note (required for rejection)" value={note} onChangeText={setNote} multiline maxLength={1000} style={input} />
      {['approve', 'reject'].map(action => <Pressable disabled={busy} key={action} onPress={() => run(() => request(`periods/${report.id}/`, 'PATCH', { action, note }))}><Text style={link}>{action === 'approve' ? 'Approve reported amount' : 'Reject and request corrections'}</Text></Pressable>)}
    </>}
    {report.history.map((entry, index) => <Text key={index} style={{ color: '#666', fontSize: 12 }}>{entry.at}: {entry.action}{entry.amount ? ` · PHP ${entry.amount}` : ''}{entry.note ? ` · ${entry.note}` : ''}</Text>)}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A00020' }}>{error}</Text>}
    {busy && <ActivityIndicator />}
  </View>;
}

function MandateCard({ license, enabled, reload }: { license: License; enabled: boolean; reload: () => Promise<void> }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const act = async (action: string) => {
    setBusy(true); setError('');
    try { const result = await request(`agreements/${license.id}/mandate/`, 'POST', { action, consent }); if (result.url) await Linking.openURL(result.url); await reload(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <View style={box}>
    <Text style={{ fontWeight: '700' }}>{license.title} · Agreement #{license.id}</Text>
    <Text>Payment authorization: {license.mandate_status.replaceAll('_', ' ')}</Text>
    {!license.configured && <Text>This signed agreement has no structured reporting rules. Agree and sign revised terms before automatic reporting can begin.</Text>}
    {license.is_buyer && license.configured && <>
      {!enabled && <Text>Automatic collection is awaiting merchant payment-channel setup. Reports and evidence review remain available.</Text>}
      {license.mandate_status !== 'active' && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(!consent)}><Text>{consent ? '☑' : '☐'} I authorize variable royalty payments calculated from my reports and approved by the artist, on or after each due date. I will link my payment method securely with Xendit. I may revoke future collection here; charges already initiated may still settle, and agreed debts remain due.</Text></Pressable>}
      {license.mandate_status !== 'active' && <Pressable disabled={busy || !enabled || !consent} onPress={() => act('link')}><Text style={link}>Link / update authorized payment method</Text></Pressable>}
      {license.mandate_status === 'pending' && <Pressable disabled={busy} onPress={() => act('refresh')}><Text style={link}>Confirm completed payment authorization</Text></Pressable>}
      {['active', 'pending'].includes(license.mandate_status) && <Pressable disabled={busy} onPress={() => act('revoke')}><Text style={link}>Revoke future automatic collection</Text></Pressable>}
    </>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A00020' }}>{error}</Text>}
  </View>;
}

export default function RoyaltyReports() {
  const [data, setData] = useState<{ agreements: License[]; periods: Period[]; collection_enabled: boolean }>();
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setData(await request()); setError(''); } catch (e: any) { setError(e.message); } }, []);
  useEffect(() => { const unsubscribe = auth.onAuthStateChanged(user => { if (user) load(); else setError('Please sign in to view royalty reports.'); }); return unsubscribe; }, [load]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF7F4' }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, width: '100%', maxWidth: 850, alignSelf: 'center' }}>
    <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(home)/settings')}><Text style={link}>Back</Text></Pressable>
    <Text style={{ fontSize: 26, fontWeight: '700' }}>Royalty reports & payments</Text>
    <Text>Submit evidence after each period closes. Reports and payment are due seven days later. The artist reviews your evidence before an authorized collection can proceed.</Text>
    <Pressable onPress={load}><Text style={link}>Refresh reports</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A00020' }}>{error}</Text>}
    {!data && !error && <ActivityIndicator />}
    {data && !data.agreements.length && <Text>No accepted royalty agreements yet.</Text>}
    {data?.agreements.map(license => <MandateCard key={license.id} license={license} enabled={data.collection_enabled} reload={load} />)}
    {data?.periods.map(period => <ReportCard key={period.id} report={period} reload={load} />)}
  </ScrollView></SafeAreaView>;
}
