import { staffWorkspaceStyles as s } from '@/components/staffWorkspaceStyles';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Headset, LayoutDashboard, Inbox, RotateCcw, UserCog, ShieldCheck, Brush, ScanLine, LogOut, ChevronRight, Info, type LucideIcon } from 'lucide-react-native';
import { router } from 'expo-router';
import { Text } from '@/components/Typography';
import { auth } from '@/firebase/config';
import SupportScreen from './SupportScreen';
import AppealReviews from '@/module/moderation/AppealReviews';
import CommissionWorkspace from '@/module/commissions/CommissionWorkspace';
import CommissionReviews from '@/module/commissions/CommissionReviews';
import { AccountActions, ReturnRequests } from '@/module/moderation/ModeratorDashboard';
import ArtworkCodeLookup from '@/app/artwork-code-lookup';

const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'queues', label: 'Concern queues', icon: Inbox },
  { id: 'returns', label: 'Returns & refunds', icon: RotateCcw },
  { id: 'accounts', label: 'Account requests', icon: UserCog },
  { id: 'appeals', label: 'Restriction appeals', icon: ShieldCheck },
  { id: 'commissions', label: 'Commission reviews', icon: Brush },
  { id: 'lookup', label: 'Artwork code lookup', icon: ScanLine },
] as const;
type Section = typeof sections[number]['id'];

export default function CustomerSupportDashboard() {
  const [section, setSection] = useState<Section>('overview');
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const current = sections.find(item => item.id === section)!;
  const navigate = (value: Section) => { setSection(value); setError(''); };
  const logout = async () => {
    setLoggingOut(true);
    try { await auth.signOut(); router.replace('/login'); }
    catch { setError('Unable to log out. Please try again.'); }
    finally { setLoggingOut(false); }
  };
  const quick = (id: Section, title: string, detail: string, Icon: LucideIcon) => <Pressable key={id} accessibilityRole="button" onPress={() => navigate(id)} style={s.quickCard}>
    <View style={s.iconTile}><Icon size={24} color="#B65B50" /></View>
    <View style={{ flex: 1, gap: 6 }}><Text style={s.quickTitle}>{title}</Text><Text style={s.muted}>{detail}</Text></View>
    <ChevronRight size={18} color="#A84B46" />
  </Pressable>;
  return <SafeAreaView style={s.page}>
    <View style={[s.shell, { flexDirection: desktop ? 'row' : 'column' }]}>
      <View style={[s.sidebar, !desktop && { width: '100%', borderRightWidth: 0, borderBottomWidth: 1 }]}>
        <View style={s.brandRow}><Image source={require('../../../assets/images/logo.png')} style={s.logo} resizeMode="contain" /><View><Text style={s.brand}>ArtFiliere</Text><Text style={s.role}>CUSTOMER SUPPORT</Text></View></View>
        <ScrollView horizontal={!desktop} style={{ flex: desktop ? 1 : undefined }} contentContainerStyle={[s.navigation, !desktop && { flexDirection: 'row' }]}>
          {sections.map(({ id, label, icon: Icon }) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: section === id }} onPress={() => navigate(id)} style={[s.navItem, section === id && s.navActive]}><Icon size={20} color={section === id ? '#A74646' : '#81756D'} /><Text style={[s.navLabel, section === id && { color: '#A74646', fontWeight: '700' }]}>{label}</Text></Pressable>)}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={logout} disabled={loggingOut} style={s.logout}><LogOut size={18} color="#A74646" /><Text style={{ color: '#A74646' }}>{loggingOut ? 'Logging out…' : 'Log out'}</Text></Pressable>
      </View>
      <View style={s.main}>
        <View style={s.topbar}><Headset size={22} color="#B65B50" /><Text style={s.workspace}>Customer support workspace</Text><Text style={s.muted}>{current.label}</Text></View>
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {section === 'queues' ? <SupportScreen moderator embedded onClose={() => navigate('overview')} /> : section === 'lookup' ? <ArtworkCodeLookup /> : <ScrollView key={section} contentContainerStyle={s.content}>
          <View style={s.hero}><View style={s.titleRow}><current.icon size={30} color="#B65B50" /><Text accessibilityRole="header" style={s.title}>{section === 'overview' ? 'Customer Support' : current.label}</Text></View><Text style={s.intro}>{section === 'overview' ? 'Manage buyer and artist concerns, review returns and refunds, and track account requests in one workspace.' : 'Review cases and record decisions in your customer support workspace.'}</Text></View>
          {section === 'overview' && <>
            <View style={s.quickRow}>
              {quick('queues', 'Customer Service Queues', 'Review waiting concerns and continue your assigned cases.', Inbox)}
              {quick('returns', 'Returns & Refunds', 'Review transaction requests and payment concerns.', RotateCcw)}
              {quick('accounts', 'Account Requests', 'Track restriction requests and admin decisions.', UserCog)}
            </View>
            <View style={s.notice}><Info size={20} color="#A84B46" /><Text style={[s.muted, { flex: 1 }]}>Plagiarism reports and artwork-rejection appeals go to the Creative Director. Other concerns share the Customer Support queue. Accept a concern to handle it; transfers require confirmation from the receiving moderator.</Text></View>
            <View style={s.reviewRow}><View style={s.reviewColumn}><AppealReviews /></View><View style={s.reviewColumn}><CommissionWorkspace review /></View></View>
          </>}
          {section === 'returns' && <ReturnRequests />}
          {section === 'accounts' && <AccountActions />}
          {section === 'appeals' && <AppealReviews />}
          {section === 'commissions' && <><CommissionWorkspace review /><CommissionReviews /></>}
        </ScrollView>}
      </View>
    </View>
  </SafeAreaView>;
}
