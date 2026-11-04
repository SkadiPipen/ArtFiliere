import { staffWorkspaceStyles as s } from '@/components/staffWorkspaceStyles';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Palette, LayoutDashboard, Inbox, UserCog, ShieldCheck, Brush, LogOut, ChevronRight, Info, type LucideIcon } from 'lucide-react-native';
import { router } from 'expo-router';
import { Text } from '@/components/Typography';
import { auth } from '@/firebase/config';
import SupportScreen from '@/module/support/SupportScreen';
import CreativeDashboardScreen from './CreativeDashboardScreen';
import ArtistRecordReviews from './ArtistRecordReviews';
import AttributionReviewsScreen from '@/module/blockchain/AttributionReviewsScreen';
import { useLocalSearchParams } from 'expo-router';

const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'artworks', label: 'Artwork reviews', icon: Brush },
  { id: 'queues', label: 'Concern queues', icon: Inbox },
  { id: 'records', label: 'Artist records', icon: UserCog },
  { id: 'attribution', label: 'Attribution & ownership', icon: ShieldCheck },
] as const;

type Section = typeof sections[number]['id'];

export default function CreativeWorkspace() {
  const { artworkId, section: requestedSection } = useLocalSearchParams<{ artworkId?: string; section?: string }>();
  const [section, setSection] = useState<Section>(artworkId ? 'artworks' : requestedSection === 'queues' ? 'queues' : 'overview');
  useEffect(() => {
    if (artworkId) setSection('artworks');
    else if (requestedSection === 'queues') setSection('queues');
  }, [artworkId, requestedSection]);
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
        <View style={s.brandRow}><Image source={require('../../../assets/images/logo.png')} style={s.logo} resizeMode="contain" /><View><Text style={s.brand}>ArtFiliere</Text><Text style={s.role}>CREATIVE MODERATOR</Text></View></View>
        <ScrollView horizontal={!desktop} style={{ flex: desktop ? 1 : undefined }} contentContainerStyle={[s.navigation, !desktop && { flexDirection: 'row' }]}>
          {sections.map(({ id, label, icon: Icon }) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: section === id }} onPress={() => navigate(id)} style={[s.navItem, section === id && s.navActive]}><Icon size={20} color={section === id ? '#A74646' : '#81756D'} /><Text style={[s.navLabel, section === id && { color: '#A74646', fontWeight: '700' }]}>{label}</Text></Pressable>)}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={logout} disabled={loggingOut} style={s.logout}><LogOut size={18} color="#A74646" /><Text style={{ color: '#A74646' }}>{loggingOut ? 'Logging out…' : 'Log out'}</Text></Pressable>
      </View>
      <View style={s.main}>
        <View style={s.topbar}><Palette size={22} color="#B65B50" /><Text style={s.workspace}>Creative moderation workspace</Text><Text style={s.muted}>{current.label}</Text></View>
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {section === 'queues' ? <SupportScreen moderator embedded onClose={() => navigate('overview')} /> : section === 'artworks' ? <CreativeDashboardScreen embedded /> : section === 'attribution' ? <AttributionReviewsScreen embedded /> : <ScrollView key={section} contentContainerStyle={s.content}>
          <View style={s.hero}><View style={s.titleRow}><current.icon size={30} color="#B65B50" /><Text accessibilityRole="header" style={s.title}>{section === 'overview' ? 'Creative Moderation' : current.label}</Text></View><Text style={s.intro}>{section === 'overview' ? 'Review artwork submissions, handle artist concerns, and verify ownership in one workspace.' : 'Review artist registration updates and supporting documents.'}</Text></View>
          {section === 'overview' && <>
            <View style={s.quickRow}>
              {quick('artworks', 'Artwork Reviews', 'Review pending submissions and reconsider declined artwork.', Brush)}
              {quick('queues', 'Concern Queues', 'Handle plagiarism reports and artwork-rejection appeals.', Inbox)}
              {quick('attribution', 'Attribution & Ownership', 'Review ownership evidence and blockchain records.', ShieldCheck)}
            </View>
            <View style={s.notice}><Info size={20} color="#A84B46" /><Text style={[s.muted, { flex: 1 }]}>Accept a concern from the queue to handle it, then continue your assigned cases from the same workspace. Review ownership evidence and similarity matches before recording an artwork decision.</Text></View>
            <View style={s.quickRow}>{quick('records', 'Artist Records', 'Review artist registration and BIR document updates.', UserCog)}</View>
          </>}
          {section === 'records' && <ArtistRecordReviews />}
        </ScrollView>}
      </View>
    </View>
  </SafeAreaView>;
}
