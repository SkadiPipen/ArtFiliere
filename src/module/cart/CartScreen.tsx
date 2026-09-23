import MyPurchases from '@/module/profile/MyPurchases';
import SigningModal from '@/module/chat-negotiations/SigningModal';
import ContractPanel from '@/module/chat-negotiations/ContractPanel';
import { Contract, contractRequest, isAgreed, readApiResponse } from '@/module/chat-negotiations/contracts';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { ArrowLeft, MoreHorizontal } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { SafeAreaView } from 'react-native-safe-area-context';

import CartCategory from '@/module/cart/components/CartCategory';
import CartFooter from '@/module/cart/components/CartFooter';
import CartItemRow from '@/module/cart/components/CartItemRow';
import { FilterType } from '@/module/cart/types';
import { useCart } from '@/context/CartContext';

export default function CartScreen() {
  const router = useRouter();
  const [checkoutError, setCheckoutError] = useState('');
  const [showPurchases, setShowPurchases] = useState(false);
  const { cartItems, removeFromCart, loading: cartLoading, error: cartError, refreshCart } = useCart();
  const refreshCartRef = useRef(refreshCart);
  refreshCartRef.current = refreshCart;
  useFocusEffect(useCallback(() => {
    refreshCartRef.current();
    const timer = setInterval(() => refreshCartRef.current(), 5000);
    return () => clearInterval(timer);
  }, []));
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractArtwork, setContractArtwork] = useState<string | null>(null);
  const refreshContracts = useCallback(async () => {
    try { setContracts((await contractRequest()).contracts); }
    catch { setContracts([]); }
  }, []);
  useFocusEffect(useCallback(() => { refreshContracts(); const timer = setInterval(refreshContracts, 5000); return () => clearInterval(timer); }, [refreshContracts]));
  const latestFor = (id: string) => contracts.filter(c => String(c.artwork_id) === id).sort((a, b) => b.id - a.id)[0];
  const ongoingFor = (id: string) => latestFor(id)?.status === 'proposed';
  const agreedFor = (id: string) => contracts.find(c => String(c.artwork_id) === id && isAgreed(c));
  const [signingId, setSigningId] = useState<number | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const filteredItems = cartItems.filter((item) => {
    if (activeFilter === 'All') return true;
    return item.type.toLowerCase() === activeFilter.toLowerCase();
  });

  const total = filteredItems.reduce((sum, item) => {
    if (!selectedItems.includes(item.id)) return sum;
    const price = Number(agreedFor(item.artworkId)?.price || item.price.replace(/,/g, '')) || 0;
    return sum + price;
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
    const executeRemove = async () => {
      try { await removeFromCart(itemId); await refreshContracts(); } catch (error: any) { Alert.alert('Cart', error.message); return; }
      setSelectedItems((prev) => prev.filter((id) => id !== itemId));
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Remove this artwork and cancel its unpaid negotiation?')) executeRemove();
    } else {
      Alert.alert('Remove Item', 'Remove this artwork and cancel its unpaid negotiation?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: executeRemove },
      ]);
    }
  };

  const handleCheckout = async () => {
    setCheckoutError('');
    const selected = filteredItems.filter((item) => selectedItems.includes(item.id));
    if (selected.length !== 1) {
      setCheckoutError('Select one artwork to check out under its agreed contract.');
      return;
    }
    if (!selected[0].artworkId) {
      setCheckoutError('This cart item was added before checkout support. Remove it and add the artwork again.');
      return;
    }
    const agreement = agreedFor(selected[0].artworkId);
    if (!agreement) { setCheckoutError('Both you and the artist must accept the contract before checkout.'); return; }
    try {
      setCheckingOut(true);
      const signing = await contractRequest(`${agreement.id}/sign/`);
      if (!signing.fully_signed) { setCheckoutError('Both parties must sign and save their signatures before checkout.'); await refreshContracts(); return; }
      const user = auth.currentUser;
      if (!user) throw new Error('Please log in again.');
      const response = await fetch(`${API_URL}/api/checkout/agreements/${agreement.id}/`, {
        method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const data = await readApiResponse(response);
      if (!response.ok || (!data.simulated && !data.checkout_url)) throw new Error(data.error || 'Unable to create checkout.');
      setShowPurchases(true);
      if (data.simulated) { await refreshCart(); await refreshContracts(); }
      else await Linking.openURL(data.checkout_url);
    } catch (error: any) {
      setCheckoutError(error.message || 'Unable to open Xendit checkout.');
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {!!checkoutError && <View accessibilityRole="alert" style={{ position: 'absolute', bottom: 140, left: 16, right: 16, zIndex: 20, backgroundColor: '#FFF1F2', borderColor: '#BE123C', borderWidth: 1, borderRadius: 8, padding: 14 }}>
        <Text style={{ color: '#9F1239' }}>{checkoutError}</Text>
        <TouchableOpacity onPress={() => setCheckoutError('')}><Text style={{ color: '#9F1239', marginTop: 8, fontWeight: '700' }}>Dismiss</Text></TouchableOpacity>
      </View>}
      {showPurchases && <MyPurchases onClose={() => { setShowPurchases(false); refreshCart(); refreshContracts(); }} />}
      {signingId !== null && <SigningModal id={signingId} onClose={() => setSigningId(null)} onSigned={async () => { await refreshContracts(); const result = await contractRequest(`${signingId}/sign/`); if (result.fully_signed) setSigningId(null); }} />}
      {contractArtwork && <ContractPanel startInChat={ongoingFor(contractArtwork) || !!agreedFor(contractArtwork)} artworkId={contractArtwork} onClose={() => { setContractArtwork(null); refreshContracts(); }} />}
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
        {cartLoading && <Text>Loading your saved cart...</Text>}
        {!!cartError && <TouchableOpacity onPress={refreshCart}><Text style={{ color: '#b00020', padding: 12 }}>{cartError} Tap to retry.</Text></TouchableOpacity>}
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
                  onRemove={handleRemove}
                  onNegotiate={(id) => { if (/^[1-9]\d*$/.test(id)) setContractArtwork(id); else Alert.alert('Artwork unavailable', 'Remove this item and add it again.'); }}
                  isOngoing={ongoingFor(item.artworkId)}
                  isAgreed={!!agreedFor(item.artworkId)}
                  contractStatus={agreedFor(item.artworkId) ? `Agreed ? PHP ${agreedFor(item.artworkId)!.price}` : 'Agreement required before checkout'}
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
          onCheckout={handleCheckout}
          checkingOut={checkingOut}
          signaturesRequired={filteredItems.some(item => selectedItems.includes(item.id) && !!agreedFor(item.artworkId) && !agreedFor(item.artworkId)?.fully_signed)}
          onSign={() => {
            const item = filteredItems.find(item => selectedItems.includes(item.id));
            const agreement = item && agreedFor(item.artworkId);
            if (agreement) setSigningId(agreement.id);
          }}
          agreementRequired={filteredItems.some(item => selectedItems.includes(item.id) && !agreedFor(item.artworkId))}
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
  centerContainer: { flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center', position: 'relative' },
  listContainer: { paddingHorizontal: 16, paddingBottom: 200 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 250 },
  emptyStateNotice: { color: '#999', fontSize: 15 },
});
