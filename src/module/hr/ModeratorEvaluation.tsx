import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ArrowLeft, CheckCircle2, Clock3, FileText, Search, ShieldCheck, UserPlus, X, XCircle } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Text, TextInput } from '@/components/Typography';
import RegistrationFieldGrid from './RegistrationFieldGrid';
import FloatingApplicationField from './FloatingApplicationField';
import ApplicationUploadCard from './ApplicationUploadCard';
import PrivateDocumentPreview from '@/components/PrivateDocumentPreview';
import Svg, { Circle } from 'react-native-svg';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { downloadProtectedFile, purchaseRequest } from '@/services/purchases';
import { useAdminRefresh } from '@/module/admin/AdminRefresh';
import { markAdminQueueRead } from '@/services/adminNotifications';

type Profile = { name: string; username: string; email: string; phone: string; photo: string; date_of_birth: string; address: string; joined_at: string };
type Application = { application_details: { license_number?: string; license_expires_on?: string }; id: number; user_id: number; profile: Profile; requested_role: string; status: string; education: string; motivation: string; assigned_to: number | null; assigned_name: string; version: number; submitted_at: string; updated_at: string; documents: { index: number; name: string; mime: string }[]; reviews?: { action: string; actor: string; note: string; created_at: string }[] };
type Moderator = { id: number; profile: Profile; role: string; restricted: boolean; deactivated?: boolean; application_id?: number; last_active?: string };
type Directory = { applications: Application[]; moderators: Moderator[]; actor_id: number; actor_role: string };
type Upload = { name: string; data_uri: string; kind?: 'license' | 'application' };
const labels: Record<string, string> = { pending: 'Pending review', under_review: 'Under review', sent_to_admin: 'Sent to admin', approved: 'Approved', rejected: 'Rejected', active: 'Active moderators' };
const roleName = (role: string) => role === 'driver' ? 'Driver' : role === 'creative_moderator' ? 'Creative moderator' : 'Customer service moderator';
const date = (value: string) => value ? new Date(value).toLocaleDateString() : 'Not provided';
const stateColor = (value: string) => ({ pending: '#AF761B', under_review: '#9B5650', sent_to_admin: '#35755B', approved: '#35755B', rejected: '#B63C48' }[value] || '#7A6C65');

export default function ModeratorEvaluation({ admin = false, driver = false }: { admin?: boolean; driver?: boolean }) {
  const endpoint = driver ? 'driver-applications/' : 'moderator-applications/';
  const noun = driver ? 'driver' : 'moderator';
  const [license, setLicense] = useState({ license_number: '', license_expires_on: '' });
  const { width } = useWindowDimensions();
  const compact = width < 1000;
  const [listWidth, setListWidth] = useState(0);
  const sideBySide = listWidth >= 1180;
  const [data, setData] = useState<Directory | null>(null);
  const [selected, setSelected] = useState<Application | null>(null);
  const [member, setMember] = useState<Moderator | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [filter, setFilter] = useState(admin ? 'sent_to_admin' : 'all'), [search, setSearch] = useState(''), [note, setNote] = useState('');
  const [register, setRegister] = useState(false), [email, setEmail] = useState(''), [education, setEducation] = useState(''), [motivation, setMotivation] = useState('');
  const [applicant, setApplicant] = useState({ name: '', phone: '', address: '', date_of_birth: '' });
  const [role, setRole] = useState(driver ? 'driver' : 'creative_moderator'), [documents, setDocuments] = useState<Upload[]>([]);
  const [preview, setPreview] = useState<{ uri: string; mime: string; label: string } | null>(null), [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const previewUrl = useRef(''), previewGeneration = useRef(0);
  const closePreview = () => { previewGeneration.current++; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = ''; setPreview(null); setPreviewOpen(false); };
  useEffect(() => () => { previewGeneration.current++; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  const load = async () => {
    setLoading(true); setError('');
    try { await auth.authStateReady(); const result: Directory = await purchaseRequest(endpoint); setData(result); if (admin) void markAdminQueueRead(noun, result.applications.filter(item => item.status === 'sent_to_admin').map(item => item.id)); }
    catch (e: any) { setError(e.message || 'Unable to load applications.'); }
    finally { setLoading(false); }
  };
  useAdminRefresh(load);
  useEffect(() => { void load(); }, []);
  const open = async (item: Application) => {
    setBusy(true); setError('');
    try { setSelected(await purchaseRequest(`${endpoint}${item.id}/`)); setNote(''); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const decide = async (action: string) => {
    if (!selected || busy) return;
    if (action !== 'claim' && !note.trim()) { setError('Enter your evaluation note or decision reason.'); return; }
    setBusy(true); setError('');
    try {
      const updated: Application = await purchaseRequest(`${endpoint}${selected.id}/`, 'PATCH', { action, note, version: selected.version });
      setSelected(updated); setNote('');
      const result: Directory = await purchaseRequest(endpoint); setData(result);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const attachment = async (item: Application, doc: Application['documents'][number]) => {
    closePreview(); setPreviewOpen(true); setPreviewError('');
    const generation = ++previewGeneration.current;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw Error('Please sign in again.');
      const response = await fetch(`${API_URL}/api/${endpoint}${item.id}/documents/${doc.index}/`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw Error('Attachment unavailable or access denied.');
      const blob = await response.blob();
      if (generation !== previewGeneration.current) return;
      if (Platform.OS === 'web') { const uri = URL.createObjectURL(blob); previewUrl.current = uri; setPreview({ uri, mime: blob.type, label: doc.name }); }
      else {
        const uri = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
        if (generation === previewGeneration.current) setPreview({ uri, mime: blob.type, label: doc.name });
      }
    } catch (e: any) { if (generation === previewGeneration.current) setPreviewError(e.message || 'Unable to preview this attachment.'); }
  };
  const pick = async (kind?: Upload['kind'], file?: File) => {
    setError('');
    try {
      if (file && !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('Choose a PDF, JPEG, PNG or WebP file.');
      const result = file ? { canceled: false as const, assets: [{ name: file.name, size: file.size, uri: '', file, mimeType: file.type }] } : await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size || 0) > 5 * 1024 * 1024) throw Error('Each attachment must be 5 MB or smaller.');
      let uri = asset.uri;
      if (!uri.startsWith('data:')) {
        if (Platform.OS === 'web') {
          uri = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(asset.file!); });
        } else { const fs = await import('expo-file-system/legacy'); uri = `data:${asset.mimeType};base64,${await fs.readAsStringAsync(uri, { encoding: fs.EncodingType.Base64 })}`; }
      }
      const retained = kind ? documents.filter(doc => doc.kind !== kind) : documents;
      if (retained.reduce((total, doc) => total + doc.data_uri.length, uri.length) > 7 * 1024 * 1024) throw Error('Combined attachments must be 5 MB or smaller.');
      setDocuments([...retained, { name: asset.name, data_uri: uri, kind }].sort((a, b) => Number(b.kind === 'license') - Number(a.kind === 'license')).slice(0, 3));
    } catch (e: any) { setError(e.message || 'Unable to attach this file.'); }
  };
  const submit = async () => {
    if (driver && (!documents.some(doc => doc.kind === 'license') || !documents.some(doc => doc.kind === 'application'))) {
      setError('Attach both required files: the driver’s license and the application form.'); return;
    }
    setBusy(true); setError('');
    try {
      const item: Application = await purchaseRequest(endpoint, 'POST', { email, education, motivation, requested_role: role, documents, ...applicant, ...license });
      setRegister(false); setLicense({ license_number: '', license_expires_on: '' }); setApplicant({ name: '', phone: '', address: '', date_of_birth: '' }); setEmail(''); setEducation(''); setMotivation(''); setDocuments([]); await load(); setSelected(item); setNote('');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const accountControls = (account: Moderator) => <View style={s.card}><Text style={s.heading}>Driver account access</Text><Text style={s.muted}>{account.deactivated ? 'This account cannot access driver deliveries.' : 'Deactivation stops driver access and clocks the driver out. Ongoing deliveries must be completed or reassigned first.'}</Text><TextInput multiline maxLength={2000} value={note} onChangeText={setNote} placeholder="Reason for changing account access (required)" accessibilityLabel="Account access reason" style={s.input} />{button(account.deactivated ? 'Reactivate driver' : 'Deactivate driver', () => void changeAccount(account), true)}</View>;
  const changeAccount = async (account: Moderator) => {
    if (busy) return;
    if (!note.trim()) { setError('Enter the reason for changing driver access.'); return; }
    setBusy(true); setError('');
    try {
      const result = await purchaseRequest(`driver-accounts/${account.id}/`, 'PATCH', { action: account.deactivated ? 'reactivate' : 'deactivate', note });
      if (member) setMember({ ...account, deactivated: result.deactivated });
      setNote(''); await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const openMember = async (account: Moderator) => {
    if (driver && account.application_id) {
      const application = data?.applications.find(item => item.id === account.application_id);
      if (application) { await open(application); return; }
    }
    setMember(account); setNote(''); setError('');
  };
  const button = (text: string, onPress: () => void, secondary = false) => <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[s.button, secondary && s.secondary, busy && { opacity: 0.5 }]}><Text style={{ color: secondary ? '#A74646' : '#FFF', fontWeight: '700' }}>{text}</Text></Pressable>;
  const profileCard = (person: Profile, title: string, content?: React.ReactNode) => <View style={[s.card, { flexDirection: compact ? 'column' : 'row', gap: 30 }]}>
    <View style={{ alignItems: 'center', gap: 8, flex: 1, minWidth: 180 }}>
      {person.photo ? <Image source={{ uri: person.photo }} style={s.avatar} /> : <View style={[s.avatar, { backgroundColor: '#F3E3DA', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 30, color: '#A74646' }}>{person.name.slice(0, 1)}</Text></View>}
      <Text style={s.heading}>{person.name}</Text><Text style={s.muted}>{title}</Text><Text>{person.email}</Text><Text>{person.phone || 'No contact number provided'}</Text><Text style={{ textAlign: 'center' }}>{person.address || 'No address on file'}</Text>
    </View>
    <View style={{ flex: 2, gap: 14 }}><Field label="Date of birth" value={person.date_of_birth || 'Not provided'} /><Field label="Joined platform" value={date(person.joined_at)} />{content}</View>
  </View>;
  const rows = (data?.applications || []).filter(item => (filter === 'all' || item.status === filter) && `${item.profile.name} ${item.profile.email} ${item.profile.username} ${roleName(item.requested_role)}`.toLowerCase().includes(search.toLowerCase()));
  return <View style={{ gap: 20, paddingBottom: 28 }}>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {loading && <ActivityIndicator color="#B95552" />}
    {selected ? <>
      <Pressable accessibilityRole="button" onPress={() => { setSelected(null); setError(''); }} style={s.back}><ArrowLeft size={20} color="#A74646" /><Text style={s.link}>Back to {noun} evaluation</Text></Pressable>
      <View style={s.row}><Text style={s.title}>{driver ? 'Driver' : 'Moderator'} application #{selected.id}</Text><Badge status={selected.status} />{button('Reload application', () => void open(selected), true)}</View>
      {profileCard(selected.profile, roleName(selected.requested_role), <>
        <Field label={driver ? "Driving / vehicle qualification" : "Education"} value={selected.education} />{driver && <><Field label="Driver’s license number" value={selected.application_details.license_number || "Not on file"} /><Field label="License expiration date" value={selected.application_details.license_expires_on || "Not on file"} /></>}<Field label="Application statement" value={selected.motivation} />
        <Field label="Assigned HR reviewer" value={selected.assigned_name || 'Not yet assigned'} />
        <Text style={s.heading}>Application attachments</Text>
        {selected.documents.map(doc => <Pressable key={doc.index} accessibilityRole="button" onPress={() => attachment(selected, doc)} style={s.document}><FileText size={22} color="#A74646" /><Text style={[s.link, { flex: 1 }]}>{driver && doc.index < 2 ? (doc.index === 0 ? 'Driver’s license: ' : 'Application form: ') : ''}{doc.name}</Text><Text style={s.link}>Preview</Text></Pressable>)}
      </>)}
      <View style={s.card}><Text style={s.heading}>Evaluation & decision</Text>
        {selected.status === 'pending' && !admin && <><Text style={s.muted}>Start the review to assign this application to you.</Text>{button('Start review', () => decide('claim'))}</>}
        {((!admin && selected.status === 'under_review' && selected.assigned_to === data?.actor_id) || (admin && selected.status === 'sent_to_admin')) && <>
          <TextInput multiline maxLength={2000} value={note} onChangeText={setNote} placeholder="Evaluation notes / decision reason (required)" accessibilityLabel="Evaluation notes" style={[s.input, { minHeight: 110, textAlignVertical: 'top' }]} />
          <View style={[s.row, { justifyContent: 'flex-end' }]}>{button('Reject application', () => decide('reject'), true)}{button(admin ? `Approve ${noun}` : 'Send to admin', () => decide(admin ? 'approve' : 'forward'))}</View>
        </>}
        {selected.status === 'under_review' && selected.assigned_to !== data?.actor_id && <Text style={s.muted}>Assigned to {selected.assigned_name}. Only that HR reviewer can submit the evaluation.</Text>}
        {selected.status === 'approved' && !selected.profile.username && <Text style={s.muted}>Account created after admin approval. The applicant can use Forgot password on the login page to set their password for this email.</Text>}
        {selected.status === 'sent_to_admin' && !admin && <Text style={s.muted}>HR evaluation complete. Awaiting the administrator’s final decision.</Text>}
        {admin && ['pending', 'under_review'].includes(selected.status) && <Text style={s.muted}>Awaiting HR evaluation. Final approval becomes available after HR sends this application to admin.</Text>}
        {['approved', 'rejected'].includes(selected.status) && <Text style={s.muted}>This application is {labels[selected.status].toLowerCase()}. Its review history is retained below.</Text>}
      </View>
      {driver && selected.user_id && data?.moderators.find(item => item.id === selected.user_id) && accountControls(data.moderators.find(item => item.id === selected.user_id)!)}
      <View style={s.card}><Text style={s.heading}>Review history</Text>{selected.reviews?.map((review, index) => <View key={index} style={s.history}><Text style={s.link}>{({ submitted: 'Application registered', claim: 'Review started', forward: 'Sent to admin', approve: 'Final approval', reject: 'Rejected' } as Record<string, string>)[review.action]} · @{review.actor}</Text><Text style={s.muted}>{new Date(review.created_at).toLocaleString()}</Text>{!!review.note && <Text>{review.note}</Text>}</View>)}</View>
    </> : member ? <>
      {button(`Back to ${noun}s`, () => setMember(null), true)}<Text style={s.title}>{driver ? 'Driver details' : 'Moderator account'}</Text>{profileCard(member.profile, roleName(member.role))}
      <Text style={s.muted}>{member.deactivated ? 'Driver account deactivated.' : member.restricted ? 'Account currently restricted.' : `Active ${noun} account.`} {driver ? 'No application documents are on file for this existing driver.' : 'Select the application list to review recorded application documents.'}</Text>{driver && accountControls(member)}
    </> : register ? <>
      {button('Back to evaluation', () => { setRegister(false); setError(''); }, true)}<Text style={s.title}>Register {noun} application</Text>
      <View style={s.card}>
        <View style={[s.row, { alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }]}>
          <Text style={[s.muted, { flex: 1, minWidth: 240 }]}>Applicants do not need an existing platform account. For a new applicant, complete the personal details below. Existing accounts use their saved profile. Access is granted only after final admin approval.</Text>
          <View style={[s.row, { justifyContent: 'flex-end' }]}>{(driver ? ['driver'] : ['creative_moderator', 'customer_support']).map(value => <Pressable accessibilityRole="radio" accessibilityState={{ checked: role === value }} key={value} onPress={() => setRole(value)} style={[s.chip, role === value && s.chipActive]}><Text style={{ color: role === value ? '#FFF' : '#A74646' }}>{roleName(value)}</Text></Pressable>)}</View>
        </View>
        <RegistrationFieldGrid>
          <FloatingApplicationField label="Email" value={email} onChange={setEmail} keyboardType="email-address" disabled={busy} />
          <FloatingApplicationField label="Contact number" value={applicant.phone} onChange={value => setApplicant(previous => ({ ...previous, phone: value }))} keyboardType="phone-pad" maxLength={20} disabled={busy} />
          <FloatingApplicationField label="Full name" value={applicant.name} onChange={value => setApplicant(previous => ({ ...previous, name: value }))} maxLength={250} disabled={busy} />
          <FloatingApplicationField label="Date of birth" value={applicant.date_of_birth} onChange={value => setApplicant(previous => ({ ...previous, date_of_birth: value }))} date maximumDate={new Date(new Date().setDate(new Date().getDate() - 1))} disabled={busy} />
          <FloatingApplicationField label="Brgy, City, Postal" value={applicant.address} onChange={value => setApplicant(previous => ({ ...previous, address: value }))} maxLength={1000} disabled={busy} />
          <FloatingApplicationField label={driver ? 'Driving experience / vehicle qualification' : 'Education / qualification'} value={education} onChange={setEducation} maxLength={250} disabled={busy} />
        </RegistrationFieldGrid>
        <FloatingApplicationField label="Application statement, experience and qualifications" value={motivation} onChange={setMotivation} multiline maxLength={3000} disabled={busy} />
        {driver && <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}><View style={{ flex: 1, minWidth: 220 }}><FloatingApplicationField label="Driver’s license number" value={license.license_number} onChange={value => setLicense(previous => ({ ...previous, license_number: value }))} maxLength={80} disabled={busy} /></View><View style={{ flex: 1, minWidth: 220 }}><FloatingApplicationField label="License expiration date" value={license.license_expires_on} onChange={value => setLicense(previous => ({ ...previous, license_expires_on: value }))} date disabled={busy} /></View></View>}
        <Text style={s.muted}>Application form and supporting files: PDF, JPEG, PNG or WebP. Up to 3 files, 5 MB combined.</Text>
        {documents.map((doc, index) => <View key={index} style={s.row}><FileText size={18} color="#A74646" /><Text style={{ flex: 1 }}>{doc.kind === 'license' ? 'Driver’s license: ' : doc.kind === 'application' ? 'Application form: ' : ''}{doc.name}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${doc.name}`} onPress={() => setDocuments(previous => previous.filter((_, i) => i !== index))}><X size={20} color="#A74646" /></Pressable></View>)}
        {driver ? <View style={[s.row, { alignItems: 'stretch', gap: 16 }]}>{(['license', 'application'] as const).map(kind => <ApplicationUploadCard key={kind} label={kind === 'license' ? 'Driver’s license' : 'Application form'} filename={documents.find(doc => doc.kind === kind)?.name} disabled={busy} onUpload={() => void pick(kind)} onFile={file => void pick(kind, file)} />)}</View> : <View style={[s.row, { alignItems: 'stretch' }]}><ApplicationUploadCard label="Application form and supporting files" filename={documents.map(doc => doc.name).join(', ') || undefined} disabled={busy || documents.length >= 3} onUpload={() => void pick()} onFile={file => void pick(undefined, file)} /></View>}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <View style={{ alignItems: 'flex-end' }}>{button('Register application', () => void submit())}</View>
      </View>
    </> : <>
      <View style={s.row}><View style={{ flex: 1 }}><Text style={s.title}>{admin ? `${driver ? 'Driver' : 'Moderator'} approvals` : `${driver ? 'Driver' : 'Moderator'} Evaluation`}</Text><Text style={s.muted}>Review applicants, retain evaluation records, and track final approval.</Text></View>{button('Refresh list', () => void load(), true)}{!admin && <Pressable accessibilityRole="button" onPress={() => { setRegister(true); setError(''); }} style={s.button}><UserPlus size={18} color="#FFF" /><Text style={s.white}>New registration</Text></Pressable>}</View>
      <View style={s.row}>{(['pending', 'under_review', driver ? 'approved' : 'sent_to_admin', 'rejected'] as const).map((status, index) => { const Icon = [Clock3, ShieldCheck, CheckCircle2, XCircle][index]; return <Pressable key={status} accessibilityRole="button" onPress={() => setFilter(status)} style={[s.metric, { borderLeftColor: stateColor(status) }]}><View><Text style={s.muted}>{labels[status]}</Text><Text style={s.number}>{data?.applications.filter(item => item.status === status).length || 0}</Text></View><Icon size={28} color={stateColor(status)} /></Pressable>; })}</View>
      <View onLayout={event => setListWidth(event.nativeEvent.layout.width)} style={{ flexDirection: sideBySide ? 'row' : 'column', alignItems: 'flex-start', gap: 20 }}>
      <View style={[s.card, { flex: sideBySide ? 1 : undefined, width: sideBySide ? undefined : '100%', minWidth: 0 }]}>
        <View style={s.search}><Search size={18} color="#9A8175" /><TextInput style={{ flex: 1, minWidth: 0, padding: 10 }} value={search} onChangeText={setSearch} placeholder={`Search name, email or ${noun} role`} accessibilityLabel={`Search ${noun}s`} /></View>
        <View style={s.row}>{['all', 'pending', 'under_review', 'sent_to_admin', 'approved', 'rejected', 'active'].map(value => <Pressable accessibilityRole="button" accessibilityState={{ selected: filter === value }} key={value} onPress={() => setFilter(value)} style={[s.chip, value === filter && s.chipActive]}><Text style={{ color: filter === value ? '#FFF' : '#A74646', fontSize: 12 }}>{value === 'all' ? 'All applications' : value === 'active' && driver ? 'Driver accounts' : labels[value]}</Text></Pressable>)}</View>
        <Text style={s.heading}>{filter === 'active' ? `All ${noun} accounts` : `${driver ? 'Driver' : 'Moderator'} applications`}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}><View style={{ minWidth: driver ? 900 : 780, flex: 1 }}>
          <View style={[s.tableRow, { backgroundColor: '#F6E9E2' }]}>{[driver ? 'Driver / applicant' : 'Moderator / applicant', 'Contact', 'Status', 'Submitted / joined', ...(driver ? ['Last GPS activity'] : []), 'Actions'].map((label, i) => <Text key={label} style={[s.cell, { fontWeight: '700', flex: i === 1 ? 1.5 : i === (driver ? 5 : 4) ? 0.6 : 1 }]}>{label}</Text>)}</View>
          {filter === 'active' ? (data?.moderators || []).filter(item => `${item.profile.name} ${item.profile.email}`.toLowerCase().includes(search.toLowerCase())).map(item => <View key={item.id} style={s.tableRow}><View style={s.cell}><Text>{item.profile.name}</Text><Text style={s.muted}>{roleName(item.role)}</Text></View><View style={[s.cell, { flex: 1.5 }]}><Text>{item.profile.email}</Text><Text style={s.muted}>{item.profile.phone}</Text></View><Text style={s.cell}>{item.deactivated ? 'Deactivated' : item.restricted ? 'Restricted' : 'Active'}</Text><Text style={s.cell}>{date(item.profile.joined_at)}</Text>{driver && <Text style={s.cell}>{item.last_active ? new Date(item.last_active).toLocaleString() : 'Not recorded'}</Text>}<View style={[s.cell, { flex: 0.6 }]}>{button('View', () => void openMember(item), true)}</View></View>) : rows.map(item => <View key={item.id} style={s.tableRow}><View style={s.cell}><Text>{item.profile.name}</Text><Text style={s.muted}>{roleName(item.requested_role)} · #{item.id}</Text></View><View style={[s.cell, { flex: 1.5 }]}><Text>{item.profile.email}</Text><Text style={s.muted}>{item.profile.phone}</Text></View><View style={s.cell}><Badge status={item.status} /></View><Text style={s.cell}>{date(item.submitted_at)}</Text>{driver && <Text style={s.cell}>Not applicable</Text>}<View style={[s.cell, { flex: 0.6 }]}>{button('View', () => void open(item), true)}</View></View>)}
        </View></ScrollView>
        {filter !== 'active' && !rows.length && !loading && <Text style={s.muted}>No applications match this view.</Text>}
      </View>
      <View style={[s.card, { width: sideBySide ? 300 : '100%', maxWidth: 360, flexShrink: 0 }]}><ModeratorStatusChart driver={driver} applications={data?.applications || []} loading={loading} /></View>
      </View>
    </>}
    <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={closePreview}><View style={s.overlay}><View style={s.preview}>
      <View style={s.row}><Text style={[s.heading, { flex: 1 }]}>{preview?.label || 'Application attachment'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={closePreview}><X size={24} color="#A74646" /></Pressable></View>
      {previewError ? <Text style={s.error}>{previewError}</Text> : preview ? <View style={{ flex: 1, minHeight: 300 }}><PrivateDocumentPreview {...preview} /></View> : <ActivityIndicator color="#A74646" />}
      {selected && preview && Platform.OS !== 'web' && preview.mime === 'application/pdf' && button('Open PDF', () => { const doc = selected.documents.find(value => value.name === preview.label); if (doc) void downloadProtectedFile(`${endpoint}${selected.id}/documents/${doc.index}/`, doc.name, doc.mime).catch(e => setPreviewError(e.message)); })}
    </View></View></Modal>
  </View>;
}
function ModeratorStatusChart({ applications, loading, driver }: { applications: Application[]; loading: boolean; driver: boolean }) {
  const total = applications.length;
  const segments = ['pending', 'under_review', 'sent_to_admin', 'approved', 'rejected'].map(status => ({ status, count: applications.filter(item => item.status === status).length, color: status === 'approved' ? '#79965E' : stateColor(status) }));
  const circumference = 2 * Math.PI * 66;
  return <View style={{ gap: 12 }}><Text style={s.heading}>Application overview</Text><Text style={s.muted}>All {driver ? 'driver' : 'moderator'} applications</Text>
    {loading ? <ActivityIndicator color="#B95552" /> : <>
      <View style={{ alignSelf: 'center', width: 184, height: 184 }} accessibilityRole="image" accessibilityLabel={segments.map(item => `${labels[item.status]}: ${item.count}`).join(', ')}>
        <Svg width={184} height={184} viewBox="0 0 184 184"><Circle cx={92} cy={92} r={66} fill="none" stroke="#F3E8E0" strokeWidth={22} />{segments.map((item, index) => {
          const length = total ? item.count / total * circumference : 0;
          const start = total ? segments.slice(0, index).reduce((sum, segment) => sum + segment.count, 0) / total * circumference : 0;
          return length > 0 ? <Circle key={item.status} cx={92} cy={92} r={66} fill="none" stroke={item.color} strokeWidth={22} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-start} transform="rotate(-90 92 92)" /> : null;
        })}</Svg>
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}><Text style={s.number}>{total}</Text><Text style={s.muted}>Applications</Text></View>
      </View>
      {segments.map(item => <View key={item.status} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }} /><Text style={[s.muted, { flex: 1 }]}>{labels[item.status]}</Text><Text style={{ color: '#4D3D36', fontSize: 12, fontWeight: '700' }}>{item.count} · {total ? Math.round(item.count / total * 100) : 0}%</Text></View>)}
      {!total && <Text style={s.muted}>No applications yet.</Text>}
    </>}
  </View>;
}
function Badge({ status }: { status: string }) { return <View style={{ alignSelf: 'flex-start', backgroundColor: '#F8EDE7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: stateColor(status), fontSize: 12, fontWeight: '700' }}>{labels[status] || status}</Text></View>; }
function Field({ label, value }: { label: string; value: string }) { return <View style={{ gap: 4 }}><Text style={{ fontWeight: '700', color: '#68554B' }}>{label}</Text><Text>{value}</Text></View>; }
const s = StyleSheet.create({
  title: { fontSize: 25, fontWeight: '700', color: '#A74646' }, heading: { fontSize: 17, fontWeight: '700', color: '#4D3D36' }, muted: { color: '#8A7770', fontSize: 12, lineHeight: 19 }, link: { color: '#A74646', fontWeight: '600' }, white: { color: '#FFF', fontWeight: '700' }, error: { color: '#B03542', backgroundColor: '#FCECEE', padding: 12, borderRadius: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, back: { flexDirection: 'row', gap: 8, alignItems: 'center' }, card: { backgroundColor: '#FFFDF9', borderColor: '#E9D8CE', borderWidth: 1, padding: 20, borderRadius: 17, gap: 17 }, avatar: { width: 110, height: 110, borderRadius: 55 },
  button: { borderRadius: 10, backgroundColor: '#B95552', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, alignSelf: 'flex-start' }, secondary: { borderWidth: 1, borderColor: '#DEC3B8', backgroundColor: '#FFF' }, input: { borderColor: '#D8B7AD', borderWidth: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 14, color: '#4D3D36' },
  chip: { paddingVertical: 9, paddingHorizontal: 13, backgroundColor: '#F5E8E1', borderRadius: 20 }, chipActive: { backgroundColor: '#B95552' }, metric: { flex: 1, minWidth: 170, padding: 18, borderWidth: 1, borderColor: '#E9D8CE', borderLeftWidth: 4, borderRadius: 12, backgroundColor: '#FFF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, number: { color: '#4D3D36', fontSize: 28, fontWeight: '700', marginTop: 7 }, search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2CEC4', borderRadius: 10, paddingLeft: 12, backgroundColor: '#FFF' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: '#EEDFD6' }, cell: { flex: 1, paddingHorizontal: 12, minWidth: 0, gap: 5 }, document: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E6D5CB', padding: 13, borderRadius: 10 }, history: { borderLeftColor: '#C87C6D', borderLeftWidth: 3, paddingLeft: 14, paddingVertical: 6, gap: 5 }, overlay: { flex: 1, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center', padding: 16 }, preview: { width: '100%', maxWidth: 1050, height: '90%', padding: 20, borderRadius: 18, backgroundColor: '#FFFDF9', gap: 16 },
});
