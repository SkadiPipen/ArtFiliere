import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/providers/AuthProvider";
import { Stack } from "expo-router";
import ContentProtection from "@/components/ContentProtection";
import AccountRestrictionNotice from '@/components/AccountRestrictionNotice';
import ReadOnlyRequestGuard from '@/components/ReadOnlyRequestGuard';
import PaymentReturnMonitor from '@/components/PaymentReturnMonitor';
import { useFonts } from 'expo-font';
import { appFonts } from '@/components/Typography';
import { ActivityIndicator, View } from 'react-native';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: '#FAF7F4', justifyContent: 'center' }}><ActivityIndicator color="#C15656" /></View>;
  return (
    <AuthProvider>
      <CartProvider>
        <ContentProtection />
        <Stack screenOptions={{ headerShown: false }} />
        <AccountRestrictionNotice />
        <ReadOnlyRequestGuard />
        <PaymentReturnMonitor />
      </CartProvider>
    </AuthProvider>
  );
}
