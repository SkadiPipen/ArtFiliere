import { Text, TextInput } from '@/components/Typography';
import { COLORS } from '@/constants/colors';
import { openSettingsDocument } from '@/module/settings/settingsApi';
import { purchaseRequest } from '@/services/purchases';
import { CalendarClock, FileCheck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useAdminRefresh } from './AdminRefresh';
import AdminTabs from './AdminTabs';
import DriverLicenseReviews from './DriverLicenseReviews';
import ResellerApprovals from './ResellerApprovals';
import RoyaltyApprovals from './RoyaltyApprovals';
import { adminSurfaces, adminType, adminWorkspaceStyles as workspace } from './adminDesign';

const categories = {
  all: 'All categories', contracts: 'Contracts', royalties: 'Royalties', permits: 'Business permits',
  declarations: 'Sworn declarations', registration: 'BIR registration', drivers: 'Driver licenses',
  auctions: 'Auctions', commissions: 'Commissions', payments: 'Checkout', restrictions: 'Suspensions',
};
const statuses = { all: 'All statuses', expired: 'Expired or overdue', due_soon: 'Due within 30 days', current: 'Current', review: 'Date not recorded' };
const categoryGroups = [
  { label: 'Documents & agreements', keys: ['contracts', 'permits', 'declarations', 'registration', 'drivers'] },
  { label: 'Platform activity', keys: ['royalties', 'auctions', 'commissions', 'payments', 'restrictions'] },
] as const;
const views = [
  { id: 'deadlines', label: 'Deadline tracker', icon: CalendarClock },
  { id: 'renewals', label: 'Document renewals', icon: FileCheck },
] as const;
const renewalTypes = { declarations: 'Sworn declarations', royalty: 'Royalty permits', reseller: 'Reseller permits', drivers: 'Driver licenses' };
type Status = Exclude<keyof typeof statuses, 'all'>;
type Deadline = { id: string; category: Exclude<keyof typeof categories, 'all'>; title: string; owner: string | null; detail: string; ends_on: string | null; status: Status };
type DeadlinePage = { results: Deadline[]; count: number; counts: Record<Status, number>; page: number };
type Renewal = { id: number; artist: string; document_name: string; details: {
  taxable_year: number; notarized_date: string; bir_received_date: string; remittance_status: string;
} };
const renewalPath = 'users/admin/sworn-declaration-renewals/';
const dateTime = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
const selectStyle = {
  width: '100%', minHeight: 36, border: '1px solid #E5DAD3', borderRadius: 8,
  padding: '6px 10px', background: '#FFFFFF', color: '#59453D',
  fontFamily: 'NunitoSansSemiBold, sans-serif', fontSize: 14,
};

export default function RenewalsAndDeadlines() {
  const [view, setView] = useState<(typeof views)[number]['id']>('deadlines');
  const [renewalType, setRenewalType] = useState<keyof typeof renewalTypes>('declarations');
  const [category, setCategory] = useState<keyof typeof categories>('all');
  const [status, setStatus] = useState<keyof typeof statuses>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DeadlinePage | null>(null);
  const [renewals, setRenewals] = useState<{ results: Renewal[]; count: number }>({ results: [], count: 0 });
  const [renewalsLoading, setRenewalsLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Renewal | null>(null);
  const [note, setNote] = useState('');
  const refreshRenewals = useCallback(async () => {
    setRenewalsLoading(true);
    try { setRenewals(await purchaseRequest(renewalPath)); }
    finally { setRenewalsLoading(false); }
  }, []);
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
  const filterButton = (label: string, active: boolean, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.filter, active && s.active]}>
      <Text style={[s.filterText, active && s.activeText]}>{label}</Text>
    </Pressable>
  );
  const selectCategory = (key: keyof typeof categories) => {
    setCategory(key);
    setStatus('all');
    setPage(1);
  };

  return <View style={s.stack}>
    <View style={s.hero}>
      <View style={s.heading}>
        <CalendarClock size={30} color="#B65B50" />
        <Text style={[adminType.pageTitle, s.headingText]}>Renewals &amp; Deadlines</Text>
      </View>
    </View>
    <AdminTabs items={views} value={view} onChange={setView} />
    {view === 'deadlines' ? <>
    <View style={s.toolbar}>
      <View style={s.filterField}>
        <Text style={adminType.label}>Category</Text>
        <select aria-label="Category" style={selectStyle} value={category} onChange={event => selectCategory(event.target.value as keyof typeof categories)}>
          <option value="all">{categories.all}</option>
          {categoryGroups.map(group => <optgroup key={group.label} label={group.label}>
            {group.keys.map(key => <option key={key} value={key}>{categories[key]}</option>)}
          </optgroup>)}
        </select>
      </View>
      <View style={s.filterField}>
        <Text style={adminType.label}>Status</Text>
        <select aria-label="Status" style={selectStyle} value={status} onChange={event => {
          setStatus(event.target.value as keyof typeof statuses);
          setPage(1);
        }}>
          {(Object.keys(statuses) as (keyof typeof statuses)[]).map(key => <option key={key} value={key}>
            {statuses[key]}{data && !loading && !listError && key !== 'all' ? ` (${data.counts[key]})` : ''}
          </option>)}
        </select>
      </View>
    </View>
    {!!listError && <Text accessibilityRole="alert" style={workspace.error}>{listError}</Text>}
    {loading ? <ActivityIndicator color={COLORS.red} /> : !listError && <>
      {data && <Text style={adminType.sectionTitle}>{category === 'all' ? 'Deadline records' : categories[category]} ({data.count})</Text>}
      {data?.results.length === 0 && <View style={s.card}>
        <Text style={workspace.muted}>No records match the selected category and status.</Text>
        {status !== 'all' && button('Show all statuses', () => { setStatus('all'); setPage(1); })}
      </View>}
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
    </> : <>
    <View style={adminSurfaces.card}>
    <Text style={adminType.cardTitle}>Document type</Text>
    <View style={s.row}>{(Object.keys(renewalTypes) as (keyof typeof renewalTypes)[]).map(key => <View key={key}>
      {filterButton(renewalTypes[key], renewalType === key, () => setRenewalType(key))}
    </View>)}</View>
    </View>
    {renewalType === 'royalty' && <RoyaltyApprovals workspace />}
    {renewalType === 'reseller' && <ResellerApprovals workspace />}
    {renewalType === 'drivers' && <DriverLicenseReviews onDecision={load} />}
    {renewalType === 'declarations' && <>
    <Text style={adminType.sectionTitle}>Sworn declarations awaiting review{renewalsLoading ? '' : ` (${renewals.count})`}</Text>
    {!!reviewError && <Text accessibilityRole="alert" style={workspace.error}>{reviewError}</Text>}
    {renewalsLoading && <ActivityIndicator color={COLORS.red} />}
    {!renewalsLoading && !renewals.count && !reviewError && <View style={s.card}>
      <Text style={workspace.muted}>No sworn declaration renewals are waiting for review.</Text>
    </View>}
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
    </>}
    </>}
  </View>;
}

const s = StyleSheet.create({
  stack: { gap: 14 },
  hero: { gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headingText: { flexShrink: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignSelf: 'flex-start' },
  filter: { ...adminSurfaces.button, minHeight: 36, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#F5E8E3', alignSelf: 'flex-start' },
  filterText: { ...adminType.button, color: '#786862' },
  active: { backgroundColor: '#C15656' },
  activeText: { color: COLORS.white },
  toolbar: { ...adminSurfaces.card, padding: 12, gap: 12, flexDirection: 'row', flexWrap: 'wrap' },
  filterField: { flexGrow: 1, flexBasis: 180, maxWidth: 240, gap: 4 },
  accent: { color: COLORS.redDark, fontWeight: '700' },
  record: { ...adminSurfaces.card, flexDirection: 'row', flexWrap: 'wrap' },
  detail: { minWidth: 150, gap: 4 },
  card: adminSurfaces.card,
  input: { padding: 10, minHeight: 54, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8 },
});
