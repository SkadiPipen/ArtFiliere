import { Text, TextInput } from '@/components/Typography';
import { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { commissionApi } from './CommissionDetailScreen';

export default function CommissionReviews() {
  const [rows, setRows] = useState<any[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [refundIds, setRefundIds] = useState<Record<number, string>>({});
  const [payoutIds, setPayoutIds] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => { try { setRows(await commissionApi('reviews/')); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, []);
  const decide = async (row: any, action: string, milestone_id?: number, refund_id?: number) => {
    setBusy(true); setError('');
    try { const result = await commissionApi(`reviews/${row.id}/`, { action, reason: notes[row.id], amount: amounts[row.id], milestone_id, refund_id, provider_id: refund_id ? refundIds[refund_id] : milestone_id ? payoutIds[milestone_id] : undefined }); if (result.detail) setError(result.detail); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const button = (label: string, onPress: () => void) => <TouchableOpacity disabled={busy} onPress={onPress} style={{ padding: 12, backgroundColor: '#F6E8E1', borderRadius: 8 }}><Text style={{ color: '#A74646', fontWeight: '700' }}>{label}</Text></TouchableOpacity>;
  return <View style={{ padding: 18, gap: 12, backgroundColor: '#FFFFFF', borderRadius: 14, marginVertical: 12 }}>
    <Text style={{ fontSize: 20, fontWeight: '700' }}>Commission disputes & payouts</Text>
    {button('Refresh commission reviews', load)}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A13030' }}>{error}</Text>}
    {!rows.length && <Text>No commission reviews pending.</Text>}
    {rows.map(row => <View key={row.id} style={{ padding: 16, borderWidth: 1, borderColor: '#E8DCD4', gap: 10 }}>
      <Text style={{ fontWeight: '700' }}>{row.title} · {row.buyer} / {row.artist}</Text><Text>{row.status} · Unreleased PHP {row.held_amount}</Text>
      {row.tickets.map((ticket: any) => <Text key={ticket.id}>Ticket #{ticket.id} ({ticket.status}): {ticket.details}</Text>)}
      {row.refunds.map((refund: any) => <View key={refund.id} style={{ gap: 8 }}><Text>Refund #{refund.id}: PHP {refund.amount} · {refund.status}</Text>
        {refund.status === 'CONFIG_REQUIRED' && button('Process existing authorized refund', () => decide(row, 'process_authorized_refund', undefined, refund.id))}
        {['RECONCILE', 'PROCESSING'].includes(refund.status) && <><TextInput placeholder="Provider refund ID (rfd-...) if unknown" value={refundIds[refund.id] || ''} onChangeText={text => setRefundIds({ ...refundIds, [refund.id]: text })} style={{ padding: 12, borderWidth: 1, borderColor: '#DDD' }} />{button('Verify provider refund', () => decide(row, 'reconcile_refund', undefined, refund.id))}</>}
      </View>)}
      <TextInput multiline placeholder="Decision reason (required)" value={notes[row.id] || ''} onChangeText={text => setNotes({ ...notes, [row.id]: text })} style={{ padding: 12, borderWidth: 1, borderColor: '#DDD' }} />
      <TextInput placeholder="Compensation PHP (unreleased funds only)" value={amounts[row.id] || ''} onChangeText={text => setAmounts({ ...amounts, [row.id]: text })} keyboardType="decimal-pad" style={{ padding: 12, borderWidth: 1, borderColor: '#DDD' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{button('Resolve / resume', () => decide(row, 'resume'))}{button('Authorize wallet credit', () => decide(row, 'wallet_credit'))}{button('Authorize Xendit refund', () => decide(row, 'refund'))}</View>
      {row.payouts.map((p: any) => <View key={p.id}><Text>Stage {p.stage}: {p.status} · PHP {p.amount}</Text>{p.status === 'RECONCILE' && <TextInput placeholder="Matching Xendit payout ID (po-...)" value={payoutIds[p.id] || ''} onChangeText={text => setPayoutIds({ ...payoutIds, [p.id]: text })} style={{ padding: 12, borderWidth: 1, borderColor: '#DDD' }} />}{button('Reconcile provider payout', () => decide(row, 'reconcile_payout', p.id))}{['FAILED', 'REJECTED', 'REVERSED'].includes(p.status) && button('Retry verified failed payout', () => decide(row, 'retry_failed_payout', p.id))}</View>)}
    </View>)}
  </View>;
}
