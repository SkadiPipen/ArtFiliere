import BottomNavBar from "@/module/home/components/BottomNavbar";
import WebSidebar from "@/module/home/components/WebSidebar";
import { Stack, usePathname } from "expo-router";
import { useEffect, useState } from 'react';
import ArtistEarningsPanel, { ArtistEarningsContext } from '@/module/profile/ArtistEarningsPanel';
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";

export default function HomeLayout() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 768;
  const pathname = usePathname();
  const [earningsOpen, setEarningsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  useEffect(() => { setEarningsOpen(false); }, [pathname]);
  return (
    <ArtistEarningsContext.Provider value={() => setEarningsOpen(true)}>
    <View style={[styles.container, desktop && { flexDirection: 'row' }]}>
      {desktop && <View onLayout={event => setSidebarWidth(event.nativeEvent.layout.width)}><WebSidebar onNavigate={() => setEarningsOpen(false)} /></View>}
      <View style={styles.content} pointerEvents={earningsOpen ? 'none' : 'auto'} accessibilityElementsHidden={earningsOpen} importantForAccessibility={earningsOpen ? 'no-hide-descendants' : 'auto'}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="view-post" />
        <Stack.Screen name="cart" />
        <Stack.Screen name="activities" />

        <Stack.Screen name="auction-dashboard"/>
      </Stack>
      </View>
      {!desktop && <View pointerEvents={earningsOpen ? 'none' : 'auto'} accessibilityElementsHidden={earningsOpen} importantForAccessibility={earningsOpen ? 'no-hide-descendants' : 'auto'}><BottomNavBar /></View>}
      {earningsOpen && <ArtistEarningsPanel left={desktop ? sidebarWidth : 0} onDismiss={() => setEarningsOpen(false)} />}
    </View>
    </ArtistEarningsContext.Provider>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, minWidth: 0 },
  container: {
    flex: 1,
    backgroundColor: "#fff",
    overflow: 'hidden',
  },
});
