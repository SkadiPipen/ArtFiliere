import TransactionHeader from '@/components/TransactionHeader';
import { Text, TextInput } from '@/components/Typography';
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Clock, CreditCard } from 'lucide-react-native';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';
import { preparePaymentWindow } from '@/services/paymentReturn';

const box = { padding: 16, borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 12, gap: 12, backgroundColor: '#fff' };
const input = { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8 };
const link = { color: '#A33F45', fontWeight: '700' as const, paddingVertical: 8 };
const readable = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const displayDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
type Evidence = { name: string; data: string };
type Period = { admin_review?: boolean; report_due_on?: string; report_overdue?: boolean; payment_status?: string; id: number; agreement_id: number; title: string; is_buyer: boolean; starts_on: string; ends_on: string; due_on: string; status: string; overdue: boolean; can_submit: boolean; basis: string; amount: string | null; metrics: Record<string, string>; review_note: string; collection_error: string; evidence: { name: string; path: string }[]; history: { action: string; at: string; amount?: string; note?: string }[] };
type License = { admin_review?: boolean; id: number; title: string; is_buyer: boolean; configured: boolean; mandate_status: string };
async function request(path = '', method = 'GET', body?: object) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Error('Please sign in again.');
  return readApiResponse(await fetch(`${API_URL}/api/users/royalties/${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
}

export async function viewEvidence(path: string) {
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
  const [historyExpanded, setHistoryExpanded] = useState(false);
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
    <View style={styles.reportHeader}>
      <View style={{ flex: 1, gap: 4 }}><Text style={styles.eyebrow}>Report #{report.id}</Text><Text style={styles.reportTitle}>{report.title}</Text></View>
      <View style={[styles.statusBadge, report.overdue && styles.overdueBadge]}><Text style={{ color: report.overdue ? '#9F3030' : '#79504A', fontWeight: '700', fontSize: 12 }}>{readable(report.status)}{report.overdue ? ' / Overdue' : ''}</Text></View>
    </View>
    <View style={styles.infoBox}>
      <View style={styles.sectionHeading}><FileText size={18} color="#A84B46" /><Text style={styles.sectionTitle}>Reporting Period</Text></View>
      <Text style={styles.periodText}>{displayDate(report.starts_on)} to {displayDate(report.ends_on)}</Text>
      <Text style={styles.muted}>End date excluded</Text>
    </View>
    <View style={styles.tileRow}>
      <View style={[styles.dateTile, report.report_overdue && styles.overdueBadge]}><Clock size={17} color="#A84B46" /><Text style={styles.tileLabel}>Report Due</Text><Text style={styles.tileValue}>{displayDate(report.report_due_on || report.due_on)}</Text>{report.report_overdue && <Text style={styles.errorText}>Report Overdue</Text>}</View>
      <View style={[styles.dateTile, report.overdue && styles.overdueBadge]}><CreditCard size={17} color="#A84B46" /><Text style={styles.tileLabel}>Payment Due</Text><Text style={styles.tileValue}>{displayDate(report.due_on)}</Text></View>
    </View>
    <Text style={styles.muted}>Deadlines use UTC.</Text>
    <View style={styles.amountBox}>
      <Text style={styles.tileLabel}>Calculated Royalty</Text>
      <Text style={styles.amount}>{report.amount !== null ? `PHP ${Number(report.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Awaiting Report'}</Text>
      {!!Object.keys(report.metrics).length && <View style={styles.metrics}>{Object.entries(report.metrics).map(([key, value]) => <View key={key} style={styles.metric}><Text style={styles.muted}>{readable(key)}</Text><Text style={styles.tileValue}>{value}</Text></View>)}</View>}
    </View>
    {!!report.review_note && <Text>{report.admin_review ? 'Admin review' : 'Artist review'}: {report.review_note}</Text>}
    {!!report.collection_error && <Text style={{ color: '#A00020' }}>{report.collection_error}</Text>}
    {!!report.evidence.length && <View style={styles.infoBox}><Text style={styles.sectionTitle}>Supporting Evidence</Text>{report.evidence.map(file => <Pressable accessibilityRole="button" accessibilityLabel={`View evidence: ${file.name}`} disabled={busy} key={file.path} onPress={() => run(() => viewEvidence(file.path))} style={styles.evidenceFile}><FileText size={18} color="#A84B46" /><Text style={[link, { flex: 1 }]} numberOfLines={2}>{file.name}</Text></Pressable>)}</View>}
    {report.is_buyer && report.can_submit && <>
      <Text>Report this period’s figures only. Enter zero when there were no sales. Attach evidence supporting sales, deductions and costs.</Text>
      {fields.map(field => <View key={field} style={{ gap: 6 }}><Text>{field === 'units' ? 'Items sold (whole number)' : field === 'deductions' ? 'Contractually permitted deductions (PHP)' : field === 'costs' ? 'Contractually permitted costs (PHP)' : 'Gross sales (PHP)'}</Text><TextInput accessibilityLabel={field} keyboardType="decimal-pad" value={metrics[field] || ''} onChangeText={value => setMetrics({ ...metrics, [field]: value })} style={input} /></View>)}
      {files.map((file, i) => <Pressable key={i} onPress={() => setFiles(files.filter((_, index) => index !== i))}><Text>{file.name} · Remove</Text></Pressable>)}
      <Pressable disabled={busy} onPress={() => run(attach)}><Text style={link}>Attach evidence (PDF or image, 5 MB total)</Text></Pressable>
      <Pressable disabled={busy || !files.length} onPress={() => run(async () => { await request(`periods/${report.id}/`, 'POST', { metrics, evidence: files }); setFiles([]); })}><Text style={link}>{report.admin_review ? 'Submit report for admin verification' : 'Submit for artist approval'}</Text></Pressable>
    </>}
    {!report.admin_review && !report.is_buyer && report.status === 'submitted' && <>
      <Text>Review the evidence and reported figures before approving. Approval authorizes collection of this calculated amount under the payer’s mandate.</Text>
      <TextInput accessibilityLabel="Artist review note" placeholder="Review note (required for rejection)" value={note} onChangeText={setNote} multiline maxLength={1000} style={input} />
      {['approve', 'reject'].map(action => <Pressable disabled={busy} key={action} onPress={() => run(() => request(`periods/${report.id}/`, 'PATCH', { action, note }))}><Text style={link}>{action === 'approve' ? 'Approve reported amount' : 'Reject and request corrections'}</Text></Pressable>)}
    </>}
    {report.admin_review && <View style={styles.paymentBox}>
      <View style={styles.sectionHeading}><CreditCard size={18} color="#A84B46" /><Text style={styles.sectionTitle}>Payment</Text></View>
      <Text style={styles.tileValue}>{readable(report.payment_status || 'not_started')}</Text>
      <Text style={styles.muted}>Funds are released to the artist wallet after admin verification.</Text>
      {report.is_buyer && report.status === 'submitted' && Number(report.amount) > 0 && !['held', 'released'].includes(report.payment_status || '') && <Pressable disabled={busy} onPress={() => {
        const tab = preparePaymentWindow();
        void run(async () => {
          try {
            if (Platform.OS === 'web' && !tab) throw Error('Allow payment pop-ups, then try again.');
            const data = await request(`periods/${report.id}/payment/`, 'POST', { action: 'pay' });
            if (data.url) {
              if (!/^https:\/\//i.test(data.url)) throw Error('Invalid checkout URL.');
              if (tab) tab.location.href = data.url;
              else await Linking.openURL(data.url);
            } else tab?.close();
          } catch (error) { tab?.close(); throw error; }
        });
      }}><Text style={link}>Pay reported royalty</Text></Pressable>}
      {report.is_buyer && report.payment_status === 'pending' && <Text>Checkout opens separately so you can return to this report. After paying, use Confirm / refresh payment status below.</Text>}
      {report.is_buyer && ['pending', 'creating', 'expired'].includes(report.payment_status || '') && <Pressable disabled={busy} onPress={() => run(() => request(`periods/${report.id}/payment/`, 'POST', { action: 'refresh' }))}><Text style={link}>Confirm / refresh payment status</Text></Pressable>}
      {report.payment_status === 'held' && <Text style={{ color: '#70482F' }}>Payment received and held. Awaiting admin verification and release.</Text>}
    </View>}
    <View style={styles.historyBox}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${historyExpanded ? 'Collapse' : 'Expand'} report history`} accessibilityState={{ expanded: historyExpanded }} onPress={() => setHistoryExpanded(value => !value)} style={styles.historyToggle}>
        <Text style={styles.sectionTitle}>History ({report.history.length})</Text>
        {historyExpanded ? <ChevronUp size={18} color="#79504A" /> : <ChevronDown size={18} color="#79504A" />}
      </Pressable>
      {historyExpanded && <View style={styles.historyEntries}>{report.history.length ? report.history.map((entry, index) => <View key={index} style={styles.historyEntry}>
        <Text style={styles.tileValue}>{readable(entry.action)}</Text>
        <Text style={styles.muted}>{new Date(entry.at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
        {!!entry.amount && <Text style={styles.sectionTitle}>PHP {entry.amount}</Text>}
        {!!entry.note && <Text style={styles.muted}>{entry.note}</Text>}
      </View>) : <Text style={styles.muted}>No history yet.</Text>}</View>}
    </View>
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
    <Text>{license.admin_review ? 'Payment flow: buyer checkout, funds held for admin verification' : 'Payment authorization: ' + license.mandate_status.replaceAll('_', ' ')}</Text>
    {license.admin_review === undefined && <Text style={{ color: '#A00020' }}>Payment workflow information is missing. Restart the backend and reload this page before continuing.</Text>}
    {!license.configured && <Text>This signed agreement has no structured reporting rules. Agree and sign revised terms before automatic reporting can begin.</Text>}
    {license.admin_review && <Text>Buyer submits a report, pays through checkout, and a platform administrator verifies the evidence before releasing funds. No linked payment method is required.</Text>}
    {license.is_buyer && license.configured && license.admin_review === false && <>
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
  const { agreementId } = useLocalSearchParams<{ agreementId?: string }>();
  const [data, setData] = useState<{ agreements: License[]; periods: Period[]; collection_enabled: boolean }>();
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setData(await request()); setError(''); } catch (e: any) { setError(e.message); } }, []);
  useEffect(() => { const unsubscribe = auth.onAuthStateChanged(user => { if (user) load(); else setError('Please sign in to view royalty reports.'); }); return unsubscribe; }, [load]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF7F4' }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, width: '100%', maxWidth: 850, alignSelf: 'center' }}>
    <TransactionHeader title="Royalty Reports & Payments" onBack={() => router.canGoBack() ? router.back() : router.replace('/(home)/settings')} />
    <Text>Submit evidence after each reporting period closes. Your report deadline is seven days before payment is due. For admin-reviewed reports, pay through checkout; verified funds are held until an administrator verifies the report and releases them to the artist wallet.</Text>
    <Pressable onPress={load}><Text style={link}>Refresh reports</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A00020' }}>{error}</Text>}
    {!data && !error && <ActivityIndicator />}
    {data && !data.agreements.length && <Text>No accepted royalty agreements yet.</Text>}
    {data?.agreements.filter(license => !agreementId || String(license.id) === agreementId).map(license => <MandateCard key={license.id} license={license} enabled={data.collection_enabled} reload={load} />)}
    {data?.periods.filter(period => !agreementId || String(period.agreement_id) === agreementId).map(period => <ReportCard key={period.id} report={period} reload={load} />)}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  reportHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  eyebrow: { color: '#A84B46', fontSize: 12, fontWeight: '700' }, reportTitle: { color: '#302624', fontSize: 20, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F5E8E3' }, overdueBadge: { backgroundColor: '#FCE7E4' },
  infoBox: { backgroundColor: '#FAF7F5', borderRadius: 10, padding: 14, gap: 8 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, sectionTitle: { color: '#5A3D37', fontWeight: '700', fontSize: 14 },
  periodText: { color: '#302624', fontSize: 15, fontWeight: '600' }, muted: { color: '#786862', fontSize: 12, lineHeight: 19 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, dateTile: { flex: 1, minWidth: 150, padding: 14, gap: 7, borderWidth: 1, borderColor: '#EFE1DC', borderRadius: 10 },
  tileLabel: { color: '#786862', fontSize: 12, fontWeight: '600' }, tileValue: { color: '#3A2D2A', fontSize: 14, fontWeight: '600' },
  errorText: { color: '#9F3030', fontSize: 12 }, amountBox: { padding: 16, gap: 8, backgroundColor: '#F5E8E3', borderRadius: 10 }, amount: { color: '#A84B46', fontSize: 26, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 4 }, metric: { gap: 4 }, evidenceFile: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, backgroundColor: '#FFF', borderRadius: 8 },
  paymentBox: { gap: 10, padding: 16, backgroundColor: '#F5E8E3', borderRadius: 10 },
  historyBox: { borderTopWidth: 1, borderTopColor: '#EFE1DC', marginTop: 4 }, historyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, minHeight: 48 },
  historyEntries: { gap: 10, paddingBottom: 4 }, historyEntry: { gap: 5, backgroundColor: '#FAF7F5', borderRadius: 8, padding: 12 },
});
