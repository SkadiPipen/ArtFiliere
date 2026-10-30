import { Text } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import { auth } from '@/firebase/config';
import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

type Notice = { key: string; title: string; destination: string; category: string; created_at?: string; is_read: boolean };
export type AdminRequestCategories = Record<string, { pending: number; unread: number }>;
type Summary = { unread_count: number; pending_count: number; snapshot: string; has_more: boolean; notifications: Notice[]; categories: AdminRequestCategories };
const path = 'users/admin/request-notifications/';

export default function AdminRequestBell({ onCategoriesChange }: { onCategoriesChange?: (categories: AdminRequestCategories) => void }) {
  const [data, setData] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const sequence = useRef(0);
  const changing = useRef(false);

  useEffect(() => {
    if (data) onCategoriesChange?.(data.categories);
  }, [data, onCategoriesChange]);

  const load = async () => {
    const current = ++sequence.current;
    const result: Summary = await purchaseRequest(path);
    if (mounted.current && current === sequence.current) setData(result);
    return result;
  };
  useEffect(() => {
    mounted.current = true;
    const refresh = async () => {
      if (changing.current) return;
      try { await auth.authStateReady(); if (auth.currentUser) await load(); }
      catch (failure: any) { if (mounted.current) setError(failure.message || 'Request notifications are unavailable.'); }
    };
    void refresh();
    const interval = setInterval(refresh, 15000);
    return () => { mounted.current = false; sequence.current += 1; clearInterval(interval); };
  }, []);

  const acknowledge = async (snapshot: string, key?: string) => {
    const current = ++sequence.current;
    const result: Summary = await purchaseRequest(path, 'PATCH', { snapshot, ...(key ? { request_key: key } : {}) });
    if (mounted.current && current === sequence.current) setData(result);
  };
  const show = async () => {
    if (changing.current) return;
    setOpen(true); setError(''); setBusy(true); changing.current = true;
    try {
      const result = await load();
      // A signed snapshot prevents a request arriving after this click from
      // being accidentally cleared by the acknowledgement.
      await acknowledge(result.snapshot);
    } catch (failure: any) { if (mounted.current) setError(failure.message || 'Could not mark notifications as read.'); }
    finally { changing.current = false; if (mounted.current) setBusy(false); }
  };
  const follow = async (notice: Notice) => {
    if (!data || changing.current) return;
    changing.current = true; setBusy(true); setError('');
    try {
      await acknowledge(data.snapshot, notice.key);
      setOpen(false);
      router.push(notice.destination as any);
    } catch (failure: any) { if (mounted.current) setError(failure.message); }
    finally { changing.current = false; if (mounted.current) setBusy(false); }
  };
  const unread = data?.unread_count || 0;
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Admin request notifications, ' + unread + ' unread'} onPress={show} style={s.bell}>
      <Bell size={21} color="#6A4B3F" />
      {unread > 0 && <View style={s.badge}><Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>}
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={s.overlay} onPress={() => setOpen(false)}>
        <Pressable style={s.card} onPress={event => event.stopPropagation()}>
          <View style={s.header}><Text style={s.heading}>Admin requests</Text><TouchableOpacity onPress={() => setOpen(false)}><Text style={s.link}>Close</Text></TouchableOpacity></View>
          <Text>{data?.pending_count ?? '…'} requests still need review · {unread} unread notifications</Text>
          <Text style={s.note}>Opening this list clears the unread badge. Requests stay pending until a decision is made.</Text>
          {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          {busy && <ActivityIndicator color="#C15656" />}
          <TouchableOpacity disabled={busy} onPress={show}><Text style={s.link}>Refresh and mark current notifications read</Text></TouchableOpacity>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
            {data?.notifications.map(notice => <TouchableOpacity disabled={busy} key={notice.key} style={[s.row, !notice.is_read && s.unread]} onPress={() => follow(notice)}>
              <Text style={s.rowTitle}>{!notice.is_read ? '● ' : ''}{notice.title}</Text>
              {!!notice.created_at && <Text style={s.note}>{new Date(notice.created_at).toLocaleString()}</Text>}
              <Text style={s.link}>Open request queue →</Text>
            </TouchableOpacity>)}
            {!!data && !data.notifications.length && <Text>No pending requests right now.</Text>}
            {!!data?.has_more && <Text style={s.note}>Showing the latest 100. The individual review queues contain all requests.</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: '#C74C4C', justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: '#FFF', fontWeight: '700', fontSize: 11 },
  overlay: { flex: 1, backgroundColor: 'rgba(40,25,22,0.5)', padding: 20, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 700, maxHeight: '90%', backgroundColor: '#FFFDF6', padding: 20, borderRadius: 14, gap: 13 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 15 },
  heading: { color: '#C15656', fontSize: 22, fontWeight: '700' },
  row: { padding: 14, borderWidth: 1, borderColor: '#E7DAD0', borderRadius: 10, gap: 7, backgroundColor: '#FFF' },
  unread: { backgroundColor: '#FFF0D9', borderColor: '#DFA56C' },
  rowTitle: { color: '#554139', fontWeight: '700' },
  link: { color: '#A74646', fontWeight: '700' },
  note: { color: '#7A6B64', fontSize: 12, lineHeight: 18 },
  error: { color: '#B00020' },
});
