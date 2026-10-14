import ArtworkPreview from './ArtworkPreview';
import { auth } from '@/firebase/config';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { Contract } from './contracts';
import type { ChatMessage } from './chats';
import { AttemptChange, legacyChanges, legacyProposal } from './negotiationThreads';
import { compactChanges } from './inlineChanges';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

function DisclosureButton({ open, label, onPress }: { open: boolean; label: string; onPress: () => void }) {
  return <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ expanded: open }}
    onPress={onPress}
    activeOpacity={0.7}
    style={{ minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E6C9BA', borderRadius: 10, backgroundColor: '#FFF7F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
  >
    <Text style={{ flex: 1, fontWeight: '700', color: '#A34A40', fontSize: 12 }}>{label}</Text>
    {open ? <ChevronUp size={18} color="#A34A40" /> : <ChevronDown size={18} color="#A34A40" />}
  </TouchableOpacity>;
}

export function ChangeHighlights({ changes }: { changes: AttemptChange[] }) {
  return <View style={{ gap: 10 }}>{changes.map((change, index) => <View key={`${change.label}-${index}`} style={{ borderWidth: 1, borderColor: '#E8D5C7', borderRadius: 12, padding: 12, gap: 6, backgroundColor: '#FFF' }}>
    <Text style={{ fontWeight: '700', color: '#603C36' }}>{change.label}</Text>
    {compactChanges(change.before, change.after).map((line, lineIndex) => <Text key={lineIndex} selectable style={{ fontSize: 13, lineHeight: 22, color: '#68594E' }}>
      {line.map((span, spanIndex) => <Text key={spanIndex} style={span.kind === 'removed' ? { textDecorationLine: 'line-through', color: '#9A8B82' } : span.kind === 'added' ? { fontWeight: '800', color: '#BC3535', backgroundColor: '#FFF0ED' } : undefined}>{span.text}{span.kind === 'removed' && line[spanIndex + 1]?.kind === 'added' ? ' ' : ''}</Text>)}
    </Text>)}
  </View>)}</View>;
}

function Attempt({ title, at, status, terms }: { title: string; at: string; status: string; terms: string }) {
  const [open, setOpen] = useState(false);
  return <View style={{ borderLeftWidth: 2, borderLeftColor: '#D9BDA5', paddingLeft: 12, gap: 8, paddingVertical: 10 }}>
    <Text style={{ fontWeight: '700' }}>{title}</Text>
    <Text style={{ color: '#75655F', fontSize: 12 }}>{at ? new Date(at).toLocaleString() : 'Date not recorded'} · {status}</Text>
    <DisclosureButton open={open} label={open ? 'Hide full terms' : 'View full terms'} onPress={() => setOpen(!open)} />
    {open && <>
      <Text selectable>{terms}</Text>
      <DisclosureButton open label="Hide full terms" onPress={() => setOpen(false)} />
    </>}
  </View>;
}

export default function NegotiationHistory({ contracts = [], legacy = [] }: { contracts?: Contract[]; legacy?: ChatMessage[] }) {
  const [open, setOpen] = useState(false);
  const attempts = [
    ...legacy.map(message => {
      const data = legacyProposal(message);
      return { key: `legacy-${message.id}`, at: message.timestamp,
        title: `${message.senderName || 'Participant'} proposed PHP ${data.finalPrice ?? '—'}`,
        status: `Earlier chat proposal · ${data.status || 'recorded'}`,
        terms: [data.licenseType && `License: ${data.licenseType}`, data.exclusivity && `Exclusivity: ${data.exclusivity}`, data.durationMonths && `Duration: ${data.durationMonths} months`, data.royaltyPercentage && `Royalty: ${data.royaltyPercentage}%`, data.note && `Additional terms: ${data.note}`].filter(Boolean).join('\n') || 'No further terms recorded.',
      };
    }),
    ...contracts.map(contract => ({ key: `contract-${contract.id}`, at: contract.created_at,
      title: `${contract.proposed_by ? `${contract.proposed_by.name} (${contract.proposed_by.role})` : contract.is_proposer ? 'You' : contract.buyer_uid === auth.currentUser?.uid ? contract.artist : contract.buyer} ${contract.attempt_action === 'edited' ? 'edited the offer to' : contract.attempt_action === 'renegotiated' ? 'sent back to renegotiate at' : 'proposed'} PHP ${contract.price}`,
      status: contract.closure_reason === 'cancelled' ? `Cancelled${contract.cancelled_by ? ` by ${contract.cancelled_by.name}` : ''}` : contract.status === 'cancelled' ? 'Replaced by a newer attempt' : contract.status === 'accepted' ? 'Accepted' : 'Awaiting acceptance',
      terms: contract.terms })),
    ...contracts.filter(contract => contract.cancelled_at).map(contract => ({ key: `cancellation-${contract.id}`, at: contract.cancelled_at!,
      title: `Negotiation cancelled by ${contract.cancelled_by?.name || 'a participant'}`,
      status: 'Cancelled', terms: 'This negotiation is closed. Starting again creates a separate negotiation card.' })),
  ].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
  return <View style={{ gap: 10 }}>
    <DisclosureButton open={open} label={`${open ? 'Hide' : 'Show'} negotiation attempts (${contracts.length + legacy.length})`} onPress={() => setOpen(!open)} />
    {open && <>
      {attempts.map(({ key, ...attempt }, index) => <Attempt key={key} {...attempt} title={key.startsWith('cancellation-') ? attempt.title : `${index + 1}. ${attempt.title}`} />)}
      <DisclosureButton open label="Hide negotiation attempts" onPress={() => setOpen(false)} />
    </>}
  </View>;
}

export function LegacyNegotiationCard({ messages }: { messages: ChatMessage[] }) {
  const latest = messages[messages.length - 1];
  const data = legacyProposal(latest);
  return <View style={{ padding: 16, marginVertical: 10, borderWidth: 1, borderColor: '#DC9C87', borderRadius: 22, backgroundColor: '#FFFFFF', width: '95%', alignSelf: 'center', gap: 10 }}>
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      <ArtworkPreview uri={latest.artworkImageUri || data.artworkImageUri} title={latest.artworkTitle || data.artworkTitle || 'Artwork'} />
      <Text style={{ flex: 1, fontSize: 18, fontWeight: '700', color: '#AE5242' }}>{latest.artworkTitle || data.artworkTitle || 'Artwork'}</Text>
    </View>
    <Text>Latest proposed price: PHP {data.finalPrice ?? 'Not recorded'}</Text>
    <Text>Earlier chat proposals · {messages.length} {messages.length === 1 ? 'attempt' : 'attempts'}</Text>
    <ChangeHighlights changes={legacyChanges(latest, messages[messages.length - 2])} />
    <NegotiationHistory legacy={messages} />
  </View>;
}
