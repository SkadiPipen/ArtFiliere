import { Text } from '@/components/Typography';
import { auth } from '@/firebase/config';
import { router } from 'expo-router';
import { LogOut, RefreshCcw } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

type Tab = 'dashboard' | 'payments' | 'templates';
const tabs = [
  { key: 'dashboard', label: 'Dashboard', path: '/admin-dashboard' },
  { key: 'payments', label: 'Payment Controls', path: '/admin-payments' },
  { key: 'templates', label: 'Agreement Templates', path: '/admin-agreement-templates' },
] as const;

export default function AdminPage({ activeTab, children, onRefresh }: { activeTab: Tab; children: ReactNode; onRefresh?: () => void }) {
  return <View style={s.page}>
    <View style={s.header}>
      <View><Text style={s.brand}>ArtFiliere</Text><Text style={s.role}>PLATFORM ADMIN</Text></View>
      <View style={s.actions}>
        <TouchableOpacity onPress={() => router.push('/attribution-reviews' as any)} style={s.button}><Text>Attribution reviews</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/royalty-approvals' as any)} style={s.button}><Text>Royalty approvals</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/moderation-approvals' as any)} style={s.button}><Text>Account action approvals</Text></TouchableOpacity>
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: '#FFF', borderRadius: 16 },
  nav: { backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E3D8CC' }, tabs: { paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  tab: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F5EDE7' }, selected: { backgroundColor: '#C15656' }, tabText: { color: '#746865', fontWeight: '700' }, selectedText: { color: '#FFF' },
});
