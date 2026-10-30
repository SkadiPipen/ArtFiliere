import { Text } from '@/components/Typography';
import type { AdminRequestCategories } from '@/components/AdminRequestBell';
import { purchaseRequest } from '@/services/purchases';
import { auth } from '@/firebase/config';
import { router } from 'expo-router';
import { LogOut, RefreshCcw } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

type Tab = 'dashboard' | 'payments' | 'templates';
const tabs = [
  { key: 'dashboard', label: 'Dashboard', path: '/admin-dashboard' },
  { key: 'payments', label: 'Payment Controls', path: '/admin-payments' },
  { key: 'templates', label: 'Agreement Templates', path: '/admin-agreement-templates' },
] as const;
const approvalQueues = [
  { label: 'Reseller approvals', path: '/reseller-approvals', categories: ['reseller'] },
  { label: 'Attribution reviews', path: '/attribution-reviews', categories: ['attribution', 'blockchain'] },
  { label: 'Royalty approvals', path: '/royalty-approvals', categories: ['royalty'] },
  { label: 'Account action approvals', path: '/moderation-approvals', categories: ['account', 'account_support', 'appeal'] },
];

export default function AdminPage({ activeTab, children, onRefresh }: { activeTab: Tab; children: ReactNode; onRefresh?: () => void }) {
  const [categories, setCategories] = useState<AdminRequestCategories>({});
  useEffect(() => {
    let active = true;
    let latest = 0;
    const refresh = async () => {
      const sequence = ++latest;
      try {
        await auth.authStateReady();
        if (!auth.currentUser) return;
        const result = await purchaseRequest('users/admin/request-notifications/');
        if (active && sequence === latest) setCategories(result.categories);
      } catch { /* Preserve the last counts while the connection is unavailable. */ }
    };
    void refresh();
    const interval = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(interval); };
  }, []);
  return <View style={s.page}>
    <View style={s.header}>
      <View><Text style={s.brand}>ArtFiliere</Text><Text style={s.role}>PLATFORM ADMIN</Text></View>
      <View style={s.actions}>
        {approvalQueues.map(queue => {
          const pending = queue.categories.reduce((count, category) => count + (categories[category]?.pending || 0), 0);
          return <TouchableOpacity key={queue.path} accessibilityRole="button" accessibilityLabel={`${queue.label}, ${pending} pending`} onPress={() => router.push(queue.path as any)} style={s.button}>
            <Text>{queue.label}</Text>
            {pending > 0 && <View style={s.badge}><Text style={s.badgeText}>{pending > 99 ? '99+' : pending}</Text></View>}
          </TouchableOpacity>;
        })}
        {!!onRefresh && <TouchableOpacity accessibilityLabel="Refresh admin data" onPress={onRefresh} style={s.button}><RefreshCcw size={18} color="#5A4039" /></TouchableOpacity>}
        <TouchableOpacity onPress={async () => { await auth.signOut(); router.replace('/login'); }} style={s.button}><LogOut size={18} color="#5A4039" /><Text>Log out</Text></TouchableOpacity>
      </View>
    </View>
    <View style={s.nav}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
      {tabs.map(tab => <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab.key }} key={tab.key} onPress={() => { if (activeTab !== tab.key) router.replace(tab.path as any); }} style={[s.tab, activeTab === tab.key && s.selected]}>
        <Text style={[s.tabText, activeTab === tab.key && s.selectedText]}>{tab.label}</Text>
      </TouchableOpacity>)}
    </ScrollView></View>
    {children}
  </View>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFDF5' }, header: { backgroundColor: '#FFF8D6', borderBottomWidth: 1, borderColor: '#E3D8CC', padding: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  brand: { color: '#D45C5C', fontSize: 26, fontWeight: '800' }, role: { color: '#8B6E49', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 8 }, button: { position: 'relative', overflow: 'visible', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: '#FFF', borderRadius: 16 },
  badge: { position: 'absolute', top: -8, right: -5, zIndex: 1, minWidth: 21, height: 21, paddingHorizontal: 5, borderRadius: 11, borderWidth: 1.5, borderColor: '#FFF', backgroundColor: '#C74C4C', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  nav: { backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E3D8CC' }, tabs: { paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  tab: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F5EDE7' }, selected: { backgroundColor: '#C15656' }, tabText: { color: '#746865', fontWeight: '700' }, selectedText: { color: '#FFF' },
});
