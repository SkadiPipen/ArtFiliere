import { Text, TextInput } from '@/components/Typography';
import CommissionReviews from '@/module/commissions/CommissionReviews';
import { useContext, useEffect, useRef, useState } from 'react';
import { Headset, ShieldCheck, Inbox, RotateCcw, UserCog, LogOut, RefreshCw, Info, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { auth } from '@/firebase/config';
import { AuthContext } from '@/context/AuthContext';
import { purchaseRequest } from '@/services/purchases';
import SupportScreen from '@/module/support/SupportScreen';
import { Action, styles as s } from './ui';
import AppealReviews from './AppealReviews';
import CommissionWorkspace from '@/module/commissions/CommissionWorkspace';

function useWork() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const running = useRef(false);
  const run = async (work: () => Promise<void>) => { if (running.current) return; running.current = true; setBusy(true); setError(''); try { await work(); } catch (e: any) { setError(e.message); } finally { running.current = false; setBusy(false); } };
  return { busy, error, run };
}
function Feedback({ busy, error }: { busy: boolean; error: string }) { return <>{busy && <ActivityIndicator color="#A84949" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}</>; }

function DashboardAction({ title, description, icon: Icon, onPress, selected = false }: { title: string; description: string; icon: LucideIcon; onPress: () => void; selected?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [d.quickCard, selected && d.quickCardSelected, pressed && { opacity: 0.8 }]}>
    <View style={d.actionIcon}><Icon size={23} color="#B65B50" /></View>
    <View style={{ flex: 1, gap: 5 }}><Text style={d.quickTitle}>{title}</Text><Text style={d.muted}>{description}</Text></View>
    <ChevronRight size={18} color="#A84B46" />
  </Pressable>;
}

export default function ModeratorDashboard() {
  const { user, loading } = useContext(AuthContext);
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<{ role: string; is_moderator: boolean; department_label: string } | null>(null);
  const [reports, setReports] = useState(false);
  const [tab, setTab] = useState('overview');
  const work = useWork();
  const load = () => work.run(async () => setProfile(await purchaseRequest('support/catalog/')));
  useEffect(() => { setProfile(null); if (!loading && user) load(); }, [user?.uid, loading]);
  const role = profile?.role;
  if (reports) return <SupportScreen moderator onClose={() => setReports(false)} />;
  return <SafeAreaView style={s.page}>
    <View style={[d.header, width < 600 && { paddingHorizontal: 16, gap: 8 }]}>
      <Image source={require('../../../assets/images/logo.png')} resizeMode="contain" style={d.logo} />
      <View style={{ flex: 1, gap: 3 }}><Text style={d.brand}>ArtFiliere</Text><Text style={d.headerCaption}>{role === 'creative_moderator' ? 'Creative moderation' : 'Customer support workspace'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh support dashboard" disabled={work.busy || !user} onPress={load} style={[d.iconButton, work.busy && { opacity: 0.5 }]}><RefreshCw size={20} color="#A84B46" /></Pressable>
      {user && <Pressable accessibilityRole="button" accessibilityLabel="Log out" disabled={work.busy} onPress={() => work.run(async () => { await auth.signOut(); router.replace('/login'); })} style={d.logout}><LogOut size={17} color="#A84B46" />{width >= 600 && <Text style={d.logoutLabel}>Log Out</Text>}</Pressable>}
    </View>
    <ScrollView contentContainerStyle={[s.content, d.content]}>
      <Feedback {...work} />
      {!user && !loading && <Action label="Sign in" onPress={() => router.replace('/login')} />}
      {user && !profile && <Action label="Retry" disabled={work.busy} onPress={load} />}
      {profile && !profile.is_moderator && <Text style={s.error}>Customer Support or Creative Director access is required.</Text>}
      {profile?.is_moderator && <>
        <View style={d.hero}>
          <View style={d.heroTitleRow}>{role === 'creative_moderator' ? <ShieldCheck size={30} color="#B65B50" /> : <Headset size={30} color="#B65B50" />}<Text style={d.title}>{role === 'creative_moderator' ? 'Creative Director Tickets' : 'Customer Support'}</Text></View>
          <Text style={d.intro}>{role === 'creative_moderator' ? 'Review plagiarism reports, artwork-rejection appeals, and posting-verification requests. Artwork approval and blockchain registration remain in the creative dashboard.' : 'Manage buyer and artist concerns, review returns and refunds, and track account requests in one workspace.'}</Text>
        </View>
        <View style={d.quickActions}>
          <DashboardAction title={role === 'customer_support' ? 'Customer Service Queues' : 'Assigned Tickets'} description="Review waiting concerns and continue your assigned cases." icon={Inbox} onPress={() => setReports(true)} />
          {role === 'creative_moderator' && <DashboardAction title="Artwork Moderation" description="Open artwork approvals and registration reviews." icon={ShieldCheck} onPress={() => router.push('/creative-dashboard')} />}
          {role === 'customer_support' && <>
            <DashboardAction title="Returns & Refunds" description="Review transaction requests and payment concerns." icon={RotateCcw} selected={tab === 'returns'} onPress={() => setTab('returns')} />
            <DashboardAction title="Account Requests" description="Track restriction requests and admin decisions." icon={UserCog} selected={tab === 'actions'} onPress={() => setTab('actions')} />
          </>}
        </View>
        {role === 'customer_support' && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={d.tabs}>
          {[['overview', 'Overview'], ['returns', 'Returns & Refunds'], ['actions', 'Account Requests']].map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[d.tab, tab === value && d.tabActive]}><Text style={[d.tabText, tab === value && d.tabTextActive]}>{label}</Text></Pressable>)}
        </ScrollView>}
        {tab === 'overview' && <View style={d.notice}><Info size={20} color="#A84B46" /><Text style={[s.text, { flex: 1 }]}>Plagiarism reports and artwork-rejection appeals go to the Creative Director. Other concerns enter the shared Customer Support queue. Accept a concern to handle it; transfers require confirmation from the receiving moderator.</Text></View>}
        {role === 'customer_support' && tab === 'actions' && <AccountActions />}
        {role === 'customer_support' && tab === 'returns' && <ReturnRequests />}
        {role === 'customer_support' && <>
          <View style={d.reviewGrid}>
            <View style={{ width: width >= 1000 ? '48%' : '100%', flexGrow: 1 }}><AppealReviews /></View>
            <View style={{ width: width >= 1000 ? '48%' : '100%', flexGrow: 1 }}><CommissionWorkspace review /></View>
          </View>
          <CommissionReviews />
        </>}
      </>}
    </ScrollView>
  </SafeAreaView>;

}

type AccountAction = { id: number; source: 'report' | 'ticket'; report_id?: number; target: string; requested_by: string; ticket_id: number; action: string; duration_days?: number; reason: string; status: string; review_note: string; revoked_at?: string; reversal_reason?: string };
export function AccountActions({ approvals = false }: { approvals?: boolean }) {
  const [rows, setRows] = useState<AccountAction[]>([]); const [next, setNext] = useState<number | null>(null); const [notes, setNotes] = useState<Record<string, string>>({});
  const work = useWork();
  const load = async (offset = 0) => { const data = await purchaseRequest(`moderation/account-actions/?offset=${offset}`); setRows(old => offset ? [...old, ...data.results] : data.results); setNext(data.next_offset); };
  useEffect(() => { work.run(() => load()); }, []);
  return <View style={s.card}><Text style={s.heading}>{approvals ? 'Account action approvals' : 'Account action requests'}</Text><Text style={s.text}>{approvals ? 'Review requests submitted by Customer Support. Only approval changes account access.' : 'Submit a restriction request from a report after choosing the reported account. Track admin decisions here.'}</Text><Action label="Refresh requests" disabled={work.busy} onPress={() => work.run(() => load())} /><Feedback {...work} />
    {!work.busy && !rows.length && <Text>No account action requests.</Text>}
    {rows.map(row => <View key={`${row.source}-${row.id}`} style={s.card}><Text style={s.heading}>{row.target} Â· {row.action}{row.duration_days ? ` (${row.duration_days} days)` : ''}</Text><Text>{row.source === 'report' ? 'Report' : 'Ticket'} #{row.report_id || row.ticket_id} Â· Requested by {row.requested_by}</Text><Text>Status: {row.status}</Text><Text style={s.text}>{row.reason}</Text>{!!row.review_note && <Text>Admin decision: {row.review_note}</Text>}
      {approvals && row.status === 'pending' && <><TextInput accessibilityLabel={`Decision note for request ${row.id}`} style={s.input} multiline value={notes[`${row.source}-${row.id}`] || ''} onChangeText={value => setNotes(old => ({ ...old, [`${row.source}-${row.id}`]: value }))} placeholder="Reason for your decision (5+ characters)" /><View style={s.row}>{['approved', 'rejected'].map(status => <Action key={status} label={status === 'approved' ? 'Approve account action' : 'Reject request'} disabled={work.busy || (notes[`${row.source}-${row.id}`] || '').trim().length < 5} onPress={() => work.run(async () => { await purchaseRequest(`moderation/account-actions/${row.id}/?source=${row.source}`, 'PATCH', { status, review_note: notes[`${row.source}-${row.id}`] }); await load(); })} />)}</View></>}
      {!!row.revoked_at && <Text style={s.text}>Restriction lifted: {row.reversal_reason}</Text>}
      {approvals && row.status === 'approved' && !row.revoked_at && row.action !== 'restore' && <>
        <TextInput accessibilityLabel={`Reason to lift ${row.source} restriction ${row.id}`} style={s.input} multiline value={notes[`${row.source}-${row.id}`] || ''} onChangeText={value => setNotes(old => ({ ...old, [`${row.source}-${row.id}`]: value }))} placeholder="Reason for lifting this restriction" />
        <Action label="Lift restriction" disabled={work.busy || !(notes[`${row.source}-${row.id}`] || '').trim()} onPress={() => work.run(async () => { await purchaseRequest(`moderation/restrictions/${row.source}/${row.id}/reverse/`, 'POST', { reason: notes[`${row.source}-${row.id}`] }); await load(); })} />
      </>}
    </View>)}
    {next !== null && <Action label="More requests" disabled={work.busy} onPress={() => work.run(() => load(next))} />}
  </View>;
}

function ReturnRequests() {
  const [rows, setRows] = useState<any[]>([]); const [notes, setNotes] = useState<Record<number, string>>({}); const work = useWork();
  const load = async () => setRows(await purchaseRequest('moderation/returns/'));
  useEffect(() => { work.run(load); }, []);
  return <View style={s.card}><Text style={s.heading}>Returns and refund reviews</Text><Text style={s.text}>These decisions record support approval. They do not execute payment refunds.</Text><Action label="Refresh requests" disabled={work.busy} onPress={() => work.run(load)} /><Feedback {...work} />{!work.busy && !rows.length && <Text>No requests yet. Review a transaction-linked report to record a return or refund decision.</Text>}{rows.map(row => <View key={row.id} style={s.card}><Text style={s.heading}>{row.artwork} Â· {row.type}</Text><Text>Transaction #{row.payment_id} Â· {row.requester} Â· {row.status}</Text><Text>{row.reason}</Text>{!!row.admin_note && <Text>{row.admin_note}</Text>}{row.status === 'pending' && <><TextInput accessibilityLabel={`Return review note ${row.id}`} style={s.input} value={notes[row.id] || ''} onChangeText={value => setNotes(old => ({ ...old, [row.id]: value }))} placeholder="Decision and next steps" /><View style={s.row}>{['approved', 'declined'].map(status => <Action key={status} label={`${status === 'approved' ? 'Approve' : 'Decline'} review`} disabled={work.busy || (notes[row.id] || '').trim().length < 10} onPress={() => work.run(async () => { await purchaseRequest(`moderation/returns/${row.id}/`, 'PATCH', { status, admin_note: notes[row.id] }); await load(); })} />)}</View></>}</View>)}</View>;
}

const d = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 18, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EFE1DC' },
  logo: { width: 36, height: 36 }, brand: { fontSize: 23, fontFamily: 'LoraSemiBold', fontWeight: '600', color: '#B54848' }, headerCaption: { fontSize: 11, color: '#81756D' },
  iconButton: { width: 40, height: 44, justifyContent: 'center', alignItems: 'center' }, logout: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 42, paddingHorizontal: 12, borderWidth: 1, borderColor: '#BC5555', borderRadius: 10, backgroundColor: '#F5E8E3' }, logoutLabel: { fontSize: 12, fontWeight: '700', color: '#A84B46' },
  content: { maxWidth: 1200, paddingTop: 28, gap: 22 }, hero: { gap: 10 }, heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { flex: 1, fontSize: 28, fontFamily: 'LoraSemiBold', fontWeight: '600', color: '#3A2D2A' }, intro: { color: '#786862', fontSize: 14, lineHeight: 22, maxWidth: 850 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, quickCard: { flex: 1, minWidth: 240, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 14, padding: 16 }, quickCardSelected: { borderColor: '#BC5555', backgroundColor: '#FFF9F6' },
  actionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F5E8E3', alignItems: 'center', justifyContent: 'center' }, quickTitle: { fontSize: 15, fontWeight: '700', color: '#5A3D37' }, muted: { fontSize: 12, lineHeight: 18, color: '#81756D' },
  tabs: { gap: 8, paddingBottom: 2 }, tab: { paddingVertical: 10, paddingHorizontal: 16, minHeight: 42, borderRadius: 22, backgroundColor: '#F5E8E3' }, tabActive: { backgroundColor: '#BC5555' }, tabText: { color: '#A84B46', fontSize: 13, fontWeight: '600' }, tabTextActive: { color: '#FFFFFF' },
  notice: { padding: 16, borderRadius: 12, backgroundColor: '#F5E8E3', flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, reviewGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 },
});
