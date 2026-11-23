import Skeleton from '@/components/Skeleton';
import { Text, TextInput } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import ProvenancePanel from './ProvenancePanel';

const readable = (value: any) => String(value ?? '').replace(/_/g, ' ');
const date = (value: any) => value ? new Date(value).toLocaleString() : 'Not recorded';
const party = (value: any) => value ? `@${value.username} (account #${value.id})` : 'Not recorded';
const termValue = (value: any): string => Array.isArray(value) ? value.map(termValue).join('; ')
  : value && typeof value === 'object' ? Object.entries(value).map(([key, entry]) => `${readable(key)}: ${termValue(entry)}`).join(' · ')
  : readable(value);
const titles: Record<string, string> = {
  listings: 'Connected artwork listings', similarity_checks: 'Related similarity investigations',
  sales: 'Sales and resales', agreements: 'Agreements and revisions', blockchain_proofs: 'Blockchain proofs',
  ownership_events: 'Ownership and attribution events', digital_copies: 'Digital-copy tracking',
  refunds: 'Refunds, returns and cancellations', reports: 'Related reports', moderation: 'Moderation decisions',
  attribution_reviews: 'Creator attribution reviews', deliveries: 'Delivery status', support_tickets: 'Linked support cases',
  royalty_periods: 'Royalty reporting periods', royalty_receipts: 'Royalty receipts', royalty_funding: 'Royalty funds',
  commission_refunds: 'Commission refunds',
  commission_proofs: 'Commission blockchain proofs',
};

function Licence({ value, heading = 'Agreed rights' }: { value: any; heading?: string }) {
  if (!value || !Object.keys(value).length) return <Text>No licence terms available.</Text>;
  const scope = value.scope || value.license_scope || {};
  const assignment = scope.copyright_transfer;
  return <View style={s.licence}>
    <Text style={s.bold}>{heading}</Text>
    <Text>Licence: {readable(value.license_type) || 'See agreement'} · {readable(value.exclusivity) || 'Not recorded'}</Text>
    {!!value.agreed_price && <Text>Agreed artwork price: PHP {value.agreed_price}</Text>}
    <Text>Resale permission: {(scope.allow_resale ?? value.allow_resale) === true ? 'Permitted under the agreed terms' : 'No permission recorded'}</Text>
    {scope.uses?.length > 0 && <Text>Permitted uses: {scope.uses.map(readable).join(', ')}</Text>}
    {!!scope.territory && <Text>Territory: {scope.territory === 'custom' ? scope.territory_details : readable(scope.territory)}</Text>}
    {!!(scope.duration_months || value.duration_months) && <Text>Licence duration: {scope.duration_months || value.duration_months} months</Text>}
    {['products', 'modifications', 'sublicensing', 'credit', 'credit_name'].map(key => scope[key] ? <Text key={key}>{readable(key)}: {readable(scope[key])}</Text> : null)}
    {assignment ? <><Text>Copyright assignment: {readable(assignment.kind)} · {(assignment.rights || []).map(readable).join(', ')}</Text>
      <Text>Effective condition: {readable(assignment.effective)}</Text>
      {['existing_commitments', 'artist_reserved_uses', 'additional_terms'].map(key => assignment[key] ? <Text key={key}>{readable(key)}: {assignment[key]}</Text> : null)}</>
      : <Text>A licence does not itself transfer copyright.</Text>}
    {!!value.compensation_type && <Text>Compensation: {readable(value.compensation_type)}</Text>}
    {Object.entries(value.compensation_terms || {}).map(([key, entry]) => <Text key={key}>{readable(key)}: {termValue(entry)}</Text>)}
    {!!value.artist_signed_at && <Text>Artist signed: {date(value.artist_signed_at)}</Text>}
    {!!value.buyer_signed_at && <Text>Buyer signed: {date(value.buyer_signed_at)}</Text>}
  </View>;
}

function CollapsibleTerms({ value, sale = false }: { value: any; sale?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={s.agreementTerms}>
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={sale
        ? (expanded ? 'Hide agreed rights' : 'View agreed rights')
        : (expanded ? 'Hide agreement terms' : 'View agreement terms')}
      accessibilityState={{ expanded }}
      onPress={() => setExpanded(previous => !previous)}
      style={s.termsToggle}
    >
      <Text style={s.bold}>{sale
        ? (expanded ? 'Hide agreed rights' : 'View agreed rights')
        : (expanded ? 'Hide terms' : 'View terms')}</Text>
    </TouchableOpacity>
    {expanded && <Licence value={value} heading={sale ? 'Agreed rights' : 'Agreement terms'} />}
  </View>;
}

export default function ArtworkHistoryPanel({ artworkId, buttonLabel = 'View full artwork history' }: { artworkId: number; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<any>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const requestVersion = useRef(0);
  const lookupVersion = useRef(0);
  const load = async (page = 1) => {
    const version = ++requestVersion.current;
    setBusy(true); setError('');
    try {
      const result = await purchaseRequest(`blockchain/artworks/${artworkId}/history/?page=${page}`);
      if (version !== requestVersion.current) return;
      setData((previous: any) => page === 1 || !previous ? result : { ...result,
        sections: Object.fromEntries(Object.keys(result.sections).map(key => [key, [...(previous.sections[key] || []), ...result.sections[key]]])) });
    } catch (e: any) { if (version === requestVersion.current) setError(e.message || 'Unable to load artwork history.'); }
    finally { if (version === requestVersion.current) setBusy(false); }
  };
  useEffect(() => {
    setData(null); setLookup(null); setCode(''); setError(''); setBusy(false); setLookupBusy(false);
    if (open) void load();
    return () => { requestVersion.current++; lookupVersion.current++; };
  }, [open, artworkId]);
  const findCopy = async () => {
    const version = ++lookupVersion.current;
    setLookupBusy(true); setError(''); setLookup(null);
    try {
      const result = await purchaseRequest('support/artwork-code/', 'POST', { code: code.trim() });
      if (version === lookupVersion.current) setLookup(result);
    }
    catch (e: any) { if (version === lookupVersion.current) setError(e.message || 'Unable to trace this copy code.'); }
    finally { if (version === lookupVersion.current) setLookupBusy(false); }
  };
  return <>
    <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => setOpen(true)}><Text style={s.buttonText}>{buttonLabel}</Text></TouchableOpacity>
    <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
      <View style={s.overlay}><View style={s.modal}>
        <View style={s.heading}><Text style={s.title}>Artwork history and investigation</Text><TouchableOpacity onPress={() => setOpen(false)}><Text>Close</Text></TouchableOpacity></View>
        <ScrollView contentContainerStyle={s.content}>
          {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          {data && <>
            <Text style={s.title}>{data.title}</Text>
            <Text>Original creator: {party(data.created_by)} · {data.creator_verification === 'reviewed' ? 'Reviewed attribution' : 'Claimed attribution'}</Text>
            {data.claimed_creator?.id !== data.created_by?.id && <Text>Original submitted creator claim: {party(data.claimed_creator)}</Text>}
            {!!data.disputed && <Text style={s.error}>Creator attribution is under review.</Text>}
            {!!data.current_holder && <Text>Recorded entitlement holder: {party(data.current_holder)}</Text>}
            <Text selectable>Artwork identity: {data.record_id || 'Not registered yet'}</Text>
            <Text>Connected listing IDs: {data.listing_ids.join(', ')}</Text>
            {!!data.file_hash && <Text selectable>Registered file hash: {data.file_hash}</Text>}
            <Text style={s.note}>{data.notice}</Text>
            <Text style={s.note}>Local Anvil transactions have no public explorer. Transaction hashes and block numbers are shown where recorded.</Text>
            <View style={s.section}><Text style={s.bold}>Trace a digital copy</Text>
              <Text>Enter a readable dot-watermark code. A match identifies an issued copy; it does not prove an outside sale.</Text>
              <TextInput accessibilityLabel="Artwork copy tracking code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="AF-TX-… or AF-…" style={s.input} />
              <TouchableOpacity disabled={lookupBusy || !code.trim()} onPress={findCopy} style={s.button}><Text style={s.buttonText}>{lookupBusy ? 'Looking up…' : 'Look up copy code'}</Text></TouchableOpacity>
              {lookup && <><Text>Issued buyer: {party(lookup.buyer)}</Text><Text>Source: {lookup.artwork?.title || lookup.source}</Text>
                <Text>{lookup.artwork?.kind === 'artwork' && data.listing_ids.includes(lookup.artwork.id) ? 'Matches this artwork’s recorded issued copy.' : 'This code may belong to a different artwork or commission; check its source before drawing conclusions.'}</Text>
                <Text>Linked blockchain proof: {lookup.blockchain.status}</Text><Licence value={lookup.license} /></>}
            </View>
            {!!data.commission && <View style={s.section}><Text style={s.bold}>Original commission #{data.commission.id}</Text><Text>{party(data.commission.artist)} → {party(data.commission.buyer)}</Text><Text>Status: {data.commission.status}</Text><Licence value={data.commission.license} /></View>}
            {Object.entries(data.sections as Record<string, any[]>).filter(([section, rows]) => rows.length > 0 || ['sales', 'agreements', 'blockchain_proofs', 'digital_copies'].includes(section)).map(([section, rows]) => <View key={section} style={s.section}>
              <Text style={s.title}>{titles[section] || readable(section)}</Text>
              {!rows.length && <Text style={s.note}>No records.</Text>}
              {rows.map((row: any) => <View key={row.id} style={s.record}>
                <Text style={s.bold}>{row.title || readable(row.operation)} · {readable(row.status)}</Text>
                <Text style={s.note}>{['blockchain_proofs', 'ownership_events', 'commission_proofs'].includes(section) ? 'Blockchain record' : 'Platform record'} · {date(row.recorded_at)}</Text>
                {!!row.simulated && <Text style={s.error}>Simulated transaction — no real payment</Text>}
                {!!row.seller && <Text>Seller / previous holder: {party(row.seller)}</Text>}
                {!!row.buyer && <Text>Buyer / recipient: {party(row.buyer)}</Text>}
                {!!row.artist && <Text>Artist: {party(row.artist)}</Text>}
                {!!row.initial_owner && <Text>Initial owner: {party(row.initial_owner)}</Text>}
                {!!row.actor && <Text>Recorded by: {party(row.actor)}</Text>}
                {!!row.proposed_creator && <Text>Proposed creator: {party(row.proposed_creator)}</Text>}
                {!!row.reviewer && <Text>Reviewed by: {party(row.reviewer)} · {date(row.reviewed_at)}</Text>}
                {!!row.amount && <Text>Amount: {row.currency || 'PHP'} {row.amount}</Text>}
                {!!row.payment_id && <Text>Purchase #{row.payment_id}</Text>}
                {!!row.agreement_id && <Text>Agreement #{row.agreement_id}</Text>}
                {!!row.terms_source && <Text style={row.terms_source === 'legacy_current_record' ? s.error : s.note}>{row.terms_source === 'checkout' ? 'Frozen checkout licence snapshot' : row.terms_source === 'sale_recording' ? 'Snapshot captured when the sale proof was recorded' : row.terms_source === 'legacy_current_record' ? 'Legacy record: exact purchase-time terms were not captured; displayed terms may have changed.' : 'Agreement record; compare with the purchase snapshot'}</Text>}
                {!!row.license && (section === 'agreements' || section === 'sales'
                  ? <CollapsibleTerms value={row.license} sale={section === 'sales'} />
                  : <Licence value={row.license} />)}
                {row.transaction_hash ? <Text selectable>Transaction: {row.transaction_hash}</Text> : ['blockchain_proofs', 'ownership_events', 'commission_proofs'].includes(section) && <Text>No transaction hash recorded.</Text>}
                {row.block_number != null && <Text>Block: {row.block_number}{row.chain_id ? ` · Chain: ${row.chain_id}` : ''}</Text>}
                {!!row.network && <Text>Network: {row.network}</Text>}
                {!!row.contract_address && <Text selectable>Contract: {row.contract_address}</Text>}
                {!!(row.proof_hash || row.document_hash) && <Text selectable>Proof hash: {row.proof_hash || row.document_hash}</Text>}
                {row.previous_attempts?.map((attempt: any) => <Text selectable key={attempt.transaction_hash}>Earlier attempt: {attempt.transaction_hash} · {attempt.status}</Text>)}
                {!!row.code && <Text selectable>Copy code: {row.code}</Text>}
                {!!row.blockchain && <><Text>Linked proof: {row.blockchain.status}</Text>{!!row.blockchain.transaction_hash && <Text selectable>Transaction: {row.blockchain.transaction_hash}</Text>}</>}
                {!!row.note && <Text>{row.note}</Text>}{!!row.resolution && <Text>Decision: {row.resolution}</Text>}
                {!!row.delivered_at && <Text>Delivered: {date(row.delivered_at)}</Text>}
              </View>)}
            </View>)}
            {!!data.next_page && <TouchableOpacity disabled={busy} onPress={() => void load(data.next_page)} style={s.button}><Text style={s.buttonText}>Load more history</Text></TouchableOpacity>}
            <ProvenancePanel artworkId={artworkId} />
          </>}
          {busy ? <Skeleton layout="list" /> : <TouchableOpacity onPress={() => void load()}><Text>Refresh history</Text></TouchableOpacity>}
        </ScrollView>
      </View></View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, padding: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0009' },
  modal: { width: '100%', maxWidth: 900, maxHeight: '94%', padding: 20, borderRadius: 16, backgroundColor: '#FFFCF8' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  content: { gap: 14, paddingBottom: 24 }, title: { fontWeight: '800', fontSize: 18, color: '#49342E' },
  bold: { fontWeight: '700', color: '#49342E' }, note: { color: '#756A63', fontSize: 12 }, error: { color: '#A74646' },
  section: { gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: '#E8DBD2' },
  record: { gap: 7, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E8DBD2' },
  licence: { gap: 5, padding: 10, backgroundColor: '#F4EFE7', borderRadius: 8 },
  agreementTerms: { gap: 6 },
  termsToggle: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F4EFE7' },
  input: { borderWidth: 1, borderColor: '#DCCAC1', borderRadius: 8, padding: 12 },
  button: { padding: 12, backgroundColor: '#B95353', borderRadius: 9, alignItems: 'center', marginVertical: 6 },
  buttonText: { color: '#FFF', fontWeight: '700' },
});
