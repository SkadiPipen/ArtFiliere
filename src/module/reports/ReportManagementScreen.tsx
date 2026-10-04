import { purchaseRequest, downloadProtectedFile } from '@/services/purchases';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '@/firebase/config';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { ArrowLeft, Flag, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Report = { id: number; title: string; category: string; description: string; evidence: string; links: string[]; attachments: { id: number; name: string; size: number }[]; status: string; reporter: string; reported_user?: string; reported_user_id?: number; payment_id?: number; resolution: string };
type Request = { id: number; type: string; artwork: string; reason: string; status: string; requester: string; counterpart: string; counterpart_decision: string; counterpart_note: string; admin_note: string; payment_id: number; can_respond: boolean };
type Action = { id: number; report_id: number; action: string; target: string; reason: string; duration_days?: number; initiated_by: string; status: string; review_note: string };
type Payment = { id: number; title: string; buyer: string; artist: string; status: string; amount: string; physical: boolean };
type Financial = { id: number; report_id: number; payment_id: number; recipient: string; authorized_by: string; kind: string; amount: string; reason: string; status: string };
type ReportUser = { id: number; username: string; role: string };
type Dashboard = { role: string; reports: Report[]; requests: Request[]; actions: Action[]; financials: Financial[]; payments: Payment[] };
type Review = { title: string; path: string; field: string; value: string };
const label = (value: string) => value.replace(/_/g, ' ');

export default function ReportManagementScreen() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [tab, setTab] = useState('reports');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [composer, setComposer] = useState<'report' | 'request' | 'action' | 'review' | 'finance' | null>(null);
  const [financialKind, setFinancialKind] = useState('refund');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState('');
  const [files, setFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [category, setCategory] = useState('incident');
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userMatches, setUserMatches] = useState<ReportUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [kind, setKind] = useState('cancellation');
  const [action, setAction] = useState('suspension');
  const [days, setDays] = useState('7');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [formError, setFormError] = useState('');
  const load = useCallback(async () => {
    try { setData(await purchaseRequest('management/')); setError(''); }
    catch (e: any) { setError(e.message || 'Unable to load reports.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    setUserMatches([]); setSearchError('');
    if (composer !== 'report' || targetId || userQuery.trim().length < 3) { setSearchingUsers(false); return; }
    setSearchingUsers(true);
    const timer = setTimeout(async () => {
      try {
        const matches = await purchaseRequest(`management/report-users/?q=${encodeURIComponent(userQuery.trim())}`);
        if (!cancelled) setUserMatches(matches);
      } catch { if (!cancelled) setSearchError('Unable to search accounts. Please try again.'); }
      finally { if (!cancelled) setSearchingUsers(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [composer, userQuery, targetId]);
  const staff = data?.role === 'customer_support' || data?.role === 'platform_admin';
  const admin = data?.role === 'platform_admin';
  const trader = data?.role === 'buyer' || data?.role === 'artist';
  const open = (mode: typeof composer) => { setFormError(''); setDescription(''); setTitle(''); setEvidence(''); setFiles([]); setLinks([]); setPaymentId(null); setTargetId(null); setUserQuery(''); setUserMatches([]); setComposer(mode); };
  const attachFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      if (files.length + result.assets.length > 5 || result.assets.some(f => (f.size || 0) > 5 * 1024 * 1024)) throw new Error('Attach up to five files, 5 MB each.');
      setFiles([...files, ...result.assets]); setFormError('');
    } catch (e: any) { setFormError(e.message || 'Unable to select files.'); }
  };
  const attachLink = () => {
    try {
      const url = new URL(evidence.trim());
      if (!['http:', 'https:'].includes(url.protocol) || links.length >= 5) throw new Error();
      setLinks([...links, url.href]); setEvidence(''); setFormError('');
    } catch { setFormError('Enter a valid HTTP or HTTPS link (up to five links).'); }
  };
  const decide = (title: string, path: string, field: string, value: string) => { setReview({ title, path, field, value }); open('review'); };
  const submit = async () => {
    setBusy(true); setFormError('');
    try {
      if (composer === 'report') {
        if (userQuery.trim() && !targetId) throw new Error('Select a matching account or clear the username to report without a specific account.');
        if (evidence.trim()) throw new Error('Click Add link to attach the entered link before submitting.');
        const body = new FormData();
        body.append('payload', JSON.stringify({ title, description, links, category, payment_id: paymentId, reported_user_id: targetId }));
        for (const file of files) {
          if (Platform.OS === 'web') body.append('files', file.file || await (await fetch(file.uri)).blob(), file.name);
          else body.append('files', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
        }
        await purchaseRequest('management/reports/', 'POST', body);
      } else if (composer === 'request') {
        if (!paymentId) throw new Error('Select a transaction.');
        await purchaseRequest(`transactions/${paymentId}/requests/`, 'POST', { request_type: kind, reason: description });
      } else if (composer === 'action') {
        await purchaseRequest('management/account-actions/', 'POST', { report_id: selectedReport?.id, action, duration_days: action === 'suspension' ? Number(days) : null, reason: description });
      } else if (composer === 'finance') {
        await purchaseRequest('management/financial-authorizations/', 'POST', { report_id: selectedReport?.id, kind: financialKind, amount, reason: description });
      } else if (composer === 'review' && review) {
        const noteField = review.path.includes('account-actions') ? 'review_note' : review.path.includes('reports') ? 'resolution' : review.path.startsWith('admin/') ? 'admin_note' : 'note';
        await purchaseRequest(review.path, 'PATCH', { [review.field]: review.value, [noteField]: description });
      }
      setComposer(null); setMessage('Saved successfully.'); await load();
    } catch (e: any) { setFormError(e.message || 'Unable to save.'); }
    finally { setBusy(false); }
  };
  const button = (text: string, onPress: () => void, secondary = false) => <TouchableOpacity disabled={busy} onPress={onPress} style={[s.button, secondary && s.secondary]}><Text style={[s.buttonText, secondary && { color: '#8C4C43' }]}>{text}</Text></TouchableOpacity>;
  const choice = (text: string, selected: boolean, onPress: () => void) => <TouchableOpacity key={text} disabled={busy} onPress={onPress} style={[s.choice, selected && s.chosen]}><Text style={[s.choiceText, selected && { color: '#A74646', fontWeight: '700' }]}>{text}</Text></TouchableOpacity>;
  const status = (value: string) => <View style={s.status}><Text style={s.statusText}>{label(value)}</Text></View>;
  if (loading) return <SafeAreaView style={s.page}><ActivityIndicator style={{ marginTop: 80 }} color="#B65B50" /></SafeAreaView>;
  return <SafeAreaView style={s.page}>
    <View style={s.header}>
      <TouchableOpacity accessibilityLabel="Back" onPress={() => router.back()}><ArrowLeft size={22} color="#62493E" /></TouchableOpacity>
      <View style={{ flex: 1 }}><Text style={s.brand}>ArtFiliere</Text><Text style={s.subhead}>{data?.role === 'customer_support' ? 'Customer service moderator' : 'Support & account safety'}</Text></View>
      <TouchableOpacity accessibilityLabel="Refresh reports" onPress={load}><RefreshCw size={20} color="#8C4C43" /></TouchableOpacity>
      {data?.role === 'customer_support' && <TouchableOpacity onPress={() => { signOut(auth).then(() => router.replace('/')).catch(() => setError('Unable to log out.')); }}><Text style={{ color: '#8C4C43', fontWeight: '700' }}>Log out</Text></TouchableOpacity>}
    </View>
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.hero}><ShieldCheck color="#B65B50" size={30} /><Text style={s.title}>Reports, disputes & transactions</Text>
        <Text style={s.body}>{admin ? 'Resolve disputes, authorize refunds or wallet credits, and approve or deny account actions.' : staff ? 'Resolve disputes, authorize refunds or wallet credits, and recommend account actions for Platform Admin approval.' : 'Report an incident, track a dispute, or manage your transaction requests.'}</Text></View>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!!message && <Text style={s.success}>{message}</Text>}
      {!!data && <>
        <View style={s.row}>
          {staff && button('Review restriction appeals', () => router.push((admin ? '/moderation-approvals' : '/moderator-dashboard') as any), true)}
          {!staff && button('File a report', () => open('report'))}
          {trader && button('Request cancellation or return', () => open('request'), true)}
        </View>
        <View style={s.row}>
          {choice(`Reports (${data.reports.length})`, tab === 'reports', () => setTab('reports'))}
          {(trader || staff) && choice(`Transaction requests (${data.requests.length})`, tab === 'requests', () => setTab('requests'))}
          {staff && choice(`Account approvals (${data.actions.filter(a => a.status === 'pending').length})`, tab === 'actions', () => setTab('actions'))}
          {(staff || trader) && choice(`Refunds & wallet credits (${data.financials?.length || 0})`, tab === 'finance', () => setTab('finance'))}
        </View>
        {tab === 'reports' && (data.reports.length ? data.reports.map(r => <View key={r.id} style={s.card}>
          <View style={s.row}><Flag size={18} color="#B65B50" /><Text style={s.cardTitle}>#{r.id} · {r.title}</Text>{status(r.status)}</View>
          <Text style={s.muted}>{label(r.category)} · Filed by {r.reporter}{r.payment_id ? ` · Transaction #${r.payment_id}` : ''}</Text>
          {!!r.reported_user && <Text style={s.body}>Reported account: {r.reported_user}</Text>}
          <Text style={s.body}>{r.description}</Text>
          {!!r.evidence && !(r.links || []).length && <Text selectable style={s.body}>Evidence: {r.evidence}</Text>}
          {(r.links || []).map((link, index) => <TouchableOpacity key={index} onPress={() => Linking.openURL(link).catch(() => setError('Unable to open link.'))}><Text style={{ color: '#A74646', textDecorationLine: 'underline' }}>{link}</Text></TouchableOpacity>)}
          {(r.attachments || []).map(file => <View key={file.id} style={s.row}>{button(`Download ${file.name} (${(file.size / 1024).toFixed(0)} KB)`, () => { downloadProtectedFile(`management/attachments/${file.id}/`, file.name).catch(e => setError(e.message)); }, true)}</View>)}
          {!!r.resolution && <Text style={s.note}>Review: {r.resolution}</Text>}
          {staff && !['resolved', 'dismissed'].includes(r.status) && <View style={s.row}>
            {button('Review', () => decide('Mark report under review', `management/reports/${r.id}/`, 'status', 'under_review'), true)}
            {button('Resolve', () => decide('Resolve report', `management/reports/${r.id}/`, 'status', 'resolved'), true)}
            {button('Dismiss', () => decide('Dismiss report', `management/reports/${r.id}/`, 'status', 'dismissed'), true)}
          </View>}
          {data.role === 'customer_support' && r.reported_user_id && button('Initiate suspension / ban', () => { setSelectedReport(r); open('action'); }, true)}
          {staff && r.payment_id && r.status !== 'dismissed' && <View style={s.row}>
            {button('Authorize refund', () => { setSelectedReport(r); setFinancialKind('refund'); setAmount(''); open('finance'); }, true)}
            {button('Authorize wallet credit', () => { setSelectedReport(r); setFinancialKind('wallet_credit'); setAmount(''); open('finance'); }, true)}
          </View>}
        </View>) : <Text style={s.empty}>No reports yet.</Text>)}
        {tab === 'requests' && (data.requests.length ? data.requests.map(r => <View key={r.id} style={s.card}>
          <View style={s.row}><Text style={s.cardTitle}>#{r.id} · {label(r.type)} · {r.artwork}</Text>{status(r.status)}</View>
          <Text style={s.muted}>Transaction #{r.payment_id} · Requested by {r.requester} · Other party: {r.counterpart}</Text>
          <Text style={s.body}>{r.reason}</Text>
          {r.type === 'cancellation' && <Text style={s.note}>Other party: {label(r.counterpart_decision)}{r.counterpart_decision === 'accepted' && r.status === 'pending' ? ' · Awaiting admin review' : ''}</Text>}
          {!!r.counterpart_note && <Text style={s.body}>Response: {r.counterpart_note}</Text>}
          {!!r.admin_note && <Text style={s.body}>Admin review: {r.admin_note}</Text>}
          {r.can_respond && <View style={s.row}>
            {button('Accept cancellation', () => decide('Accept cancellation', `transactions/requests/${r.id}/respond/`, 'decision', 'accepted'))}
            {button('Decline cancellation', () => decide('Decline cancellation', `transactions/requests/${r.id}/respond/`, 'decision', 'declined'), true)}
          </View>}
          {admin && r.status === 'pending' && <View style={s.row}>
            {(r.type === 'return' || r.counterpart_decision === 'accepted') && button('Approve request', () => decide('Approve transaction request', `admin/requests/${r.id}/`, 'status', 'approved'))}
            {button('Decline request', () => decide('Decline transaction request', `admin/requests/${r.id}/`, 'status', 'declined'), true)}
          </View>}
        </View>) : <Text style={s.empty}>No transaction requests yet.</Text>)}
        {tab === 'actions' && (data.actions.length ? data.actions.map(a => <View key={a.id} style={s.card}>
          <View style={s.row}><Text style={s.cardTitle}>#{a.id} · {a.action} · {a.target}</Text>{status(a.status)}</View>
          <Text style={s.muted}>Report #{a.report_id} · Initiated by {a.initiated_by}{a.duration_days ? ` · ${a.duration_days} days` : ''}</Text>
          <Text style={s.body}>{a.reason}</Text>{!!a.review_note && <Text style={s.note}>Decision: {a.review_note}</Text>}
          {admin && a.status === 'pending' && <View style={s.row}>
            {button('Approve', () => decide(`Approve ${a.action} for ${a.target}`, `management/account-actions/${a.id}/`, 'status', 'approved'))}
            {button('Decline', () => decide(`Decline ${a.action} request`, `management/account-actions/${a.id}/`, 'status', 'declined'), true)}
          </View>}
        </View>) : <Text style={s.empty}>No account action requests yet.</Text>)}
        {tab === 'finance' && <>
          <Text style={s.note}>Authorizations record approval for processing. An authorized refund or wallet credit has not yet been paid or added to a wallet.</Text>
          {(data.financials || []).length ? data.financials.map(f => <View key={f.id} style={s.card}>
            <View style={s.row}><Text style={s.cardTitle}>#{f.id} · {label(f.kind)} · PHP {Number(f.amount).toFixed(2)}</Text>{status(f.status)}</View>
            <Text style={s.muted}>Report #{f.report_id} · Transaction #{f.payment_id} · Recipient: {f.recipient}</Text>
            <Text style={s.body}>{f.reason}</Text><Text style={s.muted}>Authorized by {f.authorized_by}</Text>
          </View>) : <Text style={s.empty}>No financial authorizations yet.</Text>}
        </>}
      </>}
    </ScrollView>
    <Modal visible={composer !== null} transparent animationType="fade" onRequestClose={() => !busy && setComposer(null)}>
      <View style={s.overlay}><ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={s.modal} contentContainerStyle={{ padding: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{composer === 'report' ? 'File incident / dispute report' : composer === 'request' ? 'Request cancellation or return' : composer === 'action' ? 'Initiate suspension / ban' : composer === 'finance' ? `Authorize ${label(financialKind)}` : review?.title}</Text>
        {composer === 'finance' && <>
          <Text>Report #{selectedReport?.id} · Transaction #{selectedReport?.payment_id}</Text>
          <Text>Amount in PHP *</Text><TextInput accessibilityLabel="Authorization amount in PHP" editable={!busy} keyboardType="decimal-pad" style={s.input} value={amount} onChangeText={setAmount} />
          <Text style={s.note}>Compensation goes to the transaction buyer. This records authorization for processing; it does not immediately refund payment or change the wallet balance.</Text>
        </>}
        {composer === 'report' && <>
          <View style={s.row}>{choice('Incident', category === 'incident', () => setCategory('incident'))}{choice('Dispute', category === 'dispute', () => setCategory('dispute'))}</View>
          <Text>Title *</Text><TextInput accessibilityLabel="Report title" editable={!busy} style={s.input} value={title} maxLength={150} onChangeText={setTitle} />
          <Text>Reported account (optional)</Text>
          <TextInput accessibilityLabel="Search reported username" placeholder="Type at least 3 characters of their username" editable={!busy} autoCapitalize="none" maxLength={150} style={s.input} value={userQuery} onChangeText={value => { setUserQuery(value); setTargetId(null); }} />
          {targetId ? <View style={s.row}><Text style={s.body}>Selected: {userQuery}</Text>{button('Clear', () => { setTargetId(null); setUserQuery(''); }, true)}</View> : <>
            {searchingUsers && <Text style={s.muted}>Searching…</Text>}
            {!!searchError && <Text style={s.error}>{searchError}</Text>}
            {!searchingUsers && !searchError && userQuery.trim().length >= 3 && !userMatches.length && <Text style={s.muted}>No matching username. Check the spelling.</Text>}
            <View style={s.row}>{userMatches.map(u => choice(`${u.username} (${label(u.role)})`, false, () => { setTargetId(u.id); setUserQuery(u.username); }))}</View>
          </>}
          <Text style={s.muted}>Leave blank if the incident does not involve a specific account.</Text>
        </>}
        {(composer === 'report' || composer === 'request') && <>
          <Text>Transaction {composer === 'report' ? '(optional)' : '*'}</Text>
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={{ maxHeight: 150 }} nestedScrollEnabled><View style={s.row}>
            {composer === 'report' && choice('No transaction', paymentId === null, () => setPaymentId(null))}
            {data?.payments.filter(p => composer === 'report' || ['pending', 'paid'].includes(p.status)).map(p => choice(`#${p.id} · ${p.title} · ${p.status}`, paymentId === p.id, () => setPaymentId(p.id)))}
          </View></ScrollView>
        </>}
        {composer === 'request' && <>
          <View style={s.row}>{choice('Cancellation', kind === 'cancellation', () => setKind('cancellation'))}{choice('Return', kind === 'return', () => setKind('return'))}</View>
          <Text style={s.muted}>Returns apply to paid physical artwork. Cancellation acceptance goes to admin review; it does not automatically issue a refund.</Text>
        </>}
        {composer === 'action' && <>
          <Text>Report #{selectedReport?.id} · Account: {selectedReport?.reported_user}</Text>
          <View style={s.row}>{choice('Suspension', action === 'suspension', () => setAction('suspension'))}{choice('Ban', action === 'ban', () => setAction('ban'))}</View>
          {action === 'suspension' && <><Text>Duration in days (1–365) *</Text><TextInput accessibilityLabel="Suspension days" editable={!busy} keyboardType="number-pad" style={s.input} value={days} onChangeText={setDays} /></>}
          <Text style={s.note}>The account remains active until Platform Admin approves this request.</Text>
        </>}
        <Text>{composer === 'report' ? 'Describe what happened *' : composer === 'review' ? 'Decision notes' : 'Reason *'}</Text>
        <TextInput accessibilityLabel="Description or decision notes" editable={!busy} multiline style={[s.input, { minHeight: 100 }]} value={description} maxLength={composer === 'report' ? 5000 : 2000} onChangeText={setDescription} />
        {composer === 'report' && <>
          <Text>Evidence attachments (optional)</Text>
          <Text style={s.muted}>Up to five JPG, PNG, WebP or PDF files, 5 MB each, and five links.</Text>
          {button('Attach files', attachFiles, true)}
          {files.map((file, index) => <View key={index} style={s.row}><Text style={[s.body, { flex: 1 }]}>{file.name}</Text>{button('Remove', () => setFiles(files.filter((_, i) => i !== index)), true)}</View>)}
          <TextInput editable={!busy} accessibilityLabel="Evidence link" placeholder="https://example.com/evidence" autoCapitalize="none" keyboardType="url" style={s.input} value={evidence} maxLength={2000} onChangeText={setEvidence} />
          {button('Add link', attachLink, true)}
          {links.map((link, index) => <View key={index} style={s.row}><Text style={[s.body, { flex: 1 }]}>{link}</Text>{button('Remove', () => setLinks(links.filter((_, i) => i !== index)), true)}</View>)}
        </>}
        {!!formError && <Text accessibilityRole="alert" style={s.error}>{formError}</Text>}
        {button(busy ? 'Saving…' : composer === 'action' ? 'Submit for approval' : 'Submit', submit)}
        {button('Cancel', () => setComposer(null), true)}
      </ScrollView></View>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FAF7F3' }, header: { padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EEE5DE' },
  brand: { fontSize: 18, fontWeight: '800', color: '#A74646' }, subhead: { fontSize: 11, color: '#8B8078', marginTop: 3 },
  content: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 24, gap: 18, paddingBottom: 60 },
  hero: { gap: 10, marginBottom: 8 }, title: { fontSize: 25, fontWeight: '800', color: '#3D3028' },
  body: { color: '#62574E', lineHeight: 22 }, muted: { color: '#8B8078', fontSize: 12, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  card: { padding: 22, borderRadius: 16, borderWidth: 1, borderColor: '#EEE5DE', backgroundColor: '#fff', gap: 12 },
  cardTitle: { flex: 1, minWidth: 160, color: '#463A32', fontSize: 16, fontWeight: '700' },
  status: { backgroundColor: '#F6E8E1', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 }, statusText: { color: '#9C5147', fontSize: 12, fontWeight: '600' },
  button: { backgroundColor: '#B65B50', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  secondary: { backgroundColor: '#F5E8E0' }, choice: { borderWidth: 1, borderColor: '#DED4CC', padding: 10, borderRadius: 9, backgroundColor: '#fff' }, chosen: { borderColor: '#B65B50', backgroundColor: '#FAEDE6' }, choiceText: { fontSize: 12, color: '#74675D' },
  note: { backgroundColor: '#FAF4EF', padding: 12, borderRadius: 8, color: '#74675D', lineHeight: 20 },
  empty: { padding: 35, color: '#8B8078', textAlign: 'center' }, error: { color: '#B42318', backgroundColor: '#FFF0ED', padding: 12, borderRadius: 8 }, success: { color: '#39714B' },
  overlay: { flex: 1, backgroundColor: 'rgba(35,25,20,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 640, maxHeight: '90%', backgroundColor: '#FFFCF9', borderRadius: 16, flexGrow: 0 },
  input: { borderWidth: 1, borderColor: '#D7CCC3', borderRadius: 8, padding: 12, color: '#3D3028', backgroundColor: '#fff', textAlignVertical: 'top' },
});
