import useLogoutConfirmation from '@/components/useLogoutConfirmation';
import UserManagement from './UserManagement';
import { AdminRefreshContext } from './AdminRefresh';
import AccountApprovalWorkspace from './AccountApprovalWorkspace';
import { adminWorkspaceStyles as workspace, adminType } from './adminDesign';
import { TypographyDefaults } from '@/components/Typography';
import ResellerApprovals from './ResellerApprovals';
import ModeratorEvaluation from '@/module/hr/ModeratorEvaluation';
import RoyaltyApprovals from './RoyaltyApprovals';
import { AccountActions } from '@/module/moderation/ModeratorDashboard';
import AppealReviews from '@/module/moderation/AppealReviews';
import ArtworkCodeLookup from '@/app/artwork-code-lookup';

import { Text } from '@/components/Typography';
import type { AdminRequestCategories } from '@/components/AdminRequestBell';
import { purchaseRequest } from '@/services/purchases';
import { auth } from '@/firebase/config';
import { router } from 'expo-router';
import { ChartNoAxesCombined, LogOut, RefreshCcw, LayoutDashboard, Banknote, FileText, Store, ShieldCheck, Percent, UserCog, Users, ScanLine, Shield, Flag, ChevronDown, ChevronRight, Settings2, WalletCards, ClipboardCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';

type Tab = 'dashboard' | 'payments' | 'templates' | 'reports' | 'performance' | 'blockchain';
type AdminTabLink = { kind: 'tab'; key: Tab; label: string; path: string; icon: typeof LayoutDashboard };
type AdminSectionLink = { kind: 'section'; label: string; path: string; icon: typeof LayoutDashboard; categories?: string[] };
type AdminLink = AdminTabLink | AdminSectionLink;
const approvalQueues = [
  { icon: Users, label: 'Driver approvals', path: '/admin-driver-approvals', categories: ['driver'] },
  { icon: Users, label: 'Moderator approvals', path: '/admin-moderator-approvals', categories: ['moderator'] },
  { icon: Store, label: 'Reseller approvals', path: '/reseller-approvals', categories: ['reseller'] },
  { icon: Percent, label: 'Royalty approvals', path: '/royalty-approvals', categories: ['royalty'] },
  { icon: UserCog, label: 'Account action approvals', path: '/moderation-approvals', categories: ['account', 'account_support', 'appeal'] },
];
const navigationGroups: { id: string; label: string; icon: typeof LayoutDashboard; links: AdminLink[] }[] = [
  { id: 'monitoring', label: 'Monitoring', icon: Shield, links: [
    { kind: 'tab', key: 'blockchain', label: 'Blockchain investigations', icon: ShieldCheck, path: '/admin-blockchain' },
    { kind: 'tab', key: 'performance', label: 'Performance', icon: ChartNoAxesCombined, path: '/admin-performance' },
  ] },
  { id: 'finance', label: 'Finance', icon: WalletCards, links: [
    { kind: 'tab', key: 'reports', label: 'Reports & transactions', icon: Flag, path: '/admin-reports' },
    { kind: 'tab', key: 'payments', label: 'Payment controls', icon: Banknote, path: '/admin-payments' },
  ] },
  { id: 'approvals', label: 'Approvals', icon: ClipboardCheck, links: approvalQueues.map(({ icon, label, path, categories }) => ({ kind: 'section' as const, icon, label, path, categories })) },
  { id: 'administration', label: 'Administration', icon: Settings2, links: [
    { kind: 'tab', key: 'templates', label: 'Platform defaults', icon: FileText, path: '/admin-agreement-templates' },
    { kind: 'section', label: 'User management', icon: Users, path: 'users' },
    { kind: 'section', label: 'Artwork code lookup', icon: ScanLine, path: 'lookup' },
  ] },
];

export default function AdminPage({ activeTab, children, onRefresh, initialSection = null }: { activeTab: Tab; children: ReactNode; onRefresh?: () => void; initialSection?: string | null }) {
  const { requestLogout, logoutConfirmation } = useLogoutConfirmation();
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
  const [section, setSection] = useState<string | null>(initialSection);
  const initialGroup = activeTab === 'blockchain' || activeTab === 'performance' ? 'monitoring' : activeTab === 'reports' || activeTab === 'payments' ? 'finance' : null;
  const [expandedGroup, setExpandedGroup] = useState<string | null>(initialSection ? (approvalQueues.some(queue => queue.path === initialSection) ? 'approvals' : 'administration') : initialGroup);
  const [logoutError, setLogoutError] = useState('');
  const overview = { key: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: '/admin-dashboard' } as const;
  const current = section === 'users' ? 'User management' : section === 'lookup' ? 'Artwork code lookup' : approvalQueues.find(queue => queue.path === section)?.label || navigationGroups.flatMap(group => group.links).find(link => link.kind === 'tab' && link.key === activeTab)?.label || overview.label;
  const groupPending = (groupId: string) => navigationGroups.find(group => group.id === groupId)?.links.reduce((total, link) => total + ('categories' in link && link.categories ? link.categories.reduce((sum, key) => sum + (categories[key]?.pending || 0), 0) : link.kind === 'tab' && link.key === 'blockchain' ? (categories.attribution?.pending || 0) + (categories.blockchain?.pending || 0) : 0), 0) || 0;
  const isLinkActive = (link: AdminLink) => link.kind === 'tab' ? !section && activeTab === link.key : section === link.path;
  const selectLink = (link: AdminLink) => {
    if (link.kind === 'tab') { setSection(null); if (activeTab !== link.key) router.replace(link.path as any); }
    else setSection(link.path);
  };
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
      <View style={workspace.brandRow}><Image source={require('../../../assets/images/logo.png')} style={workspace.logo} resizeMode="contain" /><View><Text style={workspace.brand}>ArtFilier</Text><Text style={workspace.role}>PLATFORM ADMIN</Text></View></View>
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, maxHeight: desktop ? undefined : 360 }} contentContainerStyle={workspace.navigation}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: !section && activeTab === 'dashboard' }} onPress={() => { setSection(null); if (activeTab !== 'dashboard') router.replace(overview.path as any); }} style={[workspace.navItem, !section && activeTab === 'dashboard' && workspace.navActive]}><LayoutDashboard size={20} color="#A74646" /><Text style={workspace.navLabel}>{overview.label}</Text></Pressable>
        {navigationGroups.map(group => {
          const GroupIcon = group.icon;
          const expanded = expandedGroup === group.id;
          const groupSelected = group.links.some(isLinkActive);
          const pending = groupPending(group.id);
          return <View key={group.id}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded, selected: groupSelected }} onPress={() => setExpandedGroup(expanded ? null : group.id)} style={[workspace.navItem, groupSelected && !expanded && workspace.navActive]}>
              <GroupIcon size={20} color="#A74646" /><Text style={[workspace.navLabel, { flex: 1 }]}>{group.label}</Text>
              {pending > 0 && <View style={s.badge}><Text style={s.badgeText}>{pending > 99 ? '99+' : pending}</Text></View>}
              {expanded ? <ChevronDown size={17} color="#8B8078" /> : <ChevronRight size={17} color="#8B8078" />}
            </Pressable>
            {expanded && <View style={s.submenu}>{group.links.map(link => {
              const Icon = link.icon;
              const pendingCount = 'categories' in link && link.categories ? link.categories.reduce((count, key) => count + (categories[key]?.pending || 0), 0) : link.kind === 'tab' && link.key === 'blockchain' ? (categories.attribution?.pending || 0) + (categories.blockchain?.pending || 0) : 0;
              const selected = isLinkActive(link);
              return <Pressable key={link.path} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={pendingCount > 0 ? `${link.label}, ${pendingCount} pending` : link.label} onPress={() => selectLink(link)} style={[s.submenuItem, selected && workspace.navActive]}>
                <Icon size={17} color="#A74646" /><Text style={[workspace.navLabel, { flex: 1 }]}>{link.label}</Text>
                {pendingCount > 0 && <View style={s.badge}><Text style={s.badgeText}>{pendingCount > 99 ? '99+' : pendingCount}</Text></View>}
              </Pressable>;
            })}</View>}
          </View>;
        })}
      </ScrollView>
      {!!logoutError && <Text style={workspace.error}>{logoutError}</Text>}
      <Pressable accessibilityRole="button" onPress={() => requestLogout(async () => { try { await auth.signOut(); router.replace('/login'); } catch { setLogoutError('Unable to log out. Please try again.'); } })} style={workspace.logout}><LogOut size={18} color="#A74646" /><Text style={{ color: '#A74646' }}>Log out</Text></Pressable>
      {logoutConfirmation}
    </View>
    <View style={workspace.main}>
      <View style={workspace.topbar}><Shield size={22} color="#B65B50" /><Text style={workspace.workspace}>Platform administration</Text><Text style={workspace.muted}>{current}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh current admin section" disabled={refreshing} onPress={() => void refreshCurrent()} style={{ padding: 8, opacity: refreshing ? 0.4 : 1 }}><RefreshCcw size={20} color="#A74646" /></TouchableOpacity></View>
      {!!refreshError && <Text style={workspace.error}>{refreshError}</Text>}
      {!section ? children : section === 'lookup' ? <ArtworkCodeLookup /> : <ScrollView key={section} contentContainerStyle={workspace.content}>
        {section === 'users' && <UserManagement />}
        {section === '/reseller-approvals' && <ResellerApprovals workspace />}
        {section === '/admin-moderator-approvals' && <ModeratorEvaluation admin />}
        {section === '/admin-driver-approvals' && <ModeratorEvaluation admin driver />}
        {section === '/royalty-approvals' && <RoyaltyApprovals workspace />}
        {section === '/moderation-approvals' && <AccountApprovalWorkspace />}
      </ScrollView>}
    </View>
  </View></AdminRefreshContext.Provider></TypographyDefaults.Provider>;
}
const s = StyleSheet.create({
  badge: { minWidth: 21, height: 21, paddingHorizontal: 5, borderRadius: 11, backgroundColor: '#C74C4C', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  submenu: { marginLeft: 18, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: '#E8DAD2', gap: 3, marginBottom: 4 },
  submenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12 },
});
