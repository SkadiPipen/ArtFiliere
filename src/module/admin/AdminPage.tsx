import { AdminRefreshContext } from './AdminRefresh';
import AccountApprovalWorkspace from './AccountApprovalWorkspace';
import { adminWorkspaceStyles as workspace, adminType } from './adminDesign';
import { TypographyDefaults } from '@/components/Typography';
import ResellerApprovals from './ResellerApprovals';
import RoyaltyApprovals from './RoyaltyApprovals';
import AttributionReviewsScreen from '@/module/blockchain/AttributionReviewsScreen';
import { AccountActions } from '@/module/moderation/ModeratorDashboard';
import AppealReviews from '@/module/moderation/AppealReviews';
import ArtworkCodeLookup from '@/app/artwork-code-lookup';

import { Text } from '@/components/Typography';
import type { AdminRequestCategories } from '@/components/AdminRequestBell';
import { purchaseRequest } from '@/services/purchases';
import { auth } from '@/firebase/config';
import { router } from 'expo-router';
import { LogOut, RefreshCcw, LayoutDashboard, Banknote, FileText, Store, ShieldCheck, Percent, UserCog, ScanLine, Shield, Flag } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';

type Tab = 'dashboard' | 'payments' | 'templates' | 'reports';
const tabs = [
  { key: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin-dashboard' },
  { key: 'reports', label: 'Reports & transactions', icon: Flag, path: '/admin-reports' },
  { key: 'payments', label: 'Payment controls', icon: Banknote, path: '/admin-payments' },
  { key: 'templates', label: 'Platform defaults', icon: FileText, path: '/admin-agreement-templates' },
] as const;
const approvalQueues = [
  { icon: Store, label: 'Reseller approvals', path: '/reseller-approvals', categories: ['reseller'] },
  { icon: ShieldCheck, label: 'Attribution reviews', path: '/attribution-reviews', categories: ['attribution', 'blockchain'] },
  { icon: Percent, label: 'Royalty approvals', path: '/royalty-approvals', categories: ['royalty'] },
  { icon: UserCog, label: 'Account action approvals', path: '/moderation-approvals', categories: ['account', 'account_support', 'appeal'] },
];

export default function AdminPage({ activeTab, children, onRefresh }: { activeTab: Tab; children: ReactNode; onRefresh?: () => void }) {
  const refreshers = useRef(new Set<() => void | Promise<unknown>>());
  const registerRefresh = useCallback((refresh: () => void | Promise<unknown>) => { refreshers.current.add(refresh); return () => { refreshers.current.delete(refresh); }; }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [notificationRevision, setNotificationRevision] = useState(0);
  const refreshCurrent = async () => {
    if (refreshing) return;
    setRefreshing(true); setRefreshError('');
    try { await Promise.all([...refreshers.current].map(refresh => refresh())); if (!section) await onRefresh?.(); setNotificationRevision(value => value + 1); }
    catch { setRefreshError('Unable to refresh. Please try again.'); }
    finally { setRefreshing(false); }
  };
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const [section, setSection] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState('');
  const current = section === 'lookup' ? 'Artwork code lookup' : approvalQueues.find(queue => queue.path === section)?.label || tabs.find(tab => tab.key === activeTab)!.label;
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
  }, [notificationRevision]);
  return <TypographyDefaults.Provider value={{ text: adminType.body, input: adminType.input }}><AdminRefreshContext.Provider value={registerRefresh}><View style={[workspace.page, { flexDirection: desktop ? 'row' : 'column' }]}>
    <View style={[workspace.sidebar, !desktop && { width: '100%', borderRightWidth: 0, borderBottomWidth: 1 }]}>
      <View style={workspace.brandRow}><Image source={require('../../../assets/images/logo.png')} style={workspace.logo} resizeMode="contain" /><View><Text style={workspace.brand}>ArtFiliere</Text><Text style={workspace.role}>PLATFORM ADMIN</Text></View></View>
      <ScrollView horizontal={!desktop} style={{ flex: desktop ? 1 : undefined }} contentContainerStyle={[workspace.navigation, !desktop && { flexDirection: 'row' }]}>
        {tabs.map(({ key, label, path, icon: Icon }) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: !section && activeTab === key }} onPress={() => { setSection(null); if (activeTab !== key) router.replace(path as any); }} style={[workspace.navItem, !section && activeTab === key && workspace.navActive]}><Icon size={20} color="#A74646" /><Text style={workspace.navLabel}>{label}</Text></Pressable>)}
        {approvalQueues.map(({ label, path, categories: keys, icon: Icon }) => {
          const pending = keys.reduce((count, key) => count + (categories[key]?.pending || 0), 0);
          return <Pressable key={path} accessibilityRole="button" accessibilityState={{ selected: section === path }} accessibilityLabel={`${label}, ${pending} pending`} onPress={() => setSection(path)} style={[workspace.navItem, section === path && workspace.navActive]}><Icon size={20} color="#A74646" /><Text style={[workspace.navLabel, { flex: 1 }]}>{label}</Text>{pending > 0 && <View style={s.badge}><Text style={s.badgeText}>{pending > 99 ? '99+' : pending}</Text></View>}</Pressable>;
        })}
        <Pressable accessibilityRole="button" accessibilityState={{ selected: section === 'lookup' }} onPress={() => setSection('lookup')} style={[workspace.navItem, section === 'lookup' && workspace.navActive]}><ScanLine size={20} color="#A74646" /><Text style={workspace.navLabel}>Artwork code lookup</Text></Pressable>

      </ScrollView>
      {!!logoutError && <Text style={workspace.error}>{logoutError}</Text>}
      <Pressable accessibilityRole="button" onPress={async () => { try { await auth.signOut(); router.replace('/login'); } catch { setLogoutError('Unable to log out. Please try again.'); } }} style={workspace.logout}><LogOut size={18} color="#A74646" /><Text style={{ color: '#A74646' }}>Log out</Text></Pressable>
    </View>
    <View style={workspace.main}>
      <View style={workspace.topbar}><Shield size={22} color="#B65B50" /><Text style={workspace.workspace}>Platform administration</Text><Text style={workspace.muted}>{current}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh current admin section" disabled={refreshing} onPress={() => void refreshCurrent()} style={{ padding: 8, opacity: refreshing ? 0.4 : 1 }}><RefreshCcw size={20} color="#A74646" /></TouchableOpacity></View>
      {!!refreshError && <Text style={workspace.error}>{refreshError}</Text>}
      {!section ? children : section === 'lookup' ? <ArtworkCodeLookup /> : section === '/attribution-reviews' ? <AttributionReviewsScreen embedded /> : <ScrollView key={section} contentContainerStyle={workspace.content}>
        {section === '/reseller-approvals' && <ResellerApprovals workspace />}
        {section === '/royalty-approvals' && <RoyaltyApprovals workspace />}
        {section === '/moderation-approvals' && <AccountApprovalWorkspace />}
      </ScrollView>}
    </View>
  </View></AdminRefreshContext.Provider></TypographyDefaults.Provider>;
}
const s = StyleSheet.create({
  badge: { minWidth: 21, height: 21, paddingHorizontal: 5, borderRadius: 11, backgroundColor: '#C74C4C', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
});
