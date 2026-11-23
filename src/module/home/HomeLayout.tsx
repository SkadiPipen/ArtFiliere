import BottomNavBar from "@/module/home/components/BottomNavbar";
import WebSidebar from "@/module/home/components/WebSidebar";
import { Stack, usePathname } from "expo-router";
import { useEffect, useState } from 'react';
import ArtistEarningsPanel, { ArtistEarningsContext } from '@/module/profile/ArtistEarningsPanel';
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { ContentModalRegion } from '@/components/ContentModal';
import { COLORS } from '@/constants/colors';
import WorkspaceMessages from './components/WorkspaceMessages';

const messagePages = new Set(['/activities', '/auction-dashboard', '/profile']);

export default function HomeLayout() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 768;
  const pathname = usePathname();
  const standaloneOnMobile = ['/report-management', '/artists', '/artist-profile', '/artist-post', '/auction-post', '/commissions', '/commission-detail', '/royalty-reports', '/support', '/my-portfolio', '/purchases'].includes(pathname) || pathname.startsWith('/artist/');
  const [earningsOpen, setEarningsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  useEffect(() => { setEarningsOpen(false); }, [pathname]);
  return (
    <ArtistEarningsContext.Provider value={() => setEarningsOpen(true)}>
    <View style={[styles.container, desktop && { flexDirection: 'row' }]}>
      {desktop && <View onLayout={event => setSidebarWidth(event.nativeEvent.layout.width)}><WebSidebar onNavigate={() => setEarningsOpen(false)} /></View>}
      <View style={styles.content} pointerEvents={earningsOpen ? 'none' : 'auto'} accessibilityElementsHidden={earningsOpen} importantForAccessibility={earningsOpen ? 'no-hide-descendants' : 'auto'}>
      <ContentModalRegion enabled={desktop && !earningsOpen}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.pageBackground } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="view-post" />
        <Stack.Screen name="cart" />
        <Stack.Screen name="activities" />

        <Stack.Screen name="auction-dashboard"/>
      </Stack>
      {!earningsOpen && messagePages.has(pathname) && <WorkspaceMessages key={pathname} />}
      </ContentModalRegion>
      </View>
      {!desktop && !standaloneOnMobile && <View pointerEvents={earningsOpen ? 'none' : 'auto'} accessibilityElementsHidden={earningsOpen} importantForAccessibility={earningsOpen ? 'no-hide-descendants' : 'auto'}><BottomNavBar /></View>}
      {earningsOpen && <ArtistEarningsPanel left={desktop ? sidebarWidth : 0} onDismiss={() => setEarningsOpen(false)} />}
    </View>
    </ArtistEarningsContext.Provider>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' },
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBackground,
    overflow: 'hidden',
  },
});
