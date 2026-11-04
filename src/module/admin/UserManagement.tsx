import { useAdminRefresh } from './AdminRefresh';
import { Text, TextInput } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import { auth } from '@/firebase/config';
import { Users, Search, RefreshCcw, X, ChevronDown, Check } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

type UserRecord = { id: number; username: string; email: string; first_name: string; last_name: string; contact_number: string; role: string; status: string; joined: string; registration_status: string | null; can_edit: boolean };
const label = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
function DirectoryFilter({ title, value, options, onChange }: { title: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return <View style={s.filterField}>
    <Text style={s.filterLabel}>{title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${value ? label(value) : 'All'}`} accessibilityState={{ expanded: open }} style={s.select} onPress={() => setOpen(true)}><Text style={s.chipText}>{value ? label(value) : title === 'Status' ? 'All statuses' : 'All roles'}</Text><ChevronDown size={16} color="#897A73" /></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Close filter" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} /><View accessibilityViewIsModal style={[s.dialog, { maxWidth: 340, gap: 6 }]}><Text style={[s.dialogTitle, { flex: undefined, marginBottom: 10 }]}>{title}</Text>{options.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: option === value }} style={[s.option, option === value && s.selected]} onPress={() => { onChange(option); setOpen(false); }}><Text style={[s.chipText, { flex: 1 }]}>{option ? label(option) : title === 'Status' ? 'All statuses' : 'All roles'}</Text>{option === value && <Check size={18} color="#A74646" />}</Pressable>)}<Pressable accessibilityRole="button" style={s.option} onPress={() => setOpen(false)}><Text style={s.muted}>Cancel</Text></Pressable></View></View></Modal>
  </View>;
}
export default function UserManagement({ hr = false }: { hr?: boolean }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ results: UserRecord[]; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setBusy(true); setError('');
    try { await auth.authStateReady(); const result = await purchaseRequest(`users/management/?q=${encodeURIComponent(search)}&role=${role}&status=${status}&page=${page}`); if (id === sequence.current) setData(result); }
    catch (failure: any) { if (id === sequence.current) { setData(null); setError(failure.message || 'Unable to load users.'); } }
    finally { if (id === sequence.current) setBusy(false); }
  }, [search, role, status, page]);
  const hasHeaderRefresh = useAdminRefresh(load);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  return <View style={{ gap: 18 }}>
    <View style={s.headingRow}><Users size={30} color="#B65B50" /><Text style={s.title}>{hr ? 'People & drivers' : 'User management'}</Text>{!hasHeaderRefresh && <Pressable accessibilityRole="button" accessibilityLabel="Refresh user directory" disabled={busy} style={s.iconButton} onPress={() => void load()}><RefreshCcw size={20} color="#A74646" /></Pressable>}</View>
    <Text style={s.muted}>{hr ? 'View artist registration and driver account status. Review applications in Artist registration.' : 'Find accounts and review account status. Profile details are read-only. Restrictions remain in Account action approvals.'}</Text>
    <View style={s.toolbar}>
      <View style={s.searchField}><Text style={s.filterLabel}>Search users</Text><View style={s.searchRow}><View style={s.searchBox}><Search size={18} color="#897A73" /><TextInput accessibilityLabel="Search users" style={s.searchInput} placeholder="Name, username or email" placeholderTextColor="#A39690" value={query} onChangeText={setQuery} onSubmitEditing={() => { setPage(1); setSearch(query.trim()); }} />{!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => { setQuery(''); setSearch(''); setPage(1); }}><X size={16} color="#897A73" /></Pressable>}</View><Pressable accessibilityRole="button" style={s.button} onPress={() => { setPage(1); setSearch(query.trim()); }}><Text style={s.white}>Search</Text></Pressable></View></View>
      <DirectoryFilter title="Role" value={role} options={['', ...(hr ? ['artist', 'driver', 'buyer'] : ['buyer', 'artist', 'driver', 'hr', 'creative_moderator', 'customer_support', 'platform_admin'])]} onChange={value => { setRole(value); setPage(1); }} />
      <DirectoryFilter title="Status" value={status} options={['', 'active', 'restricted']} onChange={value => { setStatus(value); setPage(1); }} />
    </View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {busy ? <ActivityIndicator color="#C15656" /> : data && <View style={s.panel}>
      <Text style={s.muted}>{data.count} matching accounts</Text>
      {!data.results.length && <Text style={s.empty}>No users match these filters.</Text>}
      {data.results.map(user => <View key={user.id} style={s.userRow}>
        <View style={{ flex: 1, minWidth: 190, gap: 4 }}><Text style={s.name}>{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}</Text><Text style={s.muted}>@{user.username} | {user.email}</Text><Text style={s.muted}>{user.contact_number || 'No contact number'} | Joined {user.joined}</Text>{!!user.registration_status && <Text style={s.muted}>Artist application: {label(user.registration_status)}</Text>}</View>
        <View style={s.filters}><Text style={s.badge}>{label(user.role)}</Text><Text style={s.badge}>{label(user.status)}</Text></View>
      </View>)}
      <View style={s.pagination}><Pressable accessibilityRole="button" disabled={page <= 1} style={[s.chip, page <= 1 && { opacity: 0.4 }]} onPress={() => setPage(value => value - 1)}><Text>Previous</Text></Pressable><Text style={s.muted}>Page {page} of {Math.max(1, Math.ceil(data.count / 25))}</Text><Pressable accessibilityRole="button" disabled={page * 25 >= data.count} style={[s.chip, page * 25 >= data.count && { opacity: 0.4 }]} onPress={() => setPage(value => value + 1)}><Text>Next</Text></Pressable></View>
    </View>}

  </View>;
}
const s = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, padding: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8DAD2', borderRadius: 16 },
  searchField: { flexGrow: 1, flexBasis: 360, gap: 6 }, filterField: { flexGrow: 1, flexBasis: 160, maxWidth: 240, gap: 6 }, filterLabel: { fontSize: 12, fontWeight: '600', color: '#786862' }, select: { minHeight: 44, borderWidth: 1, borderColor: '#E4D3CB', borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', gap: 14, alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FAF7F3' }, option: { minHeight: 44, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E4D3CB', borderRadius: 12, paddingHorizontal: 12, minHeight: 44 }, searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: '#3A2D2A', paddingVertical: 10 },
  title: { flex: 1, fontFamily: 'LoraSemiBold', fontSize: 29, color: '#3A2D2A' }, headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, muted: { color: '#786862', fontSize: 14, lineHeight: 21 },
  panel: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8DAD2', borderRadius: 16, padding: 18, gap: 14 }, searchRow: { flexDirection: 'row', gap: 10 }, input: { minWidth: 0, borderWidth: 1, borderColor: '#E4D3CB', borderRadius: 12, padding: 12, minHeight: 46, fontSize: 14, color: '#3A2D2A' },
  button: { backgroundColor: '#C15656', paddingHorizontal: 18, paddingVertical: 12, minHeight: 46, borderRadius: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' }, white: { color: '#FFF', fontSize: 14, fontWeight: '700' }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E8DAD2' }, selected: { backgroundColor: '#F5E8E3', borderColor: '#D8A79B' }, chipText: { color: '#795448', fontSize: 13 },
  userRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderTopWidth: 1, borderColor: '#F0E4DD', paddingVertical: 14 }, name: { color: '#674B40', fontSize: 15, fontWeight: '700' }, badge: { color: '#795448', backgroundColor: '#F5E8E3', padding: 8, borderRadius: 10, fontSize: 12 }, iconButton: { padding: 10, borderRadius: 12, backgroundColor: '#F5E8E3' }, empty: { paddingVertical: 25, color: '#897A73', textAlign: 'center' }, pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, error: { color: '#AD3D3D' }, overlay: { flex: 1, backgroundColor: 'rgba(40,30,25,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }, dialog: { width: '100%', maxWidth: 500, padding: 24, borderRadius: 18, backgroundColor: '#FFF', gap: 16 }, dialogTitle: { flex: 1, fontFamily: 'LoraSemiBold', fontSize: 23, color: '#3A2D2A' },
});
