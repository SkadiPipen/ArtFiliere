import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { purchaseRequest } from '@/services/purchases';
import { Action, styles as s } from './ui';

type Member = { id: number; username: string; role: string; restricted: boolean };
export default function TicketActions({ ticket, role, onUpdated }: { ticket: { id: number; reference?: { id: number; kind: string } }; role: string; onUpdated: () => Promise<void> }) {
  const [query, setQuery] = useState(''); const [members, setMembers] = useState<Member[]>([]);
  const [target, setTarget] = useState<Member | null>(null); const [reason, setReason] = useState('');
  const [days, setDays] = useState('7'); const [action, setAction] = useState<'suspend' | 'ban' | 'restore'>('suspend');
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await work(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  if (role === 'creative_moderator') return <Action label="Open artwork moderation and appeals" onPress={() => router.push({ pathname: '/creative-dashboard', params: { artworkId: ticket.reference?.kind === 'artwork' ? String(ticket.reference.id) : '' } })} />;
  if (role !== 'customer_support') return null;
  const review = (type: 'return' | 'refund', status: 'approved' | 'declined') => run(async () => {
    const data = await purchaseRequest(`moderation/tickets/${ticket.id}/return-review/`, 'POST', { type, status, note });
    setMessage(data.message); setNote(''); await onUpdated();
  });
  return <View style={s.card}>
    {ticket.reference?.kind === 'payment' && <><Text style={s.heading}>Return / refund review</Text><Text style={s.text}>Record your review decision and instructions for the customer. A review approval does not transfer money or confirm refund settlement.</Text><TextInput accessibilityLabel="Return or refund review note" style={s.input} multiline maxLength={2000} value={note} onChangeText={setNote} placeholder="Explain the decision and next steps (10+ characters)" /><View style={s.row}>{(['return', 'refund'] as const).map(type => <View key={type} style={s.row}><Action disabled={busy || note.trim().length < 10} label={`Approve ${type} review`} onPress={() => review(type, 'approved')} /><Action disabled={busy || note.trim().length < 10} label={`Decline ${type}`} onPress={() => review(type, 'declined')} /></View>)}</View></>}
    <Text style={s.heading}>Request account action</Text><Text style={s.text}>Select the reported buyer or artist. Suspension, ban, and restoration requests take effect only after admin approval.</Text>
    <TextInput accessibilityLabel="Search reported account" style={s.input} value={query} onChangeText={setQuery} placeholder="Search by username or name" />
    <Action label="Find account" disabled={busy || !query.trim()} onPress={() => run(async () => { const data = await purchaseRequest(`moderation/users/?q=${encodeURIComponent(query)}`); setMembers(data.results); if (!data.results.length) setMessage('No matching accounts.'); })} />
    {members.map(u => <Action key={u.id} label={`${target?.id === u.id ? 'Selected: ' : ''}${u.username} (${u.role})${u.restricted ? ' — restricted' : ''}`} disabled={busy} onPress={() => setTarget(u)} />)}
    {target && <><Text style={s.heading}>Account: {target.username}</Text><View style={s.row}>{(['suspend', 'ban', 'restore'] as const).map(a => <Action key={a} label={`${action === a ? 'Selected: ' : ''}${a}`} disabled={busy} onPress={() => setAction(a)} />)}</View>
      {action === 'suspend' && <TextInput accessibilityLabel="Suspension days" style={s.input} value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="Days (1–365)" />}
      <TextInput accessibilityLabel="Reason for account action" style={s.input} multiline maxLength={4000} value={reason} onChangeText={setReason} placeholder="Explain the evidence and requested action (10+ characters)" />
      <Action label="Send request for admin approval" disabled={busy || reason.trim().length < 10 || (action === 'suspend' && (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 365))} onPress={() => run(async () => { await purchaseRequest('moderation/account-actions/', 'POST', { ticket_id: ticket.id, target_id: target.id, action, duration_days: action === 'suspend' ? Number(days) : null, reason }); setMessage('Request sent for admin approval. No account restriction has been applied.'); setTarget(null); setReason(''); })} />
    </>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!message && <Text style={s.success}>{message}</Text>}
  </View>;
}
