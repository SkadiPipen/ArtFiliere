import { Text } from '@/components/Typography';
import { Pressable, StyleSheet, View } from 'react-native';
import { buyerCommissionFlow } from './buyerCommissionFlow';

export const commissionMoney = (value: unknown) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0);
const date = (value: string) => new Date(value).toLocaleString();

export default function BuyerCommissionOverview({ data, busy, paymentNotice, onFund, onRefresh, onReload, onAgreement, onProposal, onReview, onHelp }: {
  data: any; busy: boolean; paymentNotice: string; onFund: () => void; onRefresh: () => void; onReload: () => void; onAgreement: () => void; onProposal: () => void; onReview: (id?: number) => void; onHelp: () => void;
}) {
  const flow = buyerCommissionFlow(data);
  const terms = Object.keys(data.terms || {}).length ? data.terms : data.proposal?.terms || {};
  const labels = ['Request', 'Agreement', 'Payment', 'Production', flow.physical ? 'Delivery & inspection' : 'Final review', 'Completed'];
  const button = (label: string, onPress: () => void, secondary = false) => <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[s.button, secondary && s.secondary, busy && { opacity: 0.5 }]}><Text style={{ color: secondary ? '#A6453E' : '#FFF', fontWeight: '700', fontSize: 14 }}>{busy ? 'Please wait…' : label}</Text></Pressable>;
  return <View style={{ gap: 16 }}>
    <View style={s.card}>
      <Text style={s.heading}>Commission progress</Text>
      <View style={s.track}>{labels.map((label, index) => <View key={label} accessibilityLabel={`${label}: ${index < flow.step ? 'complete' : index === flow.step ? 'current step' : 'upcoming'}`} style={s.step}>
        <View style={[s.circle, index <= flow.step && s.active]}><Text style={{ color: index <= flow.step ? '#FFF' : '#8A756A', fontWeight: '700' }}>{index < flow.step || (index === 5 && data.status === 'COMPLETE') ? '✓' : index + 1}</Text></View>
        <Text style={[s.stepText, index === flow.step && { color: '#A6453E', fontWeight: '700' }]}>{label}</Text>
      </View>)}</View>
    </View>
    <View style={[s.card, s.next, data.disputed && { borderColor: '#C15656' }]}>
      <Text style={s.eyebrow}>{data.disputed ? 'CUSTOMER SERVICE REVIEW' : 'YOUR NEXT STEP'}</Text>
      <Text style={s.heading}>{flow.title}</Text><Text style={s.body}>{flow.description}</Text>
      {data.fully_signed && !data.funded_at && !!data.funding_due_at && <Text style={s.deadline}>Payment deadline: {date(data.funding_due_at)}</Text>}
      {!!data.funded_at && <Text style={s.body}>Payment verified: {date(data.funded_at)} · Holding balance: {commissionMoney(data.held_amount)}</Text>}
      <View style={s.actions}>
        {flow.action === 'fund' && button(`Fund full commission${terms.price ? ` · ${commissionMoney(terms.price)}` : ''}`, onFund)}
        {flow.action === 'verify' && <>{button('Refresh payment status', onRefresh)}{data.status === 'AWAITING_FUNDS' && button('Return to existing checkout', onFund, true)}</>}
        {flow.action === 'reload' && button('Refresh commission status', onReload)}
        {flow.action === 'agreement' && button('Review agreement and signatures', onAgreement)}
        {flow.action === 'proposal' && button('Review proposal', onProposal)}
        {flow.action === 'review' && button(data.status === 'COMPLETE' ? 'View final stage and files' : 'View active stage', () => onReview(flow.milestoneId))}
        {flow.action === 'help' && button('View dispute and help options', onHelp, true)}
      </View>
      {!data.funded_at && !!paymentNotice && <Text accessibilityLiveRegion="polite" style={s.body}>{paymentNotice}</Text>}
    </View>
  </View>;
}

export function BuyerAgreementSummary({ data, expanded, onToggle, onAgreement }: { data: any; expanded: boolean; onToggle: () => void; onAgreement: () => void }) {
  const terms = Object.keys(data.terms || {}).length ? data.terms : data.proposal?.terms || {};
  const detail = (label: string, value: string) => <View key={label} style={{ width: '47%', flexGrow: 1, gap: 3 }}><Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text></View>;
  return <View style={s.card}>
    <Text style={s.heading}>Agreement at a glance</Text>
    <Text style={s.body}>{data.fully_signed ? 'Signed by both parties · terms locked' : data.agreement_id ? 'Awaiting both signatures' : 'Proposal under review'}</Text>
    <View style={s.actions}>
      {detail('Total to fund', terms.price != null ? commissionMoney(terms.price) : 'Not agreed yet')}
      {detail('Artist net', terms.artist_total != null ? commissionMoney(terms.artist_total) : 'Not agreed yet')}
      {detail('Platform fee · included', terms.platform_fee != null ? commissionMoney(terms.platform_fee) : commissionMoney(data.platform_fee))}
      {detail('Delivery · included', commissionMoney(terms.delivery_fee))}
      {detail('Agreed completion', terms.deadline || data.deadline ? date(terms.deadline || data.deadline) : 'Not agreed yet')}
      {detail('License', `${terms.license_type === 'commercial' ? 'Commercial' : terms.license_type === 'personal' ? 'Personal' : 'Not agreed'}${terms.exclusivity ? ' · ' + String(terms.exclusivity).replace(/_/g, ' ') : ''}`)}
      {detail('Milestone releases', Array.isArray(terms.milestones) ? terms.milestones.map((value: number) => `${value}%`).join(' / ') : 'Not agreed yet')}
      {detail('Deliverable', String(data.art_type || 'Not specified'))}
    </View>
    <Text style={s.body}>One consolidated revision request per stage. Funding the total does not immediately pay the artist.</Text>
    {!!data.agreement_id && <Pressable accessibilityRole="button" onPress={onAgreement} style={s.button}><Text style={s.white}>{data.fully_signed ? 'View signed agreement / PDF' : 'Review agreement and signatures'}</Text></Pressable>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={s.secondaryLink}><Text style={s.link}>{expanded ? 'Hide full proposal breakdown −' : 'View full proposal breakdown +'}</Text></Pressable>
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8DCD4', borderRadius: 16, padding: 20, gap: 12 },
  heading: { color: '#3A2D2A', fontWeight: '800', fontSize: 19 }, body: { color: '#756157', fontSize: 13, lineHeight: 20 },
  track: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 8 }, step: { flex: 1, minWidth: 85, alignItems: 'center', gap: 8 }, circle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1E8E0', alignItems: 'center', justifyContent: 'center' }, active: { backgroundColor: '#C15656' }, stepText: { color: '#8A756A', fontSize: 12, textAlign: 'center' },
  next: { backgroundColor: '#FFF7F2', borderColor: '#DCB4A7' }, eyebrow: { color: '#A6453E', fontWeight: '700', fontSize: 11, letterSpacing: 1 }, deadline: { color: '#A6453E', fontWeight: '600', fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, button: { backgroundColor: '#C15656', paddingHorizontal: 18, paddingVertical: 13, borderRadius: 9, alignSelf: 'flex-start' }, secondary: { backgroundColor: '#F1E4DC' }, label: { color: '#8A756A', fontSize: 12 }, value: { color: '#3A2D2A', fontWeight: '600', fontSize: 14, lineHeight: 20 }, white: { color: '#FFF', fontWeight: '700', fontSize: 13 }, secondaryLink: { paddingVertical: 8 }, link: { color: '#A6453E', fontWeight: '600', fontSize: 13 },
});
