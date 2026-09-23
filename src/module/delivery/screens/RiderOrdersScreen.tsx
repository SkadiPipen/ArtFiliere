import { acceptOrderApi, fetchPendingOrders } from '@/services/deliveryApi';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface OrderRequest {
  id: string;
  buyerId: string; // buyer Id or artist Id
  address: string;
  itemsCount: number; // number/quantity of items bought by buyer
  distance: string;
  estimatedTime: string;
  paymentMethod: string;
}

export default function OrdersScreen() {
  const [orderRequests, setOrderRequests] = useState<OrderRequest[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal
  const [selectedOrder, setSelectedOrder] = useState<OrderRequest | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  // Load orders from Django REST API
  const loadOrders = useCallback (async () => {
    try { setOrderRequests(await fetchPendingOrders()); setError(''); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const openAcceptModal = (order: OrderRequest) => {
    setSelectedOrder(order);
    setIsModalVisible(true);
  };

  const confirmAcceptOrder = async () => {
    if (!selectedOrder) return;
    
    try {
      setIsAccepting(true);

      // Call Django POST endpoint
      const result = await acceptOrderApi(selectedOrder.id);

      if (result) {
        // Remove accepted order from local state
        setOrderRequests((prev) => prev.filter((item) => item.id !== selectedOrder.id));
        setIsModalVisible(false);
        const acceptedId = selectedOrder.id;
        setSelectedOrder(null);

        // Navigate driver to active delivery screen
        router.push({
          pathname: '/delivery-details', 
          params: { id: String(acceptedId)},
        } as any );
      } else {
        Alert.alert('Error', 'Unable to accept order.')
      }
    } catch (error: any) {
      setError(error.message); setIsModalVisible(false);
      console.error('Error accepting order:', error);
      Alert.alert('Action Failed', 'Unable to accept this order. Please try again.');
    } finally {
      setIsAccepting(false);
    }
  };

  const renderPaymentBadge = (method: OrderRequest['paymentMethod']) => {
    let bgColor = '#E8F8F5';
    let textColor = '#2ECC71';

    if (method === 'Paypal') {
      bgColor = '#EAF2F8';
      textColor = '#3498DB';
    } else if (method === 'COD') {
      bgColor = '#FDEDEC';
      textColor = '#E74C3C';
    }

    return (
      <View style={[styles.paymentBadge, { backgroundColor: bgColor }]}>
        <Text style={[styles.paymentBadgeText, { color: textColor }]}>{method}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor='#BC5454'/>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Order Requests</Text>
        <Text style={styles.headerSubtitle}>{orderRequests.length} pending orders</Text>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContainer} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#BC5454']} tintColor="#BC5454"/>
        }
      >
        {!!error && <Text style={{ color: "#b00020", marginBottom: 12 }}>{error}</Text>}
        {loading ? (
          <View style={styles.loaderCenter}>
            <ActivityIndicator size="large" color="#BC5454"/>
            <Text style={styles.loadingText}>Fetching order requests...</Text>
          </View>
        ) : orderRequests.length > 0 ? (
          orderRequests.map((order) => {
            const items = order.itemsCount;
            const dist = order.distance;
            const eta = order.estimatedTime;
            const payment = order.paymentMethod;
          
            return (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.customerName}>{order.buyerId}</Text>
                  {renderPaymentBadge(payment)}
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="location-outline" size={18} color="#7F8C8D" style={styles.iconMargin}/>
                  <Text style={styles.addressText}>{order.address}</Text>
                </View>

                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Ionicons name="cube-outline" size={16} color="#7F8C8D" style={styles.iconMargin}/>
                    <Text style={styles.metricText}>{items} items</Text>
                  </View>

                  <View style={styles.metricItem}>
                    <Ionicons name="navigate-outline" size={16} color="#7F8C8D" style={styles.iconMargin}/>
                    <Text style={styles.metricText}>{dist}</Text>
                  </View>

                  <View style={styles.metricItem}>
                    <Ionicons name="time-outline" size={16} color="#7F8C8D" style={styles.iconMargin}/>
                    <Text style={styles.metricText}>{eta}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => openAcceptModal(order)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.acceptButtonText}>Accept Order</Text>
                </TouchableOpacity>
            </View>
          );
        })
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle-outline" size={60} color="#2ECC71"/>
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptySubtitle}>No pending order requests available right neow.</Text>
        </View>
      )}
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="bicycle-outline" size={32} color="#BC5454"/>
            </View>

            <Text style={styles.modalTitle}>Accept Order Request?</Text>
            <Text style={styles.modalSubTitle}>
              You are about to accept the order request for this customer.
            </Text>

            {/* MAG ADD ARI SA MATIC NA DELIVERY TRACK ORDER NUMBER */}
            {selectedOrder && (
              <View style={styles.modalSummaryBox}>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Customer:</Text>
                  <Text style={styles.modalValue}>{selectedOrder.buyerId}</Text>
                </View>

                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Address:</Text>
                  <Text style={styles.modalValue}>{selectedOrder.address}</Text>
                </View>

                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Payment:</Text>
                  <Text style={styles.modalValue}>{selectedOrder.paymentMethod}</Text>
                </View>

                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Distance:</Text>
                  <Text style={styles.modalValue}>{selectedOrder.distance}</Text>
                </View>

                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Estimated Time:</Text>
                  <Text style={styles.modalValue}>{selectedOrder.estimatedTime}</Text>
                </View>
              </View>
            )}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.cancelModalButton}
                onPress={() => setIsModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>

              {/* MAG ADD ARI SA CONNECTION TO OPEN DELIVERY VIEW */}
              <TouchableOpacity
                style={styles.confirmModalButton}
                onPress={confirmAcceptOrder}
                activeOpacity={0.8}
                disabled={isAccepting}
              >
                {isAccepting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmModalText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9FB' },
  header: { backgroundColor: '#BC5454', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 24 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 13, color: '#F5EFEB', marginTop: 2 },
  scrollContainer: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 },
  
  orderCard: {
    backgroundColor: '#FFFDF6',
    borderWidth: 1,
    borderColor: '#FADBD8',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerName: { fontSize: 18, fontWeight: 'bold', color: '#BC5454' },
  paymentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  paymentBadgeText: { fontSize: 12, fontWeight: 'bold' },
  
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconMargin: { marginRight: 6 },
  addressText: { fontSize: 14, color: '#566573' },
  
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  metricText: { fontSize: 13, color: '#5D6D7E' },
  
  acceptButton: {
    backgroundColor: '#BC5454',
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#333333', marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: '#7F8C8D', marginTop: 4, textAlign: 'center' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FADBD8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333333', marginBottom: 4 },
  modalSubTitle: { fontSize: 13, color: '#7F8C8D', textAlign: 'center', marginBottom: 16 },
  modalSummaryBox: {
    width: '100%',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  modalLabel: { fontSize: 13, color: '#7F8C8D', fontWeight: '500' },
  modalValue: { fontSize: 13, color: '#2C3E50', fontWeight: 'bold', flexShrink: 1, textAlign: 'right', marginLeft: 8 },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  cancelModalButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BDC3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  cancelModalText: { color: '#7F8C8D', fontWeight: 'bold', fontSize: 14 },
  confirmModalButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#BC5454',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  confirmModalText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },

  loaderCenter: {
    flex:1,
    justifyContent: 'center', alignItems: 'center', paddingTop: 60,
  },
  loadingText: {
    marginTop: 12, fontSize: 14, color: '#7F8C8D'
  },
});