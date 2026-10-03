import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/providers/AuthProvider";
import { Stack } from "expo-router";
import ContentProtection from "@/components/ContentProtection";
import AccountRestrictionNotice from '@/components/AccountRestrictionNotice';
import ReadOnlyRequestGuard from '@/components/ReadOnlyRequestGuard';

export default function RootLayout() {
  return (
    <AuthProvider>
      <CartProvider>
        <ContentProtection />
        <Stack screenOptions={{ headerShown: false }} />
        <AccountRestrictionNotice />
        <ReadOnlyRequestGuard />
      </CartProvider>
    </AuthProvider>
  );
}
