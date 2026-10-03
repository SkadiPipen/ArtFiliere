import { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { auth } from '@/firebase/config';
import { AuthContext } from '@/context/AuthContext';
import { purchaseRequest } from '@/services/purchases';
import SupportScreen from '@/module/support/SupportScreen';
import { Action, styles as s } from './ui';

function useWork() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const running = useRef(false);
  const run = async (work: () => Promise<void>) => { if (running.current) return; running.current = true; setBusy(true); setError(''); try { await work(); } catch (e: any) { setError(e.message); } finally { running.current = false; setBusy(false); } };
  return { busy, error, run };
}
function Feedback({ busy, error }: { busy: boolean; error: string }) { return <>{busy && <ActivityIndicator color="#A84949" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}</>; }

export default function ModeratorDashboard() {
  const { user, loading } = useContext(AuthContext);
  const [profile, setProfile] = useState<{ role: string; is_moderator: boolean; department_label: string } | null>(null);
  const [reports, setReports] = useState(false);
  const [tab, setTab] = useState('overview');
  const work = useWork();
  const load = () => work.run(async () => setProfile(await purchaseRequest('support/catalog/')));
  useEffect(() => { setProfile(null); if (!loading && user) load(); }, [user?.uid, loading]);
  const role = profile?.role;
  if (reports) return <SupportScreen moderator onClose={() => setReports(false)} />;
  return <SafeAreaView style={s.page}>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.row}><Text style={s.title}>{role === 'creative_moderator' ? 'Creative Director tickets' : 'Customer Support'}</Text><Action label="Log out" onPress={() => work.run(async () => { await auth.signOut(); router.replace('/login'); })} /></View>
      <Feedback {...work} />
      {!user && !loading && <Action label="Sign in" onPress={() => router.replace('/login')} />}
      {user && !profile && <Action label="Retry" disabled={work.busy} onPress={load} />}
      {profile && !profile.is_moderator && <Text style={s.error}>Customer Support or Creative Director access is required.</Text>}
      {profile?.is_moderator && <>
        <Text style={s.heading}>{profile.department_label}</Text>
        <Text style={s.text}>{role === 'creative_moderator' ? 'Review plagiarism reports, artwork-rejection appeals, and posting-verification requests. Artwork approval and blockchain registration remain in the creative dashboard.' : 'Handle buyer and artist reports, review returns and refunds, and request account restrictions for admin approval.'}</Text>
        <View style={s.row}><Action label={role === 'customer_support' ? 'Open customer service queues' : 'Open assigned tickets'} onPress={() => setReports(true)} />
          {role === 'creative_moderator' && <Action label="Open artwork moderation" onPress={() => router.push('/creative-dashboard')} />}
          {role === 'customer_support' && <><Action label="Return / refund requests" onPress={() => setTab('returns')} /><Action label="Account action requests" onPress={() => setTab('actions')} /></>}
        </View>
        {tab === 'overview' && <View style={s.card}><Text style={s.text}>Plagiarism reports and artwork-rejection appeals are automatically assigned to the Creative Director. Other reports enter the shared Customer Support waiting queue. Accept a concern to handle it exclusively. Transfers require confirmation from the receiving moderator.</Text></View>}
        {role === 'customer_support' && tab === 'actions' && <AccountActions />}
        {role === 'customer_support' && tab === 'returns' && <ReturnRequests />}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

type AccountAction = { id: number; target: string; requested_by: string; ticket_id: number; action: string; duration_days?: number; reason: string; status: string; review_note: string };
export function AccountActions({ approvals = false }: { approvals?: boolean }) {
  const [rows, setRows] = useState<AccountAction[]>([]); const [next, setNext] = useState<number | null>(null); const [notes, setNotes] = useState<Record<number, string>>({});
  const work = useWork();
  const load = async (offset = 0) => { const data = await purchaseRequest(`moderation/account-actions/?offset=${offset}`); setRows(old => offset ? [...old, ...data.results] : data.results); setNext(data.next_offset); };
  useEffect(() => { work.run(() => load()); }, []);
  return <View style={s.card}><Text style={s.heading}>{approvals ? 'Account action approvals' : 'Account action requests'}</Text><Text style={s.text}>{approvals ? 'Review requests submitted by Customer Support. Only approval changes account access.' : 'Submit a restriction request from a report after choosing the reported account. Track admin decisions here.'}</Text><Action label="Refresh requests" disabled={work.busy} onPress={() => work.run(() => load())} /><Feedback {...work} />
    {!work.busy && !rows.length && <Text>No account action requests.</Text>}
    {rows.map(row => <View key={row.id} style={s.card}><Text style={s.heading}>{row.target} · {row.action}{row.duration_days ? ` (${row.duration_days} days)` : ''}</Text><Text>Report #{row.ticket_id} · Requested by {row.requested_by}</Text><Text>Status: {row.status}</Text><Text style={s.text}>{row.reason}</Text>{!!row.review_note && <Text>Admin decision: {row.review_note}</Text>}
      {approvals && row.status === 'pending' && <><TextInput accessibilityLabel={`Decision note for request ${row.id}`} style={s.input} multiline value={notes[row.id] || ''} onChangeText={value => setNotes(old => ({ ...old, [row.id]: value }))} placeholder="Reason for your decision (5+ characters)" /><View style={s.row}>{['approved', 'rejected'].map(status => <Action key={status} label={status === 'approved' ? 'Approve account action' : 'Reject request'} disabled={work.busy || (notes[row.id] || '').trim().length < 5} onPress={() => work.run(async () => { await purchaseRequest(`moderation/account-actions/${row.id}/`, 'PATCH', { status, review_note: notes[row.id] }); await load(); })} />)}</View></>}
    </View>)}
    {next !== null && <Action label="More requests" disabled={work.busy} onPress={() => work.run(() => load(next))} />}
  </View>;
}

function ReturnRequests() {
  const [rows, setRows] = useState<any[]>([]); const [notes, setNotes] = useState<Record<number, string>>({}); const work = useWork();
  const load = async () => setRows(await purchaseRequest('moderation/returns/'));
  useEffect(() => { work.run(load); }, []);
  return <View style={s.card}><Text style={s.heading}>Returns and refund reviews</Text><Text style={s.text}>These decisions record support approval. They do not execute payment refunds.</Text><Action label="Refresh requests" disabled={work.busy} onPress={() => work.run(load)} /><Feedback {...work} />{!work.busy && !rows.length && <Text>No requests yet. Review a transaction-linked report to record a return or refund decision.</Text>}{rows.map(row => <View key={row.id} style={s.card}><Text style={s.heading}>{row.artwork} · {row.type}</Text><Text>Transaction #{row.payment_id} · {row.requester} · {row.status}</Text><Text>{row.reason}</Text>{!!row.admin_note && <Text>{row.admin_note}</Text>}{row.status === 'pending' && <><TextInput accessibilityLabel={`Return review note ${row.id}`} style={s.input} value={notes[row.id] || ''} onChangeText={value => setNotes(old => ({ ...old, [row.id]: value }))} placeholder="Decision and next steps" /><View style={s.row}>{['approved', 'declined'].map(status => <Action key={status} label={`${status === 'approved' ? 'Approve' : 'Decline'} review`} disabled={work.busy || (notes[row.id] || '').trim().length < 10} onPress={() => work.run(async () => { await purchaseRequest(`moderation/returns/${row.id}/`, 'PATCH', { status, admin_note: notes[row.id] }); await load(); })} />)}</View></>}</View>)}</View>;
}
