import { useRouter } from 'expo-router';
import { ArrowLeft, MoreHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CartCategory from '@/components/cart/CartCategory';
import CartFooter from '@/components/cart/CartFooter';
import CartItemRow from '@/components/cart/CartItemRow';
import { FilterType } from '@/components/cart/types';
import { useCart } from '@/context/CartContext';

export default function CartScreen() {
  const router = useRouter();
  const { cartItems, removeFromCart, updateQuantity } = useCart();
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const filteredItems = cartItems.filter((item) => {
    if (activeFilter === 'All') return true;
    return item.type.toLowerCase() === activeFilter.toLowerCase();
  });

  const total = filteredItems.reduce((sum, item) => {
    if (!selectedItems.includes(item.id)) return sum;
    const price = parseFloat(item.price.replace(/,/g, '')) || 0;
    return sum + price * item.quantity;
  }, 0);

  const toggleSelectItem = (id: string) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  const toggleArtistSelect = (artistName: string) => {
    const artistItemIds = filteredItems.filter((i) => i.artistName === artistName).map((i) => i.id);
    const allSelected = artistItemIds.every((id) => selectedItems.includes(id));

    if (allSelected) {
      setSelectedItems(selectedItems.filter((id) => !artistItemIds.includes(id)));
    } else {
      setSelectedItems([...Array.from(new Set([...selectedItems, ...artistItemIds]))]);
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

    if (Platform.OS === 'web') {
      if (window.confirm('Remove this artwork from your cart?')) executeRemove();
    } else {
      Alert.alert('Remove Item', 'Remove this artwork from your cart?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: executeRemove },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
                index === 0 || filteredItems[index - 1].artistName !== item.artistName;
              const isItemSelected = selectedItems.includes(item.id);

              return (
                <CartItemRow
                  item={item}
                  showArtistHeader={showArtistHeader}
                  isItemSelected={isItemSelected}
                  onToggleSelect={toggleSelectItem}
                  onToggleArtistSelect={toggleArtistSelect}
                  onQuantityChange={updateQuantity}
                  onRemove={handleRemove}
                />
              );
            }}
          />
        )}

        <CartFooter
          isAllSelected={selectedItems.length === filteredItems.length && filteredItems.length > 0}
          selectedCount={selectedItems.length}
          totalPrice={total}
          onToggleSelectAll={toggleSelectAll}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topAppBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
    alignItems: 'center',
    paddingVertical: 12,
  },
  headerInner: {
    width: '100%',
    maxWidth: 1100,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appBarTitle: { fontSize: 22, fontWeight: 'bold', color: '#C15656' },
  centerContainer: { flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center' },
  listContainer: { paddingHorizontal: 16, paddingBottom: 120 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 250 },
  emptyStateNotice: { color: '#999', fontSize: 15 },
});