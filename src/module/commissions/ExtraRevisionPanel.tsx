import { useRef, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import CalendarDateField from '@/components/CalendarDateField';
import { openPaymentCheckout, preparePaymentWindow } from '@/services/paymentReturn';
import { commissionApi } from './commissionApi';

const activeStates = ['REQUESTED', 'QUOTED', 'AWAITING_PAYMENT', 'FUNDED', 'SUBMITTED', 'RECONCILE'];
const labels: Record<string, string> = { REQUESTED: 'Awaiting artist quote', QUOTED: 'Quote ready', AWAITING_PAYMENT: 'Awaiting verified payment', FUNDED: 'Paid · artist working', SUBMITTED: 'Extra work ready for review', APPROVED: 'Approved · artist credited to wallet', DECLINED: 'Declined · no charge', EXPIRED: 'Expired', RECONCILE: 'Payment needs support review', REFUNDED: 'Refunded to buyer wallet' };
export const hasActiveExtraRevision = (data: any) => data.extra_revisions?.some((r: any) => activeStates.includes(r.status));
export const hasFundedExtraRevision = (data: any) => data.extra_revisions?.some((r: any) => r.status === 'FUNDED');

export default function ExtraRevisionPanel({ data, onUpdated, disabled }: { data: any; onUpdated: () => void; disabled?: boolean }) {
  const [requesting, setRequesting] = useState(false);
  const [comment, setComment] = useState('');
  const [scope, setScope] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const final = data.milestones?.find((m: any) => m.number === 3);
  const history = data.extra_revisions || [];
  const active = history.find((r: any) => activeStates.includes(r.status));
  const latest = final?.submissions?.[final.submissions.length - 1];
  const canRequest = !data.is_artist && data.status === 'STAGE_3' && final?.status === 'SUBMITTED' && final.revision_used && !final.delivery_ready_at && !active && !history.some((r: any) => r.source_submission_id === latest?.id);
  if (!history.length && !canRequest) return null;
  const act = async (action: string, extra: any = {}) => {
    if (lock.current || disabled || (data.disputed && action !== 'refresh_extra_payment')) return;
    lock.current = true; setBusy(true); setError('');
    const paymentTab = action === 'pay_extra_revision' ? preparePaymentWindow() : null;
    let opened = false;
    try {
      const result = await commissionApi(`flow/${data.id}/`, { action, extra_revision_id: active?.id, ...extra });
      if (action === 'pay_extra_revision') {
        if (!result.checkout_url) throw new Error('Checkout is not confirmed yet. Retry to reconcile the same payment reference.');
        await openPaymentCheckout(result.checkout_url, 'commission_extra', data.id, paymentTab, active.id); opened = true;
      }
      setRequesting(false); setComment(''); onUpdated();
    } catch (e: any) { setError(e.message || 'Unable to update the extra revision.'); }
    finally { if (!opened) paymentTab?.close(); lock.current = false; setBusy(false); }
  };
  const button = (label: string, onPress: () => void, secondary = false, allowFrozen = false) => <TouchableOpacity accessibilityRole="button" disabled={disabled || busy || (data.disputed && !allowFrozen)} onPress={onPress} style={{ padding: 12, borderRadius: 9, alignSelf: 'flex-start', backgroundColor: secondary ? '#FAECE8' : '#C15656', opacity: disabled || busy || (data.disputed && !allowFrozen) ? 0.5 : 1 }}><Text style={{ color: secondary ? '#A43F48' : '#FFF', fontWeight: '700', textAlign: 'center' }}>{label}</Text></TouchableOpacity>;
  return <View style={{ padding: 16, borderWidth: 1, borderColor: '#E9C9C2', borderRadius: 12, gap: 12, backgroundColor: '#FFF' }}>
    <Text style={{ fontWeight: '800', fontSize: 18, color: '#A43F48' }}>Extra final-stage revision</Text>
    <Text>New preferences or added scope may require payment. Corrections needed to meet your signed agreement are free—use Need help / dispute if there is a disagreement.</Text>
    <Text>One active request at a time. Quotes cover one additional submission. Both parties must agree to the scope, total price and deadline. Physical changes are available before dispatch preparation only.</Text>
    {canRequest && !requesting && button('Request extra revision', () => setRequesting(true))}
    {canRequest && requesting && <>
      <TextInput multiline maxLength={2000} placeholder="Describe the extra changes (artist will provide a quote)" value={comment} onChangeText={setComment} style={field} />
      <View style={row}>{button('Send request', () => void act('request_extra_revision', { comment }))}{button('Cancel', () => setRequesting(false), true)}</View>
    </>}
    {history.map((r: any) => <View key={r.id} style={{ gap: 8, paddingTop: 12, borderTopWidth: 1, borderColor: '#EFDED8' }}>
      <Text style={{ fontWeight: '700' }}>Request #{r.id} · {labels[r.status] || r.status}</Text>
      <Text>{r.request}</Text>
      {!!r.scope && <><Text>Agreed scope: {r.scope}</Text><Text>Total ₱{r.amount} · Platform fee ₱{r.platform_fee} · Artist net ₱{r.artist_amount}</Text><Text>Completion deadline: {new Date(r.due_at).toLocaleString()}</Text></>}
      {['REQUESTED', 'QUOTED', 'AWAITING_PAYMENT'].includes(r.status) && <Text>Response/payment deadline: {new Date(r.response_due_at).toLocaleString()}. Final-stage review is paused.</Text>}
      {r.funded_at && <Text>Verified payment · Separate funds held: ₱{r.held_amount}</Text>}
    </View>)}
    {active?.status === 'REQUESTED' && data.is_artist && <>
      <TextInput multiline maxLength={2000} placeholder="Exact scope covered by this quote" value={scope} onChangeText={setScope} style={field} />
      <TextInput keyboardType="decimal-pad" placeholder="Buyer total PHP (platform fee included)" value={amount} onChangeText={setAmount} style={field} />
      <Text>Choose a completion date at least three days from today. Deadline is 11:59 PM in your local time.</Text>
      <CalendarDateField value={date} onChange={setDate} label="Extra revision completion date" minimumDate={new Date(Date.now() + 3*86400000)} />
      {button('Send quote', () => { const due = new Date(`${date}T23:59:00`); if (Number.isNaN(due.getTime())) { setError('Select the completion date.'); return; } void act('quote_extra_revision', { scope, amount, due_at: due.toISOString() }); })}
    </>}
    {active && ['REQUESTED', 'QUOTED'].includes(active.status) && button(data.is_artist ? 'Decline request' : 'Decline / withdraw request', () => void act('decline_extra_revision'), true)}
    {active && !data.is_artist && ['QUOTED', 'AWAITING_PAYMENT'].includes(active.status) && <>
      <Text>By continuing, you accept the displayed scope, total, deadline and one additional submission. Work starts after verified payment. Original milestone funds remain separate.</Text>
      {button(active.status === 'QUOTED' ? 'Accept quote and pay' : 'Continue payment', () => void act('pay_extra_revision', { accept_quote: true }))}
    </>}
    {active && ['AWAITING_PAYMENT', 'RECONCILE'].includes(active.status) && button('Check extra payment', () => void act('refresh_extra_payment'), true, true)}
    {active?.status === 'FUNDED' && <Text>Payment confirmed. The artist can use the stage upload button to submit the extra work.</Text>}
    {active?.status === 'SUBMITTED' && !data.is_artist && <><Text>Inspect the latest final-stage submission below before approving. This releases only the extra revision payment to the artist’s wallet.</Text>{button('Approve extra revision', () => void act('approve_extra_revision'))}</>}
    {active?.status === 'RECONCILE' && <Text>Support must reconcile this payment before work or final approval can continue.</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A13030' }}>{error}</Text>}
  </View>;
}
const field = { padding: 12, borderWidth: 1, borderColor: '#C15656', borderRadius: 9, backgroundColor: '#FFF', color: '#40322E' } as const;
const row = { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } as const;
