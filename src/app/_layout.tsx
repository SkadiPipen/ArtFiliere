import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/providers/AuthProvider";
import { Stack } from "expo-router";
import ContentProtection from "@/components/ContentProtection";

export default function RootLayout() {
  return (
    <AuthProvider>
      <CartProvider>
        <ContentProtection />
        <Stack screenOptions={{ headerShown: false }} />
      </CartProvider>
    </AuthProvider>
  );
}
