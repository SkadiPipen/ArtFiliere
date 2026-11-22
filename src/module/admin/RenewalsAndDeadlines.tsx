import { Text, TextInput } from '@/components/Typography';
import { COLORS } from '@/constants/colors';
import { openSettingsDocument } from '@/module/settings/settingsApi';
import { purchaseRequest } from '@/services/purchases';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useAdminRefresh } from './AdminRefresh';
import { adminType, adminWorkspaceStyles as workspace } from './adminDesign';

const categories = {
  all: 'All categories', contracts: 'Contracts', royalties: 'Royalties', permits: 'Business permits',
  declarations: 'Sworn declarations', registration: 'BIR registration', drivers: 'Driver licenses',
  auctions: 'Auctions', commissions: 'Commissions', payments: 'Checkout', restrictions: 'Suspensions',
};
const statuses = { all: 'All statuses', expired: 'Expired or overdue', due_soon: 'Due within 30 days', current: 'Current', review: 'Date not recorded' };
type Status = Exclude<keyof typeof statuses, 'all'>;
type Deadline = { id: string; category: Exclude<keyof typeof categories, 'all'>; title: string; owner: string | null; detail: string; ends_on: string | null; status: Status };
type DeadlinePage = { results: Deadline[]; count: number; counts: Record<Status, number>; page: number };
type Renewal = { id: number; artist: string; document_name: string; details: {
  taxable_year: number; notarized_date: string; bir_received_date: string; remittance_status: string;
} };
const renewalPath = 'users/admin/sworn-declaration-renewals/';
const dateTime = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

export default function RenewalsAndDeadlines() {
  const [category, setCategory] = useState<keyof typeof categories>('all');
  const [status, setStatus] = useState<keyof typeof statuses>('expired');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DeadlinePage | null>(null);
  const [renewals, setRenewals] = useState<{ results: Renewal[]; count: number }>({ results: [], count: 0 });
  const [listError, setListError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Renewal | null>(null);
  const [note, setNote] = useState('');
  const refreshRenewals = useCallback(async () => setRenewals(await purchaseRequest(renewalPath)), []);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setListError('');
    try {
      const result = await purchaseRequest(`users/admin/deadlines/?category=${category}&status=${status}&page=${page}`);
      if (!signal?.aborted) setData(result);
    } catch (error) {
      if (!signal?.aborted) setListError(error instanceof Error ? error.message : 'Unable to load deadlines.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [category, status, page]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    void refreshRenewals().catch(error => setReviewError(error.message));
  }, [refreshRenewals]);
  useAdminRefresh(async () => { await Promise.all([load(), refreshRenewals()]); });

  const act = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setReviewError('');
    try { await work(); }
    catch (error) { setReviewError(error instanceof Error ? error.message : 'Unable to review the declaration.'); }
    finally { setBusy(false); }
  };
  const review = (action: 'approve' | 'reject') => act(async () => {
    if (!selected) return;
    await purchaseRequest(`${renewalPath}${selected.id}/`, 'PATCH', { action, note });
    setSelected(null);
    setNote('');
    await Promise.all([load(), refreshRenewals()]);
  });
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.pill, disabled && { opacity: .5 }]}>
      <Text style={s.accent}>{label}</Text>
    </Pressable>
  );

  return <View style={s.stack}>
    <Text style={adminType.pageTitle}>Renewals &amp; Deadlines</Text>
    <Text style={workspace.muted}>Track expiry dates, payment and review deadlines, and annual declaration renewals.</Text>
    <View style={s.row}>{Object.entries(categories).map(([key, label]) => (
      <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: category === key }} onPress={() => { setCategory(key as keyof typeof categories); setPage(1); }} style={[s.pill, category === key && s.active]}><Text style={s.accent}>{label}</Text></Pressable>
    ))}</View>
    <View style={s.row}>{Object.entries(statuses).map(([key, label]) => (
      <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: status === key }} onPress={() => { setStatus(key as keyof typeof statuses); setPage(1); }} style={[s.pill, status === key && s.active]}><Text style={s.accent}>{label}{data && key !== 'all' ? ` (${data.counts[key as Status]})` : ''}</Text></Pressable>
    ))}</View>
    {!!listError && <Text accessibilityRole="alert" style={workspace.error}>{listError}</Text>}
    {loading ? <ActivityIndicator color={COLORS.red} /> : !listError && <>
      {data?.results.length === 0 && <Text style={workspace.muted}>No records match these filters.</Text>}
      {data?.results.map(item => (
        <View key={item.id} style={s.record}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Text style={adminType.cardTitle}>{item.title}</Text>
            <Text style={workspace.muted}>{categories[item.category]} · {item.detail}{item.owner ? ` · ${item.owner}` : ''}</Text>
          </View>
          <View style={s.detail}>
            <Text style={s.accent}>{statuses[item.status]}</Text>
            <Text style={workspace.muted}>{item.ends_on?.includes('T') ? `${dateTime.format(new Date(item.ends_on))} PHT` : item.ends_on ?? 'No date recorded'}</Text>
          </View>
        </View>
      ))}
      {!!data && (page > 1 || data.count > 50) && <View style={s.row}>
        {button('Previous', () => setPage(page - 1), page <= 1)}
        <Text style={workspace.muted}>Page {page} of {Math.max(1, Math.ceil(data.count / 50))}</Text>
        {button('Next', () => setPage(page + 1), page * 50 >= data.count)}
      </View>}
    </>}
    <Text style={adminType.sectionTitle}>Sworn declaration review ({renewals.count})</Text>
    {!!reviewError && <Text accessibilityRole="alert" style={workspace.error}>{reviewError}</Text>}
    {!renewals.count && !reviewError && <Text style={workspace.muted}>No declarations awaiting review.</Text>}
    {renewals.results.map(item => <View key={item.id} style={s.card}>
      <Text style={adminType.cardTitle}>{item.artist} · {item.details.taxable_year}</Text>
      <Text style={workspace.muted}>{item.document_name}</Text>
      {button(selected?.id === item.id ? 'Close review' : 'Review renewal', () => { setSelected(selected?.id === item.id ? null : item); setNote(''); }, busy)}
      {selected?.id === item.id && <>
        <Text style={workspace.muted}>Notarized {item.details.notarized_date} · BIR received {item.details.bir_received_date}</Text>
        <Text style={workspace.muted}>{item.details.remittance_status === 'exceed_500000' ? 'Exceeds ₱500,000' : 'Does not exceed ₱500,000'}</Text>
        {button('Open submitted declaration', () => { void act(async () => {
          const file = await purchaseRequest(`${renewalPath}${item.id}/`);
          await openSettingsDocument(file.document, file.document_name);
        }); }, busy)}
        <TextInput accessibilityLabel="Review note" placeholder="Review note (required for rejection)" value={note} onChangeText={setNote} maxLength={1000} multiline style={s.input} />
        <View style={s.row}>
          {button('Approve renewal', () => { void review('approve'); }, busy)}
          {button('Reject renewal', () => { void review('reject'); }, busy || !note.trim())}
        </View>
      </>}
    </View>)}
  </View>;
}

const s = StyleSheet.create({
  stack: { gap: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignSelf: 'flex-start' },
  active: { backgroundColor: COLORS.roseLight, borderColor: COLORS.red },
  accent: { color: COLORS.redDark, fontWeight: '700' },
  record: { padding: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detail: { minWidth: 150, gap: 4 },
  card: { padding: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, gap: 10 },
  input: { padding: 10, minHeight: 54, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8 },
});
