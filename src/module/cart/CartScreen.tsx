import { useRouter } from "expo-router";
import { ArrowLeft, MoreHorizontal } from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { SafeAreaView } from "react-native-safe-area-context";

import CartCategory from "@/module/cart/components/CartCategory";
import CartFooter from "@/module/cart/components/CartFooter";
import CartItemRow from "@/module/cart/components/CartItemRow";
import { FilterType } from "@/module/cart/types";
import { useCart } from "@/context/CartContext";

export default function CartScreen() {
  const router = useRouter();
  const { cartItems, removeFromCart, updateQuantity } = useCart();
  const [activeFilter, setActiveFilter] = useState<FilterType>("All");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);

  const filteredItems = cartItems.filter((item) => {
    if (activeFilter === "All") return true;
    return item.type.toLowerCase() === activeFilter.toLowerCase();
  });

  const total = filteredItems.reduce((sum, item) => {
    if (!selectedItems.includes(item.id)) return sum;
    const price = parseFloat(item.price.replace(/,/g, "")) || 0;
    return sum + price * item.quantity;
  }, 0);

  const handleQuantityChange = (
    id: string,
    currentQty: number,
    change: number,
  ) => {
    updateQuantity(id, currentQty + change);
  };

  const toggleSelectItem = (id: string) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  const toggleArtistSelect = (artistName: string) => {
    const artistItemIds = filteredItems
      .filter((i) => i.artistName === artistName)
      .map((i) => i.id);
    const allSelected = artistItemIds.every((id) => selectedItems.includes(id));

    if (allSelected) {
      setSelectedItems(
        selectedItems.filter((id) => !artistItemIds.includes(id)),
      );
    } else {
      setSelectedItems([
        ...Array.from(new Set([...selectedItems, ...artistItemIds])),
      ]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredItems.map((item) => item.id));
    }
  };

  const handleRemove = (itemId: string) => {
    const executeRemove = () => {
      removeFromCart(itemId);
      setSelectedItems((prev) => prev.filter((id) => id !== itemId));
    };

    if (Platform.OS === "web") {
      if (window.confirm("Remove this artwork from your cart?"))
        executeRemove();
    } else {
      Alert.alert("Remove Item", "Remove this artwork from your cart?", [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: executeRemove },
      ]);
    }
  };

  const handleCheckout = async () => {
    const selected = filteredItems.filter((item) =>
      selectedItems.includes(item.id),
    );
    if (selected.length !== 1) {
      Alert.alert(
        "One artwork at a time",
        "Sandbox checkout currently supports one artwork per payment. Select one artwork to test the wallet.",
      );
      return;
    }
    if (!selected[0].artworkId) {
      Alert.alert(
        "Checkout unavailable",
        "This cart item was added before checkout support. Remove it and add the artwork again.",
      );
      return;
    }
    try {
      setCheckingOut(true);
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in again.");
      const response = await fetch(
        `${API_URL}/api/checkout/artworks/${selected[0].artworkId}/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.checkout_url)
        throw new Error(data.error || "Unable to create checkout.");
      await Linking.openURL(data.checkout_url);
    } catch (error: any) {
      Alert.alert(
        "Checkout",
        error.message || "Unable to open Xendit checkout.",
      );
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.topAppBar}>
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft color="#C15656" size={24} />
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>Cart</Text>
          <TouchableOpacity>
            <MoreHorizontal color="#000" size={24} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.centerContainer}>
        <CartCategory
          activeFilter={activeFilter}
          onSelectFilter={(f) => {
            setActiveFilter(f);
            setSelectedItems([]);
          }}
        />

        {filteredItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyStateNotice}>Your cart is empty</Text>
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item, index }) => {
              const showArtistHeader =
                index === 0 ||
                filteredItems[index - 1].artistName !== item.artistName;
              const isItemSelected = selectedItems.includes(item.id);

              return (
                <CartItemRow
                  item={item}
                  showArtistHeader={showArtistHeader}
                  isItemSelected={isItemSelected}
                  onToggleSelect={toggleSelectItem}
                  onToggleArtistSelect={toggleArtistSelect}
                  onQuantityChange={handleQuantityChange}
                  onRemove={handleRemove}
                />
              );
            }}
          />
        )}

        <CartFooter
          isAllSelected={
            selectedItems.length === filteredItems.length &&
            filteredItems.length > 0
          }
          selectedCount={selectedItems.length}
          totalPrice={total}
          onToggleSelectAll={toggleSelectAll}
          onCheckout={handleCheckout}
          checkingOut={checkingOut}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  topAppBar: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
    alignItems: "center",
    paddingVertical: 12,
  },
  headerInner: {
    width: "100%",
    maxWidth: 1100,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  appBarTitle: { fontSize: 22, fontWeight: "bold", color: "#C15656" },
  centerContainer: {
    flex: 1,
    width: "100%",
    maxWidth: 1100,
    alignSelf: "center",
    position: "relative",
  },
  listContainer: { paddingHorizontal: 16, paddingBottom: 200 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 250,
  },
  emptyStateNotice: { color: "#999", fontSize: 15 },
});
