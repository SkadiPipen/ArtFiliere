import { auth } from '@/firebase/config';
import ContractPanel from '@/module/chat-negotiations/ContractPanel';
import { Contract, contractRequest, isAgreed, readApiResponse } from '@/module/chat-negotiations/contracts';
import SigningModal from '@/module/chat-negotiations/SigningModal';
import MyPurchases from '@/module/profile/MyPurchases';
import AuctionDeliveryCheckout, { AuctionCheckoutContext } from './components/AuctionDeliveryCheckout';
import API_URL from '@/services/api';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, MoreHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCart } from '@/context/CartContext';
import CartCategory from '@/module/cart/components/CartCategory';
import CartFooter from '@/module/cart/components/CartFooter';
import CartItemRow from '@/module/cart/components/CartItemRow';
import { CartItem, FilterType } from '@/module/cart/types';

function resolveCartImage(raw?: string): string {
  if (!raw) return 'https://placehold.co/200x200?text=No+Image';

  const trimmed = raw.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  if (trimmed.startsWith('/media') || trimmed.startsWith('/static')) {
    return `${API_URL}${trimmed}`;
  }

  return `data:image/jpeg;base64,${trimmed}`;
}

export default function CartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ directCheckout?: string; artworkId?: string }>();
  const [artworkImages, setArtworkImages] = useState<Record<string, string>>({});
  const [dismissedContractIds, setDismissedContractIds] = useState<string[]>(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('artfiliere_dismissed_contracts');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const dismissContract = (id: string, compositeKey?: string) => {
    setDismissedContractIds((prev) => {
      const updated = Array.from(new Set([...prev, id, compositeKey || `contract-art-${id}`]));
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('artfiliere_dismissed_contracts', JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });
  };

  const [checkoutError, setCheckoutError] = useState('');
  const [deliveryCheckout, setDeliveryCheckout] = useState<{ agreementId: number; context: AuctionCheckoutContext } | null>(null);
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
    try { 
      const res = await contractRequest();
      setContracts(res.contracts || []);
    } catch { 
      setContracts([]); 
    }
  }, []);

  useFocusEffect(useCallback(() => { 
    refreshContracts(); 
    const timer = setInterval(refreshContracts, 5000); 
    return () => clearInterval(timer); 
  }, [refreshContracts]));

  const latestFor = (id: string) => contracts.filter(c => String(c.artwork_id) === id).sort((a, b) => b.id - a.id)[0];
  const ongoingFor = (id: string) => latestFor(id)?.status === 'proposed';
  const agreedFor = (id: string) => contracts.find(c => String(c.artwork_id) === id && isAgreed(c));
  const [signingId, setSigningId] = useState<number | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    const missingIds = contracts
      .map((c) => String(c.artwork_id))
      .filter((id) => id && !artworkImages[id] && !cartItems.some((ci) => String(ci.artworkId) === id && ci.image));

    if (missingIds.length === 0) return;

    missingIds.forEach(async (id) => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        let res = await fetch(`${API_URL}/api/users/artworks/${id}/`, { headers });
        if (!res.ok) {
          res = await fetch(`${API_URL}/api/artworks/${id}/`, { headers });
        }
        if (res.ok) {
          const art = await res.json();
          const img = art.image_data || art.image_url || art.image;
          if (img) {
            setArtworkImages((prev) => ({ ...prev, [id]: img }));
          }
        }
      } catch (err) {
        console.warn(`Could not load image for artwork ${id}:`, err);
      }
    });
  }, [contracts, cartItems]);

  // Combination of regular cart items with unpaid won/agreed contracts
  const allDisplayItems = useMemo(() => {
    const list: CartItem[] = cartItems.map(item => ({
      ...item,
      image: resolveCartImage(item.image),
    }));

    const existingArtworkIds = new Set(cartItems.map(i => String(i.artworkId)));

    contracts.forEach((c: any) => {
      const artIdStr = String(c.artwork_id);
      const contractKey = `contract-art-${c.id}`;

      // Check if paid, settled, completed, or locally dismissed
      const isPaid = Boolean(c.is_paid || c.status === 'paid' || c.status === 'completed' || c.payment_status === 'PAID');
      const isDismissed = dismissedContractIds.includes(contractKey) || dismissedContractIds.includes(String(c.id));

      if (
        !isPaid &&
        !isDismissed &&
        !existingArtworkIds.has(artIdStr) &&
        (isAgreed(c) || c.status === 'agreed' || c.status === 'accepted')
      ) {
        const rawImg =
          c.artwork_image ||
          c.image_url ||
          c.artwork?.image_data ||
          c.artwork?.image ||
          artworkImages[artIdStr] ||
          '';

        list.push({
          id: contractKey,
          artworkId: artIdStr,
          artistName: c.artist || 'Artist',
          title: c.title || 'Auction Artwork',
          price: c.price || '0',
          type: 'Auction',
          image: resolveCartImage(rawImg),
          quantity: 1,
        });
        existingArtworkIds.add(artIdStr);
      }
    });

    return list;
  }, [cartItems, contracts, artworkImages, dismissedContractIds]);

  const filteredItems = allDisplayItems.filter((item) => {
    if (activeFilter === 'All') return true;
    const itemType = (item.type || '').toLowerCase();
    const filter = activeFilter.toLowerCase();
    
    if (filter === 'auction') {
      return itemType.includes('auction') || item.title.toLowerCase().includes('auction');
    }
    if (filter === 'direct sell') {
      return itemType.includes('direct') || itemType === 'physical' || itemType === 'digital';
    }
    if (filter === 'commission') {
      return itemType.includes('commission');
    }
    return itemType === filter;
  });

  const total = filteredItems.reduce((sum, item) => {
    if (!selectedItems.includes(item.id)) return sum;
    const price = Number(agreedFor(item.artworkId)?.price || String(item.price).replace(/,/g, '')) || 0;
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
    if (selectedItems.length === filteredItems.length && filteredItems.length > 0) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredItems.map((item) => item.id));
    }
  };

  // Deletes both standard cart items and contract auction items
  const handleRemove = (itemId: string) => {
    const executeRemove = async () => {
      try { 
        if (itemId.startsWith('contract-art-')) {
          const contractId = itemId.replace('contract-art-', '');
          
          dismissContract(contractId, itemId);
          
          try {
            await contractRequest(`contracts/${contractId}/`, 'DELETE');
          } catch {
            try {
              await contractRequest(`contracts/${contractId}/cancel/`, 'POST');
            } catch (_) {}
          }
        } else {
          await removeFromCart(itemId); 
        }
        await refreshContracts(); 
      } catch (error: any) { 
        Alert.alert('Cart', error.message); 
        return; 
      }
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

  const handleCheckout = async (deliveryQuote?: string) => {
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
    if (!agreement) { 
      setCheckoutError('Both you and the artist must accept the contract before checkout.'); 
      return; 
    }
    try {
      setCheckingOut(true);
      const signing = await contractRequest(`${agreement.id}/sign/`);
      if (!signing.fully_signed) { 
        setCheckoutError('Both parties must sign and save their signatures before checkout.'); 
        await refreshContracts(); 
        return; 
      }
      const user = auth.currentUser;
      if (!user) throw new Error('Please log in again.');
      if (!deliveryQuote) {
        const contextResponse = await fetch(`${API_URL}/api/checkout/agreements/${agreement.id}/`, {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        });
        const context = await readApiResponse(contextResponse);
        if (!contextResponse.ok) throw new Error(context.error || 'Unable to load checkout.');
        if (context.is_auction && context.delivery_type === 'physical') {
          setDeliveryCheckout({ agreementId: agreement.id, context });
          return;
        }
      }
      const response = await fetch(`${API_URL}/api/checkout/agreements/${agreement.id}/`, {
        method: 'POST', 
        headers: { 
          Authorization: `Bearer ${await user.getIdToken()}`, 
          'Content-Type': 'application/json' 
        }, 
        body: JSON.stringify(deliveryQuote ? { delivery_quote: deliveryQuote } : {}),
      });
      const data = await readApiResponse(response);
      if (!response.ok || (!data.simulated && !data.checkout_url)) throw new Error(data.error || 'Unable to create checkout.');
      setDeliveryCheckout(null);
      
      // Mark as paid/dismissed so it immediately disappears from cart
      dismissContract(String(agreement.id), `contract-art-${agreement.id}`);
      setSelectedItems(prev => prev.filter(id => id !== selected[0].id));

      setShowPurchases(true);
      if (data.simulated) { 
        await refreshCart(); 
        await refreshContracts(); 
      } else {
        await Linking.openURL(data.checkout_url);
      }
    } catch (error: any) {
      setCheckoutError(error.message || 'Unable to open checkout.');
      if (deliveryQuote) throw error;
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {deliveryCheckout && <AuctionDeliveryCheckout agreementId={deliveryCheckout.agreementId} context={deliveryCheckout.context}
        busy={checkingOut} onClose={() => setDeliveryCheckout(null)} onPay={handleCheckout} />}
      {!!checkoutError && (
        <View accessibilityRole="alert" style={{ position: 'absolute', bottom: 140, left: 16, right: 16, zIndex: 20, backgroundColor: '#FFF1F2', borderColor: '#BE123C', borderWidth: 1, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: '#9F1239' }}>{checkoutError}</Text>
          <TouchableOpacity onPress={() => setCheckoutError('')}>
            <Text style={{ color: '#9F1239', marginTop: 8, fontWeight: '700' }}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
      {showPurchases && (
        <MyPurchases onClose={() => { setShowPurchases(false); refreshCart(); refreshContracts(); }} />
      )}
      {signingId !== null && (
        <SigningModal 
          id={signingId} 
          onClose={() => setSigningId(null)} 
          onSigned={async () => { 
            await refreshContracts(); 
            const result = await contractRequest(`${signingId}/sign/`); 
            if (result.fully_signed) setSigningId(null); 
          }} 
        />
      )}
      {contractArtwork && (
        <ContractPanel 
          startInChat={ongoingFor(contractArtwork) || !!agreedFor(contractArtwork)} 
          artworkId={contractArtwork} 
          onClose={() => { setContractArtwork(null); refreshContracts(); }} 
        />
      )}
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
        {cartLoading && <Text style={{ padding: 16 }}>Loading your saved cart...</Text>}
        {!!cartError && (
          <TouchableOpacity onPress={refreshCart}>
            <Text style={{ color: '#b00020', padding: 12 }}>{cartError} Tap to retry.</Text>
          </TouchableOpacity>
        )}
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
                  onNegotiate={(id) => { 
                    if (/^[1-9]\d*$/.test(id)) setContractArtwork(id); 
                    else Alert.alert('Artwork unavailable', 'Remove this item and add it again.'); 
                  }}
                  isOngoing={ongoingFor(item.artworkId)}
                  isAgreed={!!agreedFor(item.artworkId)}
                  contractStatus={agreedFor(item.artworkId) ? `Agreed • PHP ${agreedFor(item.artworkId)!.price}` : 'Agreement required before checkout'}
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
          onCheckout={() => handleCheckout()}
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
