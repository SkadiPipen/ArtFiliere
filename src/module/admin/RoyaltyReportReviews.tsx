import { Text, TextInput } from '@/components/Typography';
import { markAdminQueueRead } from '@/services/adminNotifications';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';
import { downloadProtectedFile } from '@/services/purchases';

type Report = { id: number; title: string; buyer: string; artist: string; status: string; amount: string | null; report_due_on: string; due_on: string; payment_status: string; metrics: Record<string, string>; evidence: { name: string; path: string }[] };
async function request(path = '', body?: object) {
  const token = await auth.currentUser?.getIdToken();
  return readApiResponse(await fetch(`${API_URL}/api/users/royalties/admin/reports/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
}
function ReviewCard({ report, refresh }: { report: Report; refresh: () => Promise<void> }) {
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const act = async (action: string) => {
    setBusy(true); setError('');
    try { await request(`${report.id}/`, { action, ...(action === 'reject' ? { note: note.trim() } : {}) }); setRejecting(false); setNote(''); await refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5DAD3', gap: 10 }}>
    <Text style={{ fontWeight: '700', fontSize: 17 }}>#{report.id} · {report.title}</Text>
    <Text>Buyer: {report.buyer} · Artist: {report.artist}</Text>
    <Text>Report: {report.status} · Payment: {report.payment_status}</Text>
    <Text>Report due {report.report_due_on} · Payment due {report.due_on}</Text>
    <Text style={{ fontWeight: '700' }}>Royalty: PHP {report.amount}</Text>
    {Object.entries(report.metrics).map(([key, value]) => <Text key={key}>{key.replaceAll('_', ' ')}: {value}</Text>)}
    {report.evidence.map(file => <Pressable key={file.path} disabled={busy} onPress={async () => { try { await downloadProtectedFile('users/' + file.path, file.name); } catch (e: any) { setError(e.message); } }}><Text style={{ color: '#A33F45', paddingVertical: 6 }}>Review evidence: {file.name}</Text></Pressable>)}
    <Text>Verify figures and attachments before release. Release credits the artist’s available wallet; it does not initiate a bank withdrawal.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <Pressable accessibilityRole="button" disabled={busy || report.status !== 'submitted' || report.payment_status !== 'not_started'} onPress={() => { setRejecting(true); setError(''); }} style={{ padding: 13, borderRadius: 8, backgroundColor: '#FFF1F0', opacity: busy || report.status !== 'submitted' || report.payment_status !== 'not_started' ? 0.5 : 1 }}><Text style={{ fontWeight: '700', color: '#B91C1C' }}>Reject</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || rejecting || !(report.payment_status === 'held' || (report.amount === '0.00' && report.status === 'submitted'))} onPress={() => act('release')} style={{ padding: 13, backgroundColor: '#EAF5ED', borderRadius: 8, opacity: busy || rejecting || !(report.payment_status === 'held' || (report.amount === '0.00' && report.status === 'submitted')) ? 0.5 : 1 }}><Text style={{ fontWeight: '700', color: '#477452' }}>Confirm payment</Text></Pressable>
    </View>
    {report.payment_status !== 'held' && report.amount !== '0.00' && <Text style={{ fontSize: 12, color: '#81756D' }}>Confirm payment becomes available after the buyer's payment is verified and held.</Text>}
    {report.status === 'submitted' && report.payment_status === 'not_started' && rejecting && <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) { setRejecting(false); setNote(''); } }}><View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.35)' }}><View style={{ width: '100%', maxWidth: 520, gap: 10, padding: 20, borderWidth: 1, borderColor: '#E5DAD3', backgroundColor: '#FFF', borderRadius: 12 }}>
      <Text style={{ fontWeight: '600' }}>Reason for rejection<Text style={{ color: '#B91C1C' }}> *</Text></Text>
      <TextInput accessibilityLabel={`Rejection reason for report ${report.id}`} autoFocus editable={!busy} placeholder="Explain what the buyer needs to correct" value={note} onChangeText={setNote} multiline maxLength={1000} style={{ borderWidth: 1, borderColor: '#DCD5CF', borderRadius: 8, padding: 12, backgroundColor: '#FFF', minHeight: 80, textAlignVertical: 'top' }} />
      <View style={{ flexDirection: 'row', gap: 16 }}><Pressable accessibilityRole="button" disabled={busy || !note.trim()} onPress={() => act('reject')}><Text style={{ padding: 10, color: '#B91C1C', opacity: busy || !note.trim() ? 0.5 : 1 }}>Confirm rejection</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => { setRejecting(false); setNote(''); setError(''); }}><Text style={{ padding: 10, color: '#81756D' }}>Cancel</Text></Pressable></View>
    </View></View></Modal>}
    {report.payment_status === 'held' && <Text style={{ fontSize: 12, color: '#81756D' }}>If a paid report is incorrect, keep funds held and resolve the correction or refund through support.</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}
  </View>;
}
export default function RoyaltyReportReviews() {
  const [rows, setRows] = useState<Report[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const load = useCallback(async () => { try { const result: Report[] = await request(); setRows(result); void markAdminQueueRead('royalty_report', result.map(row => row.id)); setError(''); } catch (e: any) { setError(e.message); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <View style={{ gap: 14 }}><Text style={{ fontSize: 23, fontWeight: '700', color: '#70482F' }}>Royalty report verification</Text><Text>Buyer payments stay held until you verify the report and release them.</Text><Pressable onPress={load}><Text style={{ color: '#A33F45', fontWeight: '700' }}>Refresh royalty reviews</Text></Pressable>{loading && <ActivityIndicator />}{!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}{!loading && !error && !rows.length && <Text>No royalty reports awaiting review.</Text>}{rows.map(report => <ReviewCard key={report.id} report={report} refresh={load} />)}</View>;
}
