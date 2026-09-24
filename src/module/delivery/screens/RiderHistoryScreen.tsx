import { fetchDeliveryHistory } from '@/services/deliveryApi';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface HistoryOrder {
  id: number | string;
  buyerId?: string | number;
  customerName?: string;
  address: string;
  status: string;
  paymentMethod?: string;
  items_count?: number;
  distance?: string;
  estimatedTime?: string;
  earnings?: number | string;
  deliveredAt?: string;
  rawDate?: Date;
  artistName?: string;
  pickupAddress?: string;
  artworkTitle?: string;
  timeline?: {
    assigned?: string;
    arrivedArtist?: string;
    pickedUp?: string;
    startedDelivery?: string;
    arrivedBuyer?: string;
    delivered?: string;
  };
}

export default function RiderHistoryScreen() {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'Daily' | 'Weekly' | 'Monthly' | 'All Time'>('All Time');
  const [selectedOrder, setSelectedOrder] = useState<HistoryOrder | null>(null);

  const loadHistory = async (isManualRefresh = false) => {
    if (!isManualRefresh) setLoading(true);
    try {
      const liveOrders = await fetchDeliveryHistory();
      console.log('>>> [FRONTEND] Fetched history payload:', liveOrders);

      const rawList = Array.isArray(liveOrders)
        ? liveOrders
        : liveOrders?.results && Array.isArray(liveOrders.results)
        ? liveOrders.results
        : [];

      const formatted: HistoryOrder[] = rawList
        .filter((item: any) => item != null && typeof item === 'object')
        .map((item: any) => {
          const orderDate = item?.created_at ? new Date(item.created_at) : new Date();
          const validDate = isNaN(orderDate.getTime()) ? new Date() : orderDate;
          const timeStr = validDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          const safeId = item?.id ?? Math.floor(Math.random() * 10000);
          const safeBuyerId = item?.buyerId ?? item?.buyer_id ?? 'Unknown';

          return {
            id: safeId,
            buyerId: safeBuyerId,
            customerName: item?.customer_name || `Buyer #${safeBuyerId}`,
            address: item?.address || item?.delivery_address || 'Delivery Address',
            status: item?.status || 'COMPLETED',
            paymentMethod: item?.paymentMethod || 'Online / GCash',
            items_count: Number(item?.items_count) || 1,
            distance: item?.distance || '1.0 km',
            estimatedTime: item?.estimatedTime || '15 mins',
            earnings: Number(item?.rider_earnings ?? item?.earnings ?? 85.00),
            deliveredAt: timeStr,
            rawDate: validDate,
            artistName: item?.artist_name || 'ArtFiliere Partner Studio',
            pickupAddress: item?.pickup_address || 'Artist Pickup Location',
            artworkTitle: item?.artwork_title || `Artwork Order #${safeId}`,
            timeline: {
              assigned: 'Completed',
              arrivedArtist: 'Completed',
              pickedUp: 'Completed',
              startedDelivery: 'Completed',
              arrivedBuyer: 'Completed',
              delivered: timeStr,
            },
          };
        });

      console.log(`>>> [FRONTEND] Successfully formatted ${formatted.length} orders`);
      setOrders(formatted);
    } catch (err) {
      console.warn('Error loading history:', err);
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory(true);
  }, []);

  const filteredOrders = useMemo(() => {
    const now = new Date();

    return orders.filter((o) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        String(o.id).includes(q) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.address && o.address.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (activeFilter === 'All Time') return true;

      if (!o.rawDate || isNaN(o.rawDate.getTime())) return true;

      const orderDate = o.rawDate;
      if (activeFilter === 'Daily') {
        return orderDate.toDateString() === now.toDateString();
      } else if (activeFilter === 'Weekly') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return orderDate >= oneWeekAgo;
      } else if (activeFilter === 'Monthly') {
        return (
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        );
      }

      return true;
    });
  }, [orders, searchQuery, activeFilter]);

  const totalEarnings = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (Number(o.earnings) || 0), 0).toFixed(2);
  }, [filteredOrders]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#BC5454" />

      {/* Red Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Delivery History</Text>
        <Text style={styles.headerSubtitle}>{filteredOrders.length} completed deliveries</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filtersContainer}>
        {(['Daily', 'Weekly', 'Monthly', 'All Time'] as const).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterPill, activeFilter === filter && styles.filterPillActive]}
            onPress={() => setActiveFilter(filter)}
          >
            <Text style={[styles.filterPillText, activeFilter === filter && styles.filterPillTextActive]}>
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#95A5A6" style={styles.searchIcon} />
        <TextInput
          placeholder="Search by name, address, or order ID..."
          placeholderTextColor="#95A5A6"
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Earnings Summary */}
      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>Total Earnings</Text>
          <Text style={styles.summaryValue}>₱{totalEarnings}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.summaryLabel}>Deliveries</Text>
          <Text style={styles.summaryCount}>{filteredOrders.length}</Text>
        </View>
      </View>

      {/* History List */}
      {loading ? (
        <ActivityIndicator size="large" color="#BC5454" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#BC5454']} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="time-outline" size={56} color="#BDC3C7" />
              <Text style={styles.emptyText}>No completed deliveries found.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelectedOrder(item)} activeOpacity={0.8}>
              <View style={styles.cardTopRow}>
                <View style={styles.customerRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#27AE60" />
                  <Text style={styles.customerName}>{item.customerName}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.earningsAmount}>₱{Number(item.earnings || 0).toFixed(2)}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#BDC3C7" />
                </View>
              </View>

              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={14} color="#7F8C8D" />
                <Text style={styles.addressText} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>

              <View style={styles.cardBottomRow}>
                <View style={styles.itemsBadge}>
                  <Ionicons name="cube-outline" size={13} color="#7F8C8D" />
                  <Text style={styles.bottomMetaText}>{item.items_count} item(s)</Text>
                  <Ionicons name="time-outline" size={13} color="#7F8C8D" style={{ marginLeft: 8 }} />
                  <Text style={styles.bottomMetaText}>{item.deliveredAt}</Text>
                </View>
                <Text style={styles.dateLabel}>Completed</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Details & Timeline Modal */}
      <Modal visible={!!selectedOrder} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalHeaderTitle}>Order #{selectedOrder?.id}</Text>
                <Text style={styles.modalHeaderSubtitle}>Complete Delivery Record</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedOrder(null)} style={styles.closeIconBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              {/* Customer & Earnings Section */}
              <View style={styles.detailSection}>
                <View style={styles.detailRowBetween}>
                  <View>
                    <Text style={styles.detailFieldLabel}>Customer</Text>
                    <Text style={styles.detailFieldValueBold}>{selectedOrder?.customerName}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.detailFieldLabel}>Earnings</Text>
                    <Text style={styles.detailEarnings}>₱{Number(selectedOrder?.earnings || 0).toFixed(2)}</Text>
                  </View>
                </View>
                <View style={[styles.addressRow, { marginTop: 8 }]}>
                  <Ionicons name="location-outline" size={15} color="#7F8C8D" />
                  <Text style={styles.detailAddressText}>{selectedOrder?.address}</Text>
                </View>
              </View>

              {/* Payment Method */}
              <View style={styles.detailSection}>
                <Text style={styles.detailFieldLabel}>Payment Method</Text>
                <View style={styles.paymentMethodBadge}>
                  <Text style={styles.paymentMethodText}>{selectedOrder?.paymentMethod}</Text>
                </View>
              </View>

              {/* Order Items */}
              <View style={styles.detailSection}>
                <Text style={styles.detailFieldLabel}>Order Items</Text>
                <View style={styles.detailRowBetween}>
                  <Text style={styles.orderItemName}>{selectedOrder?.artworkTitle}</Text>
                  <Text style={styles.orderItemQty}>x{selectedOrder?.items_count}</Text>
                </View>
              </View>

              {/* Pickup Location */}
              <View style={styles.detailSection}>
                <Text style={styles.detailFieldLabel}>Artist (Pickup Location)</Text>
                <Text style={styles.detailFieldValueBold}>{selectedOrder?.artistName}</Text>
                <Text style={styles.detailAddressText}>{selectedOrder?.pickupAddress}</Text>
              </View>

              {/* Complete Delivery Timeline */}
              <Text style={styles.timelineSectionTitle}>Complete Delivery Timeline</Text>
              <View style={styles.timelineContainer}>
                <View style={styles.timelineStep}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineLine} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineTitle}>Order Assigned</Text>
                    <Text style={styles.timelineTime}>{selectedOrder?.timeline?.assigned}</Text>
                    <Text style={styles.timelineDesc}>Delivery assigned to you</Text>
                  </View>
                </View>

                <View style={styles.timelineStep}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineLine} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineTitle}>Arrived at Artist</Text>
                    <Text style={styles.timelineTime}>{selectedOrder?.timeline?.arrivedArtist}</Text>
                  </View>
                </View>

                <View style={styles.timelineStep}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineLine} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineTitle}>Picked up from Artist</Text>
                    <Text style={styles.timelineTime}>{selectedOrder?.timeline?.pickedUp}</Text>
                    <TouchableOpacity style={styles.photoButton}>
                      <Ionicons name="camera" size={14} color="#FFF" />
                      <Text style={styles.photoButtonText}>View Photo Evidence (1)</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.timelineStep}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineLine} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineTitle}>Started Delivery</Text>
                    <Text style={styles.timelineTime}>{selectedOrder?.timeline?.startedDelivery}</Text>
                  </View>
                </View>

                <View style={styles.timelineStep}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineLine} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineTitle}>Arrived at Buyer</Text>
                    <Text style={styles.timelineTime}>{selectedOrder?.timeline?.arrivedBuyer}</Text>
                  </View>
                </View>

                <View style={styles.timelineStep}>
                  <View style={[styles.timelineDot, { backgroundColor: '#27AE60' }]} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineTitle}>Delivered Successfully</Text>
                    <Text style={styles.timelineTime}>{selectedOrder?.timeline?.delivered}</Text>
                    <Text style={styles.timelineDesc}>Package received and confirmed.</Text>
                    <TouchableOpacity style={[styles.photoButton, { marginTop: 6 }]}>
                      <Ionicons name="camera" size={14} color="#FFF" />
                      <Text style={styles.photoButtonText}>View Photo Evidence (1)</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Service Protection Banner */}
              <View style={styles.protectionNotice}>
                <Ionicons name="information-circle-outline" size={20} color="#2980B9" />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text style={styles.protectionTitle}>Service Protection</Text>
                  <Text style={styles.protectionSubtitle}>
                    This complete record is maintained for your protection and can be used to verify your delivery service.
                  </Text>
                </View>
              </View>

              {/* Close Button */}
              <TouchableOpacity style={styles.closeBottomBtn} onPress={() => setSelectedOrder(null)}>
                <Text style={styles.closeBottomBtnText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    backgroundColor: '#BC5454',
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    width: '100%',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 13, color: 'rgba(255, 255, 255, 0.85)', marginTop: 4 },

  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F2F3F4',
  },
  filterPillActive: { backgroundColor: '#BC5454' },
  filterPillText: { fontSize: 13, fontWeight: '600', color: '#555' },
  filterPillTextActive: { color: '#FFFFFF' },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9F9',
    marginHorizontal: 16,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E5E7E9',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#2C3E50' },

  summaryCard: {
    backgroundColor: '#FDF7E7',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F6E5B8',
  },
  summaryLabel: { fontSize: 12, color: '#7F8C8D', fontWeight: '500' },
  summaryValue: { fontSize: 26, fontWeight: 'bold', color: '#BC5454', marginTop: 4 },
  summaryCount: { fontSize: 24, fontWeight: 'bold', color: '#2C3E50', marginTop: 4 },

  listContent: { paddingHorizontal: 16, paddingBottom: 30, paddingTop: 6 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ECEFF1',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customerRow: { flexDirection: 'row', alignItems: 'center' },
  customerName: { fontSize: 15, fontWeight: 'bold', color: '#2C3E50', marginLeft: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  earningsAmount: { fontSize: 15, fontWeight: 'bold', color: '#27AE60', marginRight: 4 },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  addressText: { fontSize: 13, color: '#7F8C8D', marginLeft: 4, flex: 1 },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F4F4',
  },
  itemsBadge: { flexDirection: 'row', alignItems: 'center' },
  bottomMetaText: { fontSize: 12, color: '#7F8C8D', marginLeft: 4 },
  dateLabel: { fontSize: 12, color: '#95A5A6', fontWeight: '500' },

  emptyBox: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#95A5A6', marginTop: 10, fontSize: 14 },

  /* Modal Styles */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '75%',
    overflow: 'hidden',
  },
  modalHeader: {
    backgroundColor: '#BC5454',
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalHeaderTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  modalHeaderSubtitle: { fontSize: 12, color: 'rgba(255, 255, 255, 0.85)', marginTop: 2 },
  closeIconBtn: { padding: 4 },
  modalScroll: { padding: 20, paddingBottom: 40 },

  detailSection: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F2',
  },
  detailRowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailFieldLabel: { fontSize: 12, color: '#95A5A6', fontWeight: '500', marginBottom: 4 },
  detailFieldValueBold: { fontSize: 15, fontWeight: 'bold', color: '#2C3E50' },
  detailEarnings: { fontSize: 17, fontWeight: 'bold', color: '#27AE60' },
  detailAddressText: { fontSize: 13, color: '#5D6D7E', marginTop: 2 },

  paymentMethodBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#D4EFDF',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  paymentMethodText: { fontSize: 12, fontWeight: 'bold', color: '#1E8449' },
  orderItemName: { fontSize: 14, color: '#2C3E50', fontWeight: '500' },
  orderItemQty: { fontSize: 14, color: '#7F8C8D' },

  timelineSectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#BC5454', marginTop: 20, marginBottom: 14 },
  timelineContainer: { paddingLeft: 6, marginVertical: 4 },
  timelineStep: { flexDirection: 'row', minHeight: 48, position: 'relative' },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#BC5454',
    marginTop: 4,
    zIndex: 2,
  },
  timelineLine: {
    position: 'absolute',
    left: 4,
    top: 14,
    bottom: -4,
    width: 2,
    backgroundColor: '#E0E0E0',
    zIndex: 1,
  },
  timelineContent: { marginLeft: 16, flex: 1, paddingBottom: 14 },
  timelineTitle: { fontSize: 13, fontWeight: 'bold', color: '#2C3E50' },
  timelineTime: { fontSize: 11, color: '#7F8C8D', marginTop: 2 },
  timelineDesc: { fontSize: 11, color: '#95A5A6', marginTop: 2 },

  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#BC5454',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  photoButtonText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', marginLeft: 6 },

  protectionNotice: {
    flexDirection: 'row',
    backgroundColor: '#EBF5FB',
    borderRadius: 10,
    padding: 12,
    marginTop: 20,
    alignItems: 'center',
  },
  protectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#2980B9' },
  protectionSubtitle: { fontSize: 11, color: '#5499C7', marginTop: 2 },

  closeBottomBtn: {
    backgroundColor: '#BC5454',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  closeBottomBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
});