import DeliveryMap from '@/module/delivery/components/DeliveryMap';
import { ActiveDelivery } from '@/module/delivery/types/delivery';
import { fetchActiveDeliveryApi, updateRiderLocationApi } from '@/services/deliveryApi';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, Platform, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function HomeScreen() {
  // Time Clock State
  const [isClockedIn, setIsClockedIn] = useState(true);
  const [startTime, setStartTime] = useState<string | null>("00:00 PHT");
  const [endTime, setEndTime] = useState<string | null>(null);
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  // Live map
  const [showMap, setShowMap] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
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
        setSecondsElapsed((prevSec) => prevSec + 1);
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

  useFocusEffect(
    useCallback(() => {
      loadActiveDelivery();
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

  const handleClockToggle = () => {
    // Logic for clocking in
    const now = new Date();
    const formattedTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Manila'
    });

    if (!isClockedIn) {
      setStartTime(formattedTime);
      setEndTime(null);
      setIsClockedIn(true);
    } else {

      Alert.alert('Clock Out', 'Are you sure you want to clock out for today?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clock Out', 
          style: 'destructive', 
          onPress: () => {
            setEndTime(formattedTime); 
            setIsClockedIn(false);
          } 
        }
      ]);
    }
  };

  // Helper to determine destination coordinates based on delivery phase
  const getDestination = () => {
    if (!delivery) return null;
    const isPickup = ['ACCEPTED', 'ARRIVED_AT_ARTIST'].includes(delivery.step);

    if (isPickup && delivery.artist?.latitude && delivery.artist?.longitude) {
      return {
        coords: {
          latitude: Number(delivery.artist.latitude),
          longitude: Number(delivery.artist.longitude),
        },
        title: `Pickup: ${delivery.artist.name} || 'Artist Studio'`
      };
    }

    if (delivery.buyer?.latitude && delivery.buyer?.longitude) {
      return {
        coords: {
          latitude: Number(delivery.buyer.latitude),
          longitude: Number(delivery.buyer.longitude),
        },
        title: `Drop-off: ${delivery.buyer.name} || 'Customer Address'`
      };
    }

    return null;
  }

  // GPS tracker handler
  const handleLocationPress = async () => {
    // Check permission and get location
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Please enable location services to access the map.');
      return;
    }

    // Show map modal
    setShowMap(true);

    try {
      // Get the postion
      let currentLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setDriverLocation({
        latitude: currentLoc.coords.latitude,
        longitude: currentLoc.coords.longitude,
      });

      // Coordinates into place name
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: currentLoc.coords.latitude,
        longitude: currentLoc.coords.longitude,
      });

      if (reverseGeocode.length > 0) {
        const place = reverseGeocode[0];
        // Format to current location name
        const formattedAddress = [place.streetNumber, place.street || place.name, place.city]
          .filter(Boolean)
          .join(' ');

          setAddressName(formattedAddress || `${place.city || 'Cebu'}, Philippines`)
      }

      // Clear any previous watchers before new one
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
      }

      // Begin active watcher
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 4000,
          distanceInterval: 10,
        },
        async (newLocation) => {
          setDriverLocation({
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
          });

          // Update place name according on movement
          try {
            await updateRiderLocationApi(
              1, 
              newLocation.coords.latitude, 
              newLocation.coords.longitude
            );
          } catch (apiErr) {
            console.log('Django location sync error:', apiErr);
          }
        }
      );
    } catch (error) {
      console.error("GPS Tracking Initialization Error", error);
    }
  };

  const closeMapModal = () => {
    setShowMap(false);
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
  };

  const target = getDestination();
  
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
                {isClockedIn ? 'Clocked In' : 'Clocked Out'}
              </Text>
            </View>
          </View>

          <View style={styles.timeInRow}>
            {startTime && (
              <Text style={styles.startedText}> Started at: <Text style={{ fontWeight: '600' }}>{startTime}</Text></Text>
            )}

            {!isClockedIn && endTime && (
              <Text style={styles.startedText}> | Ended at: <Text style={{ fontWeight: '600' }}>{endTime}</Text></Text>
            )}
          </View>

          <Text style={styles.timerDigits}>
            {isClockedIn ? formatTimer(secondsElapsed) : '00:00:00'}
          </Text>

          <TouchableOpacity 
            style={[styles.clockButton, isClockedIn ? styles.buttonOut : styles.buttonIn]}
            onPress={handleClockToggle}
            activeOpacity={0.8}>
              <Text style={styles.clockButtonText}>{isClockedIn ? 'Clock Out' : 'Clock In'}</Text>
          </TouchableOpacity>
        </View>

        {/* Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Today's Deliveries</Text>
            <Text style={styles.metricNumber}>{delivery ? '1' : '0'}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Active Tasks</Text>
            <Text style={styles.metricNumber}>{delivery ? '1' : '0'}</Text>
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
            <View style={styles.activeBannerHeader}>
              <View style={styles.row}>
                <Ionicons name="bicycle" size={22} color="#BC5454" style={{ marginRight: 8 }}/>
                <Text style={styles.activeBannerTitle}>Order #{delivery.id} in Progress</Text>
              </View>
              <View style={styles.activeStatusBadge}>
                <Text style={styles.activeStatusBadgeText}>{delivery.step}</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={16} color="#7F8C8D" style={{ marginRight: 6 }}/>
              <Text style={styles.detailText}>
                {['ACCEPTED', 'ARRIVED_AT_ARTIST'].includes(delivery.step)
                  ? `Pickup: $delivery.artist?.name || 'Artist'}`
                  : `Drop-off: ${delivery.buyer?.name || 'Customer'}`}
              </Text>
            </View>

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
          <DeliveryMap
            driverLocation={driverLocation}
            destinationLocation={target?.coords || null}
            destinationTitle={target?.title || 'Destination'}
            onRouteCalculated={(dist, mins) => setRouteStats({ distance: dist, eta: mins})}
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