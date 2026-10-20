import NegotiationHistory, { ChangeHighlights } from './NegotiationHistory';
import CopyrightProposalSummary from './CopyrightProposalSummary';
import AgreementCheckout from './AutomaticCheckout';
import { contractChanges } from './negotiationThreads';
import type { ChatMessage } from './chats';
import { router } from 'expo-router';
import SigningModal from './SigningModal';
import ArtworkPreview from './ArtworkPreview';
import { auth } from '@/firebase/config';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, FileText, MessageSquare } from 'lucide-react-native';
import { Contract, contractRequest, isAgreed } from './contracts';

export default function ProposalCard({ contract, history = [contract], legacyHistory = [], onChange, onRevise }: { contract: Contract; history?: Contract[]; legacyHistory?: ChatMessage[]; onChange: () => void; onRevise: (contract: Contract) => void }) {
  const changes = contractChanges(contract, history[history.length - 2]);
  const priceChange = changes.find(c => /total|price/i.test(c.label));
  const [signing, setSigning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const agreed = isAgreed(contract), closed = contract.status === 'cancelled';
  const attempts = history.length + legacyHistory.length;
  const image = contract.image_url || legacyHistory[legacyHistory.length - 1]?.artworkImageUri;
  const decide = async (action: string) => {
    setBusy(true); setError('');
    try { await contractRequest(`${contract.id}/`, 'PATCH', { action }); onChange(); if (action === 'accept') setSigning(true); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <View style={s.card}>
    {signing && <SigningModal id={contract.id} onClose={() => setSigning(false)} onSigned={onChange} />}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${contract.title}. ${expanded ? 'Hide' : 'Show'} negotiation details`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} activeOpacity={0.8} style={s.header}>
      <ArtworkPreview uri={image} title={contract.title} />
      <View style={s.summary}>
        <Text numberOfLines={2} style={s.title}>{contract.title}</Text>
        <Text style={s.role}>{contract.buyer_uid === auth.currentUser?.uid ? "You're buying" : contract.artist_uid === auth.currentUser?.uid ? "You're selling" : ''}</Text>
        <View style={s.statusRow}>
          <View style={[s.badge, { backgroundColor: agreed ? '#E5F3E9' : closed ? '#F0ECE9' : '#FFF0BF' }]}><View style={[s.dot, { backgroundColor: agreed ? '#286647' : closed ? '#776B66' : '#94620C' }]} /><Text style={[s.badgeText, { color: agreed ? '#286647' : closed ? '#776B66' : '#94620C' }]}>{agreed ? 'AGREED' : closed ? 'CLOSED' : 'PENDING'}</Text></View>
          <Text style={s.attempts}>{attempts} {attempts === 1 ? 'attempt' : 'attempts'}</Text>
        </View>
      </View>
      {expanded ? <ChevronUp size={22} color="#BD604E" /> : <ChevronDown size={22} color="#BD604E" />}
    </TouchableOpacity>
    {contract.proposed_by && <Text style={s.actor}>{contract.proposed_by.name} ({contract.proposed_by.role}) {contract.attempt_action === 'edited' ? 'edited this offer' : contract.attempt_action === 'renegotiated' ? 'sent this back to renegotiate' : 'sent this offer'}</Text>}
    {contract.cancelled_by && <Text style={[s.actor, { color: '#B04444' }]}>Cancelled by {contract.cancelled_by.name}{contract.cancelled_at ? ` on ${new Date(contract.cancelled_at).toLocaleString()}` : ''}</Text>}
    <View style={s.offerBar}>
      <View style={{ flex: 1, gap: 4 }}><Text style={s.eyebrow}>LATEST OFFER</Text><Text style={s.role}>{agreed ? 'Agreed' : closed ? 'Rejected or replaced' : 'Awaiting acceptance'}</Text></View>
      <View style={{ alignItems: 'flex-end', flexShrink: 1 }}><Text style={s.currency}>PHP</Text><Text style={s.price}>{Number.isFinite(Number(contract.price)) ? Number(contract.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : contract.price}</Text></View>
    </View>
    {!!priceChange && <View style={s.changePill}><Text style={s.changeText}>Price changed: <Text style={{ textDecorationLine: 'line-through', color: '#9A8B82', fontWeight: '400' }}>{priceChange.before}</Text>{'  '}<Text style={{ color: '#BC3535', fontWeight: '800' }}>{priceChange.after}</Text></Text></View>}
    <CopyrightProposalSummary transfer={contract.license_scope?.copyright_transfer} />
    {!contract.commission_id && !signing && agreed && contract.fully_signed && contract.buyer_uid === auth.currentUser?.uid && contract.checkout_status !== 'paid' && <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}><AgreementCheckout id={contract.id} onChange={onChange} /></View>}
    {agreed && <View style={s.agreedActions}>
      <TouchableOpacity accessibilityRole="button" onPress={() => setSigning(true)} style={s.secondaryButton}><FileText size={16} color="#A24F41" /><Text style={s.secondaryText}>Sign / preview agreement PDF</Text></TouchableOpacity>
      {['royalty', 'hybrid'].includes(contract.compensation_type || '') && <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/royalty-reports' as any)} style={s.secondaryButton}><Text style={s.secondaryText}>Royalty reports / Payments</Text></TouchableOpacity>}
    </View>}
    {expanded && <View style={s.details}>
      {!!changes.length && <View style={{ gap: 12 }}><Text style={s.sectionTitle}>Changes in the latest offer</Text><ChangeHighlights changes={changes} /></View>}
      <View style={s.terms}><Text style={s.eyebrow}>CURRENT TERMS</Text><Text selectable style={s.termsText}>{contract.terms}</Text></View>
      <View style={s.acceptanceRow}>
        <View style={[s.acceptance, contract.buyer_accepted && s.accepted]}><Text style={s.acceptanceText}>Buyer: {contract.buyer_accepted ? 'accepted' : 'pending'}</Text></View>
        <View style={[s.acceptance, contract.artist_accepted && s.accepted]}><Text style={s.acceptanceText}>Artist: {contract.artist_accepted ? 'accepted' : 'pending'}</Text></View>
      </View>
      {contract.fully_signed && <Text selectable style={s.verification}>Verification code: {contract.verification_code}</Text>}

    </View>}
    <View style={s.history}><NegotiationHistory contracts={history} legacy={legacyHistory} /></View>
    {(closed || contract.status === 'proposed' || !!error) && <View style={s.footer}>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {closed && <TouchableOpacity accessibilityRole="button" onPress={() => onRevise({ ...contract, restart: true })} style={s.primaryButton}><MessageSquare size={16} color="#FFF" /><Text style={s.primaryText}>Start new negotiation</Text></TouchableOpacity>}
      {contract.status === 'proposed' && <View style={s.actions}>
        {!contract.is_proposer && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => decide('accept')} style={[s.primaryButton, busy && s.disabled]}>{busy ? <ActivityIndicator size="small" color="#FFF" /> : <Check size={17} color="#FFF" />}<Text style={s.primaryText}>{busy ? 'Saving...' : 'Accept these terms'}</Text></TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => onRevise(contract)} style={[s.secondaryButton, busy && s.disabled]}><MessageSquare size={16} color="#A24F41" /><Text style={s.secondaryText}>{contract.is_proposer ? 'Edit negotiation' : 'Send back to renegotiate'}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => decide('cancel')} style={s.cancelButton}><Text style={s.cancelText}>Cancel negotiation</Text></TouchableOpacity>
      </View>}
    </View>}
  </View>;
}

const s = StyleSheet.create({
  card: { marginVertical: 10, borderWidth: 1, borderColor: '#DC9C87', borderRadius: 22, backgroundColor: '#FFF', width: '95%', maxWidth: 620, alignSelf: 'center', overflow: 'hidden', boxShadow: '0px 4px 14px rgba(87,47,32,0.07)' },
  header: { flexDirection: 'row', padding: 14, gap: 12, alignItems: 'center' }, summary: { flex: 1, minWidth: 0, gap: 6 },
  actor: { fontSize: 12, lineHeight: 18, color: '#876F60', marginHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: '#AE5242' }, role: { fontSize: 12, color: '#8E817A' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginTop: 3 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 }, badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7 }, attempts: { fontSize: 11, color: '#9B8D85' },
  offerBar: { marginHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3E9E2', flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, color: '#A18B7D' }, currency: { color: '#A78675', fontSize: 10, letterSpacing: 1, fontWeight: '700' }, price: { fontSize: 21, lineHeight: 27, fontWeight: '800', color: '#AD503F' },
  changePill: { marginHorizontal: 16, marginBottom: 14, padding: 10, borderRadius: 10, backgroundColor: '#FFF4EF' }, changeText: { fontSize: 12, fontWeight: '600', color: '#79594A' },
  details: { padding: 16, paddingTop: 4, gap: 16 }, sectionTitle: { color: '#674737', fontSize: 14, fontWeight: '700' },
  terms: { backgroundColor: '#FBF7F2', borderRadius: 13, padding: 14, gap: 10 }, termsText: { fontSize: 13, lineHeight: 21, color: '#5F5148' },
  acceptanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, acceptance: { backgroundColor: '#F3F0ED', borderRadius: 8, padding: 8 }, accepted: { backgroundColor: '#EAF5ED' }, acceptanceText: { fontSize: 11, color: '#655B53' },
  verification: { color: '#286647', fontSize: 12, fontWeight: '700' }, error: { color: '#B00020', fontSize: 13 }, actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  primaryButton: { minHeight: 44, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 11, backgroundColor: '#B55D4C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, primaryText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  secondaryButton: { minHeight: 44, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, borderWidth: 1, borderColor: '#E6C9BA', backgroundColor: '#FFF9F4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, secondaryText: { color: '#A24F41', fontSize: 12, fontWeight: '700' },
  cancelButton: { minHeight: 44, padding: 12, justifyContent: 'center' }, cancelText: { color: '#938077', fontSize: 12 }, disabled: { opacity: 0.5 }, agreedActions: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: '#F0E4DA', gap: 10 },
  history: { borderTopWidth: 1, borderTopColor: '#F0E4DA', padding: 16, backgroundColor: '#FFFCF8' },
});
