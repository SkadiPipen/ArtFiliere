import { Text } from '@/components/Typography';
import { checkedDriverPosition } from '@/services/driverLocation';
import DeliveryMap from '@/module/delivery/components/DeliveryMap';
import DeliveryChatButton from '@/module/delivery/components/DeliveryChatButton';
import { ActiveDelivery } from '@/module/delivery/types/delivery';
import { fetchActiveDeliveryApi, updateRiderLocationApi, fetchRiderProfile, setRiderClockApi } from '@/services/deliveryApi';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, Platform, RefreshControl, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function HomeScreen() {
  // Time Clock State
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockLoading, setClockLoading] = useState(true);
  const [clockError, setClockError] = useState('');
  const [stats, setStats] = useState({ today: 0, active: 0 });
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const clockStartedRef = useRef<number | null>(null);

  // Live map
  const [showMap, setShowMap] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const [addressName, setAddressName] = useState<string>('Fetching address...');

  // Active delivery deets
  const [delivery, setDelivery] = useState<ActiveDelivery | null>(null);
  const [loadingDelivery, setLoadingDelivery] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [routeStats, setRouteStats] = useState<{ distance: string; eta: string } | null>(null);

  // Effect to handle the timer
  useEffect(() => {
    let interval: any;
    if (isClockedIn) {
      interval = setInterval(() => {
        setSecondsElapsed(clockStartedRef.current ? Math.max(0, Math.floor((Date.now() - clockStartedRef.current) / 1000)) : 0);
      }, 1000);
    } else {
      setSecondsElapsed(0);
    }
    return () => clearInterval(interval);
  }, [isClockedIn]);

  // Cleaned map
  useEffect(() => {
    return () => {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
      }
    }
  }, []);

  // Fetch active delivery from django
  const loadActiveDelivery = async () => {
    try {
      const data = await fetchActiveDeliveryApi();
      setDelivery(data);
    } catch (err) {
      console.error('Failed to load active delivery:', err);
    } finally {
      setLoadingDelivery(false);
      setRefreshing(false);
    }
  };

  const applyProfile = (profile: any) => {
    setStats({ today: profile.today_deliveries ?? 0, active: profile.active_tasks ?? 0 });
    setIsClockedIn(!!profile.is_clocked_in);
    clockStartedRef.current = profile.is_clocked_in && profile.clock_in_time ? Date.parse(profile.clock_in_time) : null;
    setSecondsElapsed(clockStartedRef.current ? Math.max(0, Math.floor((Date.now() - clockStartedRef.current) / 1000)) : 0);
    setStartTime(profile.clock_in_time ? new Date(profile.clock_in_time).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : null);
    setEndTime(profile.clock_out_time ? new Date(profile.clock_out_time).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : null);
  };

  useFocusEffect(
    useCallback(() => {
      loadActiveDelivery();
      setClockLoading(true);
      void fetchRiderProfile().then(applyProfile).catch((error: any) => { setIsClockedIn(false); Alert.alert('Unable to load time clock', error.message); }).finally(() => setClockLoading(false));
      const timer = setInterval(() => { loadActiveDelivery(); void fetchRiderProfile().then(applyProfile).catch(() => undefined); }, 15000);
      return () => clearInterval(timer);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadActiveDelivery();
  };

  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const handleClockIn = async () => {
    if (clockLoading) return;
    setClockLoading(true); setClockError('');
    try { applyProfile(await setRiderClockApi(true)); }
    catch (e: any) { setClockError(e.message || 'Unable to clock in. Please retry.'); }
    finally { setClockLoading(false); }
  };

  const handleClockOut = () => {
    const doClockOut = async () => {
      if (clockLoading) return;
      setClockLoading(true); setClockError('');
      try { applyProfile(await setRiderClockApi(false)); }
      catch (e: any) { setClockError(e.message || 'Unable to clock out. Please retry.'); void loadActiveDelivery(); void fetchRiderProfile().then(applyProfile).catch(() => undefined); }
      finally { setClockLoading(false); }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to clock out for today?');
      if (confirmed) {
        doClockOut();
      }
    } else {
      Alert.alert('Clock Out', 'Are you sure you want to clock out for today?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clock Out',
          style: 'destructive',
          onPress: doClockOut,
        },
      ]);
    }
  };

  // Helper to determine destination coordinates based on delivery phase
  const getDestination = () => {
    if (!delivery) return null;
    const isPickup = ['ACCEPTED', 'ARRIVED_AT_ARTIST'].includes(delivery.step);

    const side = isPickup ? 'pickup' : 'delivery';
    const destination = isPickup ? delivery.artist : delivery.buyer;
    if (destination?.latitude != null && destination?.longitude != null) {
      return {
        coords: { latitude: Number(destination.latitude), longitude: Number(destination.longitude) },
        title: `${isPickup ? 'Pickup' : 'Drop-off'}: ${destination.name || 'Destination'}${['street', 'landmark'].includes(delivery.location_precision?.[side] || '') ? ' (Approximate location)' : ''}`,
      };
    }

    return null;
  }

  // Continuously track while the tracker is open; stop subscriptions on close.
  useEffect(() => {
    if (!showMap) return;
    let active = true;
    let webWatch: number | undefined;
    let nativeWatch: Location.LocationSubscription | undefined;
    const update = (coords: { latitude: number; longitude: number; accuracy: number | null }) => {
      if (!active) return;
      try {
        const point = checkedDriverPosition(coords, true);
        setDriverLocation(point); setAddressName(point.accuracy <= 200 ? 'Your live GPS location' : `Approximate device location (Ã‚Â±${Math.round(point.accuracy)} m). Enable precise location for routing.`);
        if (point.accuracy > 200) setRouteStats(null);
        if (isClockedIn && point.accuracy <= 200) void updateRiderLocationApi(1, point.latitude, point.longitude).catch(error => { if (active) setAddressName(error.message); });
      } catch (error: any) { setDriverLocation(null); setRouteStats(null); setAddressName(error.message); }
    };
    if (Platform.OS === 'web' && navigator.geolocation) {
      webWatch = navigator.geolocation.watchPosition(position => update(position.coords), error => {
        if (active) { setDriverLocation(null); setRouteStats(null); setAddressName(error.code === 1 ? 'Allow browser location access, then reopen the tracker.' : 'Waiting for accurate GPS. Enable device location.'); }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    } else if (Platform.OS !== 'web') {
      void (async () => {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (permission.status !== 'granted') { setAddressName('Allow precise location access.'); return; }
        nativeWatch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 5000, distanceInterval: 10 }, loc => update(loc.coords));
        if (!active) nativeWatch.remove();
      })().catch(error => { if (active) setAddressName(error.message); });
    } else setAddressName('GPS is unavailable in this browser.');
    return () => { active = false; if (webWatch !== undefined) navigator.geolocation.clearWatch(webWatch); nativeWatch?.remove(); };
  }, [showMap, isClockedIn]);

  // GPS tracker handler
  const handleLocationPress = () => {
    setDriverLocation(null); setRouteStats(null);
    setAddressName('Acquiring precise rider GPS...');
    setShowMap(true);
  };

  const closeMapModal = () => {
    setShowMap(false);
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
  };

  const target = getDestination();
  const hasActiveDelivery = !!delivery && delivery.step !== 'DELIVERED' || stats.active > 0;
  
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#BC5454" />

      {/* Heading */}
      <View style={styles.headerBanner}>
        <Text style={styles.headerTitle}>Welcome, Rider!</Text>
        <Text style={styles.headerSubtitle}>Rider Portal</Text>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContainer} 
        showsVerticalScrollIndicator={false}
        refreshControl = {
          <RefreshControl 
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#BC5454']}
            tintColor="#BC5454"
            />
          }
        >
        
        {/* Time Clock */}
        <View style={styles.clockCard}>
          <View style={styles.clockHeaderRow}>
            <View style={styles.row}>
              <Ionicons name="time-outline" size={20} color="#BC5454" style={{ marginRight: 6 }}/>
              <Text style={styles.clockCardTitle}>Time Clock</Text>
            </View>
            <View style={[styles.statusBadge, isClockedIn ? styles.badgeIn : styles.badgeOut]}>
              <Text style={[styles.badgeText, isClockedIn ? styles.textIn : styles.textOut]}>
                {clockLoading ? 'Loading shift...' : isClockedIn ? 'Clocked In' : 'Clocked Out'}
              </Text>
            </View>
          </View>

          <View style={styles.timeInRow}>
            <Text style={styles.startedText}>
              Started at: <Text style={{ fontWeight: '600' }}>{startTime || ' '}</Text>
            </Text>
            <Text style={[styles.startedText, { marginLeft: 12 }]}>
              Ended at: <Text style={{ fontWeight: '600' }}>{endTime || ' '}</Text>
            </Text>
          </View>

          <Text style={styles.timerDigits}>
            {formatTimer(secondsElapsed)}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <TouchableOpacity 
              style={[styles.clockButton, { flex: 1, backgroundColor: isClockedIn ? '#D5D8DC' : '#27AE60' }]}
              onPress={handleClockIn}
              disabled={clockLoading || isClockedIn}
              activeOpacity={0.8}
            >
              <Text style={styles.clockButtonText}>Clock In</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.clockButton, { flex: 1, backgroundColor: !isClockedIn || hasActiveDelivery ? '#D5D8DC' : '#C0392B' }]}
              onPress={handleClockOut}
              disabled={clockLoading || loadingDelivery || !isClockedIn || hasActiveDelivery}
              activeOpacity={0.8}
            >
              <Text style={styles.clockButtonText}>Clock Out</Text>
            </TouchableOpacity>
          </View>
          {isClockedIn && hasActiveDelivery && <Text style={{ marginTop: 12, color: '#844038', lineHeight: 20 }}>Complete your active delivery before clocking out. Open Delivery Details below to continue.</Text>}
          {!!clockError && <Text accessibilityRole="alert" style={{ marginTop: 12, color: '#B42318' }}>{clockError}</Text>}
        </View>

        {/* Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Today's Deliveries</Text>
            <Text style={styles.metricNumber}>{stats.today}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Active Tasks</Text>
            <Text style={styles.metricNumber}>{stats.active}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.locationCard} onPress={handleLocationPress} activeOpacity={0.9}>
          <View style={styles.row}>
            <Ionicons name="location" size={24} color="#BC5454" style={{ marginRight: 12 }}/>
            <View>
              <Text style={styles.locationTitle}>Current Location Tracker</Text>
              <Text style={styles.locationSubtitle}>
                {delivery? 'Tap to view live route to target destination' : 'Tap to view current GPS location'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Active deliveries summary */}
        <Text style={styles.sectionHeading}>Active Deliveries</Text>

        {loadingDelivery ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="small" color="#BC5454"/>
            <Text style={styles.loaderBoxText}>Checking active deliveries...</Text>
          </View>
        ) : delivery ? (
          <TouchableOpacity
            style={styles.activeBannerCard}
            onPress={() => router.push({ pathname: '/delivery-details', params: { id: String(delivery.id) }, } as any )}
          >
            <View style={[styles.activeBannerHeader, { flexWrap: 'wrap', gap: 8 }]}>
              <View style={[styles.row, { flexShrink: 1, minWidth: 0 }]}>
                <Ionicons name="bicycle" size={22} color="#BC5454" style={{ marginRight: 8 }}/>
                <Text style={[styles.activeBannerTitle, { flexShrink: 1 }]}>Order #{String(delivery.id).replace('verified-', '')} in progress</Text>
              </View>
              <View style={[styles.activeStatusBadge, { maxWidth: '100%', flexShrink: 1 }]}>
                <Text style={[styles.activeStatusBadgeText, { flexShrink: 1 }]}>{delivery.step.toLowerCase().replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase())}</Text>
              </View>
            </View>

            {['ACCEPTED', 'ARRIVED_AT_ARTIST'].includes(delivery.step) ? (
              <View>
                <View style={styles.detailRow}>
                  <Ionicons name="storefront-outline" size={16} color="#BC5454" style={{ marginRight: 6 }}/>
                  <Text style={[styles.detailText, { fontWeight: '700', color: '#BC5454'}]}>
                    Pickup: {delivery.artist?.name || 'Artist'}
                  </Text>
                </View>
                <View style={[styles.detailRow, { marginTop: -6, paddingLeft: 22 }]}>
                  <Text style={[styles.detailText, { color: '#7F8C8D', fontSize: 12}]} numberOfLines={1}>
                    {delivery.artist?.address || 'Artist'}
                  </Text>
                </View>
              </View>
            ) : (
              <View>
                <View style={styles.detailRow}>
                  <Ionicons name="person-outline" size={16} color="#27AE60" style={{ marginRight: 6 }}/>
                  <Text style={[styles.detailText, { fontWeight: '700', color: '#27AE60'}]}>
                    Deliver to: {delivery.buyer?.name || 'Buyer'}
                  </Text>
                </View>
                <View style={[styles.detailRow, { marginTop: -6, paddingLeft: 22 }]}>
                  <Text style={[styles.detailText, { color: '#7F8C8D', fontSize: 12}]} numberOfLines={1}>
                    {delivery.buyer?.address || 'Buyer'}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.resumeButton}>
              <Text style={styles.resumeButtonText}>Open Delivery Details</Text>
              <Ionicons name="arrow-forward" size={16} color="#BC5454"/>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyDeliveryCard}>
            <Ionicons name="bicycle-outline" size={48} color="#BDC3C7" />
            <Text style={styles.emptyDeliveryTitle}>No Active Delivery</Text>
            <Text style={styles.emptyDeliverySubtitle}>
              Accept an order from the Orders tab to begin a delivery.
            </Text>
          </View>
        )}
      </ScrollView>
      <DeliveryChatButton delivery={delivery} />

      {/* Map Modal */}
      <Modal visible={showMap} animationType="slide" transparent={true} onRequestClose={closeMapModal}>
        <View style={styles.mapContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF"/>

          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeMapModal} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={24} color="#333333"/>
            </TouchableOpacity>
            <View>
              <Text style={styles.modalTitle}>Live Delivery Tracker</Text>
              <Text style={styles.modalAddressText} numberOfLines={1}>{addressName}</Text>
            </View>
            <View style={{ width: 40 }}/>
          </View>

          {/* Route Info (Badge & ETA) */}
          {routeStats && (
            <View style={styles.etaBar}>
              <Ionicons name="navigate-circle" size={20} color="#2980B9" style={{ marginRight: 6 }}/>
              <Text style={styles.etaBarText}>
                ETA: <Text style={{ fontWeight: '700' }}>{routeStats.eta} mins</Text> ({routeStats.distance} km)
              </Text>
            </View>
          )}

          {/* Reusable Map with lines and pins */}
          {!!delivery?.location_notices?.[['ACCEPTED', 'ARRIVED_AT_ARTIST'].includes(delivery.step) ? 'pickup' : 'delivery'] && <Text style={{ color: '#795500', padding: 12 }}>{delivery.location_notices[['ACCEPTED', 'ARRIVED_AT_ARTIST'].includes(delivery.step) ? 'pickup' : 'delivery']}</Text>}
          <DeliveryMap
            driverLocation={driverLocation}
            destinationLocation={driverLocation?.accuracy && driverLocation.accuracy > 200 ? null : target?.coords || null}
            driverAccuracy={driverLocation?.accuracy}
            destinationTitle={target?.title || 'Destination'}
            onRouteCalculated={(dist, mins) => setRouteStats({ distance: dist, eta: mins})}
            onRouteUnavailable={() => setRouteStats(null)}
            style={styles.fullScreenMap}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9FB' },
  row: { flexDirection: 'row', alignItems: 'center' },
  headerBanner: { backgroundColor: '#BC5454', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 24 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 13, color: '#F5EFEB', marginTop: 2 },
  scrollContainer: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 },
  
  clockCard: { backgroundColor: '#FFFDF6', borderWidth: 1, borderColor: '#FADBD8', borderRadius: 12, padding: 16, marginBottom: 16 },
  clockHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  clockCardTitle: { fontSize: 16, fontWeight: 'bold', color: '#BC5454' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeIn: { backgroundColor: '#E8F8F5' },
  badgeOut: { backgroundColor: '#EAECEE' },
  badgeText: { fontSize: 12, fontWeight: 'bold' },
  textIn: { color: '#2ECC71' },
  textOut: { color: '#7F8C8D' },
  startedText: { fontSize: 13, color: '#5D6D7E', marginBottom: 6 },
  timeInRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 },
  timerDigits: { fontSize: 36, fontWeight: 'bold', color: '#BC5454', textAlign: 'center', marginVertical: 12, letterSpacing: 1 },
  clockButton: { height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  buttonIn: { backgroundColor: '#BC5454' },
  buttonOut: { backgroundColor: '#7F8C8D' },
  clockButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  metricCard: { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 16, width: '48%', borderWidth: 1, borderColor: '#EAEDED' },
  metricLabel: { fontSize: 13, color: '#7F8C8D', marginBottom: 6 },
  metricNumber: { fontSize: 28, fontWeight: 'bold', color: '#BC5454' },
  
  locationCard: { backgroundClip: '#FFFFFF', borderRadius:10, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#EAEDED'},
  locationTitle: { fontSize: 15, fontWeight: 'bold', color: '#BC5454'},
  locationSubtitle: { fontSize: 13, color: '#7F8C8D', marginTop: 2 },
  
  sectionHeading: { fontSize: 16, fontWeight: 'bold', color: '#BC5454', marginBottom: 12 },
  activeBannerCard: {
    backgroundColor: '#FFFDF6',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#FADBD8",
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#BD5454',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  activeBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  activeBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#BC5454'
  },
  activeStatusBadge: {
    backgroundColor: '#FADBD8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  activeStatusBadgeText: {
    color: '#BC5454',
    fontSize: 11,
    fontWeight: 'bold'
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#FADBD8',
    paddingTop: 10
  },
  resumeButtonText: {
    color: '#BC5454',
    fontWeight: 'bold',
    fontSize: 13,
    marginRight: 4
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  detailText: { fontSize: 13, color: '#34495E' },
  
  emptyDeliveryCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#EAEDED', marginBottom: 16 },
  emptyDeliveryTitle: { fontSize: 16, fontWeight: 'bold', color: '#7F8C8D', marginTop: 10 },
  emptyDeliverySubtitle: { fontSize: 13, color: '#BDC3C7', textAlign: 'center', marginTop: 4, paddingHorizontal: 10 },
  loaderBox: { padding: 24, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14 },
  loaderBoxText: { marginTop: 8, color: '#7F8C8D', fontSize: 13 },

  mapContainer: {flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE'
  },
  closeBtn: { padding: 4},
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333333' },
  modalAddressText: { fontSize: 17, fontWeight: '700', color: '#2C3E50' },
  etaBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EBF5FB', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#D4E6F1'},
  etaBarText: { fontSize: 13, color: '#2980B9'},
  fullScreenMap: { flex: 1, width: '100%', height: '100%', borderRadius: 0}
});
