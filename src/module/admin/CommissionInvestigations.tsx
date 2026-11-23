import Skeleton from '@/components/Skeleton';
import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import { useAdminRefresh } from './AdminRefresh';
import { adminType } from './adminDesign';

type Commission = { id: number; title: string; artist: string; buyer: string; status_label: string; disputed: boolean };
type Entry = Record<string, any>;
type Detail = Commission & { funded_at: string | null; agreement: Entry | null; milestones: Entry[]; sections: Record<string, Entry[]>; more: Record<string, boolean> };
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';
const labels: Record<string, string> = { proposals: 'Negotiation history', proofs: 'Blockchain proofs', payments: 'Payment ledger', ownership: 'Artwork registration and transfers' };

function Investigation({ id, onClose }: { id: number; onClose: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const load = async (next = 1) => {
    const current = ++version.current;
    setBusy(true); setError('');
    try {
      const result: Detail = await purchaseRequest(`blockchain/commission-investigations/${id}/?page=${next}`);
      if (current !== version.current) return;
      setData(previous => next === 1 || !previous ? result : {
        ...result, sections: Object.fromEntries(Object.keys(result.sections).map(key => [key, [...previous.sections[key], ...result.sections[key]]])),
      });
      setPage(next);
    } catch (e: any) { if (current === version.current) setError(e.message || 'Unable to load investigation.'); }
    finally { if (current === version.current) setBusy(false); }
  };
  useEffect(() => { void load(); return () => { version.current++; }; }, [id]);
  useAdminRefresh(() => load());
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={s.overlay}><View style={s.modal}>
    <View style={s.heading}><Text style={s.title}>Commission history and investigation</Text><TouchableOpacity accessibilityRole="button" onPress={onClose}><Text>Close</Text></TouchableOpacity></View>
    <ScrollView contentContainerStyle={s.content}>
    <TouchableOpacity disabled={busy} onPress={() => void load()} accessibilityRole="button"><Text style={s.link}>Refresh investigation</Text></TouchableOpacity>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {data && <>
      <Text style={s.title}>{data.title}</Text>
      <Text>Artist @{data.artist} � Buyer @{data.buyer} � {data.status_label}</Text>
      <Text style={s.note}>Local Anvil transactions have no public explorer. Block numbers appear after a blockchain transaction is confirmed. Negotiations and payment ledger entries are platform records.</Text>
      <Text>Upfront funding confirmed {date(data.funded_at)}</Text>
      <Text>Agreement #{data.agreement?.id ?? '—'} · Artist signed {date(data.agreement?.artist_signed_at)} · Buyer signed {date(data.agreement?.buyer_signed_at)}</Text>
      <Text style={adminType.sectionTitle}>Milestone progress</Text>
      {!data.milestones.length && <Text>No milestones created yet.</Text>}
      {data.milestones.map(m => <View key={m.milestone_number} style={s.entry}>
        <Text style={adminType.button}>{m.stage_label} · {m.status}</Text>
        <Text>Approved {date(m.approved_at)} · {m.payout_status === 'CONFIG_REQUIRED' ? 'Payout setup required' : `Payout ${m.payout_status}`}</Text>
        {!!m.revision_requested_at && <Text>Revision requested {date(m.revision_requested_at)} · {m.revision_comment}</Text>}
        {!!m.revision_replied_at && <Text>Artist reply {date(m.revision_replied_at)} · {m.revision_reply}</Text>}
      </View>)}
      {Object.entries(data.sections).map(([key, entries]) => <View key={key} style={s.section}>
        <Text style={adminType.sectionTitle}>{labels[key] || key}</Text>
        {key === 'proposals' && <Text>Proposal versions and signatures are database records. Upload and completion proofs show their blockchain status below.</Text>}
        {key === 'payments' && <Text>Payment ledger entries are database records.</Text>}
        {!entries.length && <Text>No records yet.</Text>}
        {entries.map(entry => <View key={entry.id} style={s.entry}>
          {key === 'proposals' ? <>
            <Text style={adminType.button}>Version {entry.version} · @{entry.proposer} · {entry.status}</Text>
            <Text>{date(entry.created_at)}</Text>
            {Object.entries(entry.terms).filter(([, value]) => value != null).map(([name, value]) => <Text key={name}>{name.replaceAll('_', ' ')} · {JSON.stringify(value)}</Text>)}
          </> : key === 'payments' ? <Text>{entry.kind} · PHP {entry.amount} · {date(entry.created_at)}</Text> : <>
            <Text style={adminType.button}>{entry.label} · {entry.status}</Text>
            {!!entry.filename && <Text>{entry.filename} · {date(entry.uploaded_at)}</Text>}
            {!!entry.file_hash && <Text selectable>File SHA-256 · {entry.file_hash}</Text>}
            <Text selectable>Record hash · {entry.record_hash}</Text>
            <Text selectable>Transaction · {entry.transaction_hash || 'Awaiting confirmation'}</Text>
            <Text>Block: {entry.block_number ?? (String(entry.status).toUpperCase() === 'CONFIRMED' ? 'Receipt details unavailable' : 'Awaiting blockchain confirmation')}</Text>
            {!!entry.error && <Text style={s.error}>{entry.error}</Text>}
          </>}
        </View>)}
      </View>)}
      {Object.values(data.more).some(Boolean) && <TouchableOpacity disabled={busy} onPress={() => void load(page + 1)} accessibilityRole="button"><Text style={s.link}>Load more history</Text></TouchableOpacity>}
    </>}
    {busy && <Skeleton layout="list" />}
    </ScrollView></View></View>
  </Modal>;
}

export default function CommissionInvestigations() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Commission[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const load = async (page = 1) => {
    const current = ++version.current;
    setBusy(true); setError('');
    try {
      const result = await purchaseRequest(`blockchain/commission-investigations/?q=${encodeURIComponent(search)}&page=${page}`);
      if (current !== version.current) return;
      setRows(previous => page === 1 ? result.items : [...previous, ...result.items]); setNext(result.next_page);
    } catch (e: any) { if (current === version.current) setError(e.message || 'Unable to load commissions.'); }
    finally { if (current === version.current) setBusy(false); }
  };
  useEffect(() => { setRows([]); setOpen(null); void load(); return () => { version.current++; }; }, [search]);
  useAdminRefresh(() => load());
  return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <Text style={adminType.pageTitle}>Commission blockchain investigations</Text>
    <Text style={adminType.body}>Review commission milestones, agreements, payment records, and blockchain proofs. Investigation access is restricted to administrators.</Text>
    <View style={s.search}>
      <TextInput accessibilityLabel="Search commission investigations" placeholder="Commission title, ID, artist or buyer" value={query} onChangeText={setQuery} onSubmitEditing={() => query.trim() === search ? void load() : setSearch(query.trim())} style={s.input} />
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => query.trim() === search ? void load() : setSearch(query.trim())} style={s.button}><Text style={s.buttonText}>Search</Text></TouchableOpacity>
    </View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!busy && !error && !rows.length && <Text>No matching commissions.</Text>}
    {rows.map(row => <View key={row.id} style={s.card}>
      <Text style={adminType.sectionTitle}>#{row.id} · {row.title}</Text>
      <Text>Artist @{row.artist} · Buyer @{row.buyer}</Text>
      <Text>{row.status_label}{row.disputed ? ' · Disputed' : ''}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open === row.id }} onPress={() => setOpen(row.id)} style={s.button}><Text style={s.buttonText}>Open investigation</Text></TouchableOpacity>

    </View>)}
    {open !== null && <Investigation key={open} id={open} onClose={() => setOpen(null)} />}
    {busy && <Skeleton layout="list" />}
    {!!next && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void load(next)} style={s.button}><Text style={s.buttonText}>Load more commissions</Text></TouchableOpacity>}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { padding: 28, gap: 16, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  input: { flex: 1, minWidth: 200, padding: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DCCAC1', borderRadius: 8 },
  card: { padding: 18, gap: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8DBD2', borderRadius: 12 },
  overlay: { flex: 1, padding: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0009' },
  modal: { width: '100%', maxWidth: 900, maxHeight: '94%', padding: 20, borderRadius: 16, backgroundColor: '#FFFCF8' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  content: { gap: 14, paddingBottom: 24 },
  title: { fontWeight: '800', fontSize: 18, color: '#49342E' },
  note: { color: '#756A63', fontSize: 12 },
  section: { gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: '#E8DBD2' },
  button: { padding: 12, backgroundColor: '#B95353', borderRadius: 9, alignItems: 'center', marginVertical: 6 },
  buttonText: { color: '#FFF', fontWeight: '700' },
  entry: { padding: 12, gap: 7, borderWidth: 1, borderRadius: 10, borderColor: '#E8DBD2' },
  link: { color: '#A74646', fontWeight: '700', paddingVertical: 8 },
  error: { color: '#A74646' },
});
