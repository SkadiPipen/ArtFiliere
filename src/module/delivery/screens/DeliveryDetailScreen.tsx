// Step 1, 2, 3 progress indicators
import { ArtistPickupCard } from '@/module/delivery/components/ArtistPickupCard';
import { BuyerDeliveryCard } from '@/module/delivery/components/BuyerDeliveryCard';
import { DeliveryProgressBar } from '@/module/delivery/components/DeliveryProgressBar';
import { ActiveDelivery, DeliveryStep } from '@/module/delivery/types/delivery';
import { fetchActiveDeliveryApi, updateOrderStatusApi, updateRiderLocationApi, uploadDeliveryProofApi } from '@/services/deliveryApi';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DeliveryMap from '../components/DeliveryMap';

export default function DeliveryDetailScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const routeOrderId = params.id || params.orderId;

    // Delivery state
    const [delivery, setDelivery] = useState<ActiveDelivery | null>(null);
    const [loading, setLoading] = useState(true);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Live Location and Map Routing
    const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [routeETA, setRouteETA] = useState<string | null>(null);
    const locationSubRef = useRef<Location.LocationSubscription | null>(null);

    // Photo proofs
    const [artistPhotoUri, setArtistPhotoUri] = useState<string | null>(null);
    const [artistPhotoTimestamp, setArtistPhotoTimestamp] = useState<string | null>(null);
    const [buyerPhotoUri, setBuyerPhotoUri] = useState<string | null>(null);
    const [buyerPhotoTimestamp, setBuyerPhotoTimestamp] = useState<string | null>(null);

    const safeGoBack = () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/rider/(tabs)' as any);
        }
    };

    const effectiveOrderId = delivery?.id ?? (delivery as any)?.order_id ?? routeOrderId;

    // Fetch active delivery details
    const loadDeliveryDetails = useCallback(async () => {
        try {
            const data = await fetchActiveDeliveryApi();
            setDelivery(data);
        } catch (error) {
            console.error('Failed to load delivery details:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDeliveryDetails();
    }, [loadDeliveryDetails]);

    // Track Driver GPS
    useEffect(() => {
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setDriverLocation({
                latitude: initial.coords.latitude,
                longitude: initial.coords.longitude,
            });

            locationSubRef.current = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.BestForNavigation,
                    timeInterval: 4000,
                    distanceInterval: 10,
                },
                async (loc) => {
                    setDriverLocation({
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                    });

                    try {
                        await updateRiderLocationApi(1, loc.coords.latitude, loc.coords.longitude);
                    } catch (err) {
                        console.log('Django location update error:', err);
                    }
                }
            );
        })();

        return () => {
            if (locationSubRef.current) {
                locationSubRef.current.remove();
            }
        };
    }, []);

    // Camera Handler
    const handleTakeProofPhoto = async (role: 'artist' | 'buyer') => {
        try {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (!permissionResult.granted) {
                Alert.alert(
                    'Permission Required',
                    'Camera access is needed to capture proof of delivery. Please enable camera permissions in your device settings.'
                );
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.7,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const capturedUri = result.assets[0].uri;
                const timestamp = new Date().toISOString();
                const proofType: 'PICKUP' | 'DELIVERY' = role === 'artist' ? 'PICKUP' : 'DELIVERY';

                if (role === 'artist') {
                    setArtistPhotoUri(capturedUri);
                    setArtistPhotoTimestamp(timestamp);
                } else {
                    setBuyerPhotoUri(capturedUri);
                    setBuyerPhotoTimestamp(timestamp);
                }

                if (effectiveOrderId) {
                    await uploadDeliveryProofApi(Number(effectiveOrderId), role, capturedUri, timestamp, proofType);
                }

                Alert.alert('Proof Saved', 'Photo captured successfully.');
            }
        } catch (error) {
            console.error('Camera Launch Error:', error);
            Alert.alert('Camera Notice', 'Failed to open device camera. Please verify device camera hardware and permissions.');
        }
    };

    // Step Status Transition
    const handleNextDeliverySteps = async () => {
        if (!delivery) return;

        if (!effectiveOrderId) {
            Alert.alert('Error', 'Missing Order ID for this delivery.');
            return;
        }

        if (delivery.step === 'ARRIVED_AT_ARTIST' && !artistPhotoUri) {
            Alert.alert('Proof Required', 'Please take a real-time pickup photo before proceeding.');
            return;
        }
        if (delivery.step === 'ARRIVED_AT_BUYER' && !buyerPhotoUri) {
            Alert.alert('Proof Required', 'Please take a real-time delivery photo before completing the delivery.');
            return;
        }

        let nextStep: DeliveryStep = delivery.step;
        if (delivery.step === 'ACCEPTED') nextStep = 'ARRIVED_AT_ARTIST';
        else if (delivery.step === 'ARRIVED_AT_ARTIST') nextStep = 'PICKED_UP';
        else if (delivery.step === 'PICKED_UP') nextStep = 'IN_TRANSIT';
        else if (delivery.step === 'IN_TRANSIT') nextStep = 'ARRIVED_AT_BUYER';
        else if (delivery.step === 'ARRIVED_AT_BUYER') nextStep = 'DELIVERED';

        setUpdatingStatus(true);
        const result = await updateOrderStatusApi(effectiveOrderId, nextStep as any);
        setUpdatingStatus(false);

        if (result) {
            if (nextStep === 'DELIVERED') {
                if (Platform.OS === 'web') {
                    window.alert('Delivery Completed! Order has been delivered and recorded in History.');
                    safeGoBack();
                } else {
                    Alert.alert('Delivery Completed!', 'Order has been delivered and recorded in History.', [
                        { text: 'OK', onPress: safeGoBack }
                    ]);
                }
            } else {
                setDelivery({ ...delivery, step: nextStep });
            }
        } else {
            Alert.alert('Update failed', 'Could not update delivery status. Please check your network connection.');
        }
    };

    const openNavigation = (lat?: number, lng?: number) => {
        if (!lat || !lng) {
            Alert.alert('Location Unavailable', 'Coordinates not available for navigation.');
            return;
        }
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
    };

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#BC5454" />
                <Text style={styles.loadingText}>Loading Delivery Details...</Text>
            </View>
        );
    }

    if (!delivery) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>Delivery information not found.</Text>
                <TouchableOpacity style={styles.backButtonSimple} onPress={safeGoBack}>
                    <Text style={styles.backButtonSimpleText}>Back to Dashboard</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const isPickup = ['ACCEPTED', 'ARRIVED_AT_ARTIST'].includes(delivery.step);
    const target = isPickup ? delivery.artist : delivery.buyer;
    const destinationCoords =
        target?.latitude && target?.longitude
            ? { latitude: Number(target.latitude), longitude: Number(target.longitude) }
            : null;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#BC5454" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backRow}
                    onPress={safeGoBack}
                    activeOpacity={0.8}
                >
                    <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                    <Text style={styles.backText}>Back to Dashboard</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Delivery Details</Text>
                <Text style={styles.headerSubtitle}>Order #{effectiveOrderId || 'N/A'}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Payment Badge */}
                <View style={styles.paymentBadge}>
                    <Ionicons name="car-outline" size={16} color="#2980B9" />
                    <Text style={styles.paymentBadgeText}>Payment Method: {delivery.paymentMethod || 'Cash'}</Text>
                </View>

                {/* Stepper Progress Bar */}
                <DeliveryProgressBar currentStep={delivery.step} />

                {/* Live Map */}
                <View style={styles.mapCard}>
                    {routeETA && (
                        <View style={styles.etaHeader}>
                            <Ionicons name="time" size={16} color="#2980B9" style={{ marginRight: 6 }} />
                            <Text style={styles.etaText}>ETA: {routeETA}</Text>
                        </View>
                    )}
                    <DeliveryMap
                        driverLocation={driverLocation}
                        destinationLocation={destinationCoords}
                        destinationTitle={
                            isPickup
                                ? (delivery?.artist?.name || (delivery as any)?.artist_name || 'Artist Pickup')
                                : (delivery?.buyer?.name || (delivery as any)?.buyer_name || (delivery as any)?.buyer || 'Buyer Destination')
                        }
                        onRouteCalculated={(dist, duration) => {
                            setRouteETA(`${duration} mins (${dist} km)`);
                        }}
                        style={styles.detailMap}
                    />
                </View>

                {/* Pickup Card */}
                {isPickup && (
                    <ArtistPickupCard
                        artist={delivery.artist}
                        isArrived={delivery.step === 'ARRIVED_AT_ARTIST'}
                        photoUri={artistPhotoUri}
                        onTakePhoto={() => handleTakeProofPhoto('artist')}
                    />
                )}

                {/* Buyer Card (Fixed condition from isPickup to !isPickup) */}
                {!isPickup && (
                    <BuyerDeliveryCard
                        buyer={delivery.buyer}
                        items={delivery.items}
                        isArrived={delivery.step === 'ARRIVED_AT_BUYER'}
                        photoUri={buyerPhotoUri}
                        onTakePhoto={() => handleTakeProofPhoto('buyer')}
                    />
                )}

                {/* Step Action Button */}
                <TouchableOpacity
                    style={[
                        styles.actionButton,
                        delivery.step === 'ARRIVED_AT_BUYER' ? styles.btnGreen : styles.btnRed,
                    ]}
                    onPress={handleNextDeliverySteps}
                    disabled={updatingStatus}
                    activeOpacity={0.8}
                >
                    {updatingStatus ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <Text style={styles.actionButtonText}>
                            {delivery.step === 'ACCEPTED' && 'Arrived at Artist Location'}
                            {delivery.step === 'ARRIVED_AT_ARTIST' && 'Confirm Pickup from Artist'}
                            {delivery.step === 'PICKED_UP' && 'Start Delivery to Buyer'}
                            {delivery.step === 'IN_TRANSIT' && 'Arrived at Buyer Location'}
                            {delivery.step === 'ARRIVED_AT_BUYER' && 'Complete Delivery'}
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Open Navigation */}
                <TouchableOpacity
                    style={styles.mapsButton}
                    onPress={() => openNavigation(destinationCoords?.latitude, destinationCoords?.longitude)}
                    activeOpacity={0.9}
                >
                    <Ionicons name="navigate-outline" size={18} color="#BC5454" />
                    <Text style={styles.mapsButtonText}>Open in Maps</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    header: { backgroundColor: '#BC5454', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20 },
    backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    backText: { color: '#FFFFFF', fontSize: 14, marginLeft: 6, fontWeight: '500' },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
    headerSubtitle: { fontSize: 14, color: '#FADBD8', marginTop: 2 },
    scrollContent: { padding: 18, paddingBottom: 40 },
    paymentBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EBF5FB', padding: 12, borderRadius: 8, marginBottom: 16 },
    paymentBadgeText: { color: '#2980B9', fontWeight: 'bold', marginLeft: 8, fontSize: 14 },
    mapCard: { backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
    etaHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#EBF5FB' },
    etaText: { color: '#2980B9', fontSize: 13, fontWeight: '700' },
    detailMap: { height: 220, width: '100%' },
    actionButton: { height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 14 },
    btnRed: { backgroundColor: '#BC5454' },
    btnGreen: { backgroundColor: '#27AE60' },
    actionButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
    mapsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BC5454', height: 46, borderRadius: 8, marginTop: 10, backgroundColor: '#FFFFFF' },
    mapsButtonText: { color: '#BC5454', fontWeight: 'bold', marginLeft: 6, fontSize: 14 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    loadingText: { marginTop: 10, color: '#7F8C8D', fontSize: 14 },
    errorText: { color: '#7F8C8D', fontSize: 16, marginBottom: 12 },
    backButtonSimple: { backgroundColor: '#BC5454', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
    backButtonSimpleText: { color: '#FFFFFF', fontWeight: 'bold' },
});