import { Text } from '@/components/Typography';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

const readable = (value: string) => value.replace(/_/g, ' ');
const date = (value: string) => new Date(value).toLocaleDateString();
const states: Record<string, string> = {
  active: 'Effective under the recorded agreement', expired: 'Expired',
  transferred: 'Transferred to a subsequent holder', awaiting_conditions: 'Awaiting agreement conditions',
  review_required: 'Rights require review against the agreement', suspended_after_refund: 'License suspended after refund',
};

/** Only renders the server's public allowlisted summary, never contract text. */
export default function RightsSummary({ entry }: { entry: any }) {
  const [expanded, setExpanded] = useState(false);
  const scope = entry.rights.scope || {};
  return <View style={s.card}>
    <Text style={s.title}>{entry.status === 'active' ? 'Current' : entry.status === 'transferred' || entry.status === 'expired' ? 'Previous' : 'Recorded'} {entry.holder_label.toLowerCase()}: {entry.holder.label}</Text>
    <Text>{entry.from_holder.label} → {entry.holder.label}</Text>
    <Text>{states[entry.status] || 'See agreement'}</Text>
    {entry.purchased_at && <Text>Purchased on: {date(entry.purchased_at)}</Text>}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}>
      <Text style={s.link}>{expanded ? 'Hide rights summary' : 'View rights summary'}</Text>
    </TouchableOpacity>
    {expanded && <>
    {entry.physical_purchase && <Text>Physical artwork purchase. Physical ownership and delivery conditions are separate from copyright; see the signed agreement.</Text>}
    {entry.effective_at && <Text>Rights effective from: {date(entry.effective_at)}</Text>}
    {entry.has_additional_conditions && <Text>Additional transfer conditions apply. Their fulfillment must be checked in the signed agreement.</Text>}
    {entry.assigned_rights.length > 0 ? <>
      <Text>Copyright rights transferred: {entry.assigned_rights.join(', ')}</Text>
      <Text>Duration: Remaining statutory term of the assigned rights</Text>
    </> : <>
      <Text>License: {readable(entry.rights.license_type)} · {readable(entry.rights.exclusivity)}</Text>
      {entry.expires_at ? <Text>Valid until: {date(entry.expires_at)}</Text> : <Text>Duration: See signed agreement</Text>}
      <Text>Territory: {scope.territory === 'custom' ? 'Specific regions — see agreement' : scope.territory ? readable(scope.territory) : 'See agreement'}</Text>
      <Text>Permitted uses: {scope.uses?.length ? scope.uses.map(readable).join(', ') : 'See agreement'}</Text>
      <Text>This license does not itself transfer copyright.</Text>
    </>}
    <Text>Resale/transfer: {entry.rights.allow_resale ? 'Permitted subject to the signed terms' : 'No permission recorded'}</Text>
    {scope.modifications && <Text>Modifications: {readable(scope.modifications)}</Text>}
    {scope.sublicensing && <Text>Sublicensing: {readable(scope.sublicensing)}</Text>}
    <Text>{entry.existing_commitments}</Text>
    <Text>{entry.royalty_obligations}</Text>
    <Text style={s.note}>This summary excludes private details. The signed agreement defines the full conditions.</Text>
    </>}
  </View>;
}

const s = StyleSheet.create({
  card: { gap: 8, borderWidth: 1, borderColor: '#E9DDD4', borderRadius: 10, padding: 14 },
  title: { fontWeight: '700', fontSize: 16, color: '#382C26' },
  note: { color: '#73665F', fontSize: 12 },
  link: { color: '#B74F50', fontWeight: '700', paddingVertical: 8 },
});
