import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import { useAdminRefresh } from './AdminRefresh';
import { adminType } from './adminDesign';

type Commission = { id: number; title: string; artist: string; buyer: string; status_label: string; disputed: boolean };
type Entry = Record<string, any>;
type Detail = Commission & { funded_at: string | null; agreement: Entry | null; milestones: Entry[]; sections: Record<string, Entry[]>; more: Record<string, boolean> };
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';
const labels: Record<string, string> = { proposals: 'Negotiation history', proofs: 'Blockchain proofs', payments: 'Payment ledger', ownership: 'Artwork registration and transfers' };

function Investigation({ id }: { id: number }) {
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
  return <View style={s.detail}>
    <TouchableOpacity disabled={busy} onPress={() => void load()} accessibilityRole="button"><Text style={s.link}>Refresh investigation</Text></TouchableOpacity>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {data && <>
      <Text>Upfront funding confirmed {date(data.funded_at)}</Text>
      <Text>Agreement #{data.agreement?.id ?? '—'} · Artist signed {date(data.agreement?.artist_signed_at)} · Buyer signed {date(data.agreement?.buyer_signed_at)}</Text>
      <Text style={adminType.sectionTitle}>Milestone progress</Text>
      {!data.milestones.length && <Text>No milestones created yet.</Text>}
      {data.milestones.map(m => <View key={m.milestone_number} style={s.entry}>
        <Text style={adminType.button}>{m.stage_label} · {m.status}</Text>
        <Text>Approved {date(m.approved_at)} · Payout {m.payout_status}</Text>
        {!!m.revision_requested_at && <Text>Revision requested {date(m.revision_requested_at)} · {m.revision_comment}</Text>}
        {!!m.revision_replied_at && <Text>Artist reply {date(m.revision_replied_at)} · {m.revision_reply}</Text>}
      </View>)}
      {Object.entries(data.sections).map(([key, entries]) => <View key={key} style={s.detail}>
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
            <Text>Block · {entry.block_number ?? '—'}</Text>
            {!!entry.error && <Text style={s.error}>{entry.error}</Text>}
          </>}
        </View>)}
      </View>)}
      {Object.values(data.more).some(Boolean) && <TouchableOpacity disabled={busy} onPress={() => void load(page + 1)} accessibilityRole="button"><Text style={s.link}>Load more history</Text></TouchableOpacity>}
    </>}
    {busy && <Text>Loading investigation…</Text>}
  </View>;
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
    <View style={s.search}>
      <TextInput accessibilityLabel="Search commission investigations" placeholder="Commission title, ID, artist or buyer" value={query} onChangeText={setQuery} onSubmitEditing={() => query.trim() === search ? void load() : setSearch(query.trim())} style={s.input} />
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => query.trim() === search ? void load() : setSearch(query.trim())}><Text style={s.link}>Search</Text></TouchableOpacity>
    </View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!busy && !error && !rows.length && <Text>No matching commissions.</Text>}
    {rows.map(row => <View key={row.id} style={s.card}>
      <Text style={adminType.sectionTitle}>#{row.id} · {row.title}</Text>
      <Text>Artist @{row.artist} · Buyer @{row.buyer}</Text>
      <Text>{row.status_label}{row.disputed ? ' · Disputed' : ''}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open === row.id }} onPress={() => setOpen(open === row.id ? null : row.id)}><Text style={s.link}>{open === row.id ? 'Close investigation' : 'Open investigation'}</Text></TouchableOpacity>
      {open === row.id && <Investigation id={row.id} />}
    </View>)}
    {busy && <Text>Loading commissions…</Text>}
    {!!next && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void load(next)}><Text style={s.link}>Load more commissions</Text></TouchableOpacity>}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { padding: 28, gap: 16, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  input: { flex: 1, minWidth: 200, padding: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DCCAC1', borderRadius: 8 },
  card: { padding: 18, gap: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8DBD2', borderRadius: 12 },
  detail: { gap: 12 },
  entry: { padding: 12, gap: 6, borderLeftWidth: 2, borderColor: '#DCCAC1' },
  link: { color: '#A74646', fontWeight: '700', paddingVertical: 8 },
  error: { color: '#A74646' },
});
