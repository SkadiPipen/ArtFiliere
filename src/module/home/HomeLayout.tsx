import BottomNavBar from "@/module/home/components/BottomNavbar";
import WebSidebar from "@/module/home/components/WebSidebar";
import { Stack, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";

export default function HomeLayout() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 768;
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const compact = collapsed;
  useEffect(() => { setCollapsed(true); }, [pathname]);
  return (
    <View style={[styles.container, desktop && { flexDirection: 'row' }]}>
      {desktop && <WebSidebar compact={compact} onToggle={() => setCollapsed(!compact)} />}
      <View style={styles.content}>
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
      {!desktop && <BottomNavBar />}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, minWidth: 0 },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
