import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
// import MapViewDirections from  'react-native-maps-directions';

let MapView: any = View;
let Marker: any = View;
let Polyline: any = View;
let UrlTile: any = View;
// let PROVIDER_GOOGLE: any = undefined;

if (Platform.OS !== 'web') {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
    Polyline = Maps.Polyline;
    UrlTile = Maps.UrlTile;
    // PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

export interface Coordinates {
    latitude: number;
    longitude: number;
}

interface DeliveryMapProps {
    driverLocation: Coordinates | null;
    destinationLocation: Coordinates | null;
    destinationTitle?: string;
    onRouteCalculated?: (distanceKm: string, durationMins: string) => void;
    style?: object;
    mapType?: 'standard' | 'satellite' | 'hybrid';
}

// const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY || '';

export default function DeliveryMap({
    driverLocation,
    destinationLocation,
    destinationTitle = 'Destination',
    onRouteCalculated,
    style,
    mapType = 'standard',
}: DeliveryMapProps) {
    const mapRef = useRef<any>(null);
    const [routeCoordinates, setRouteCoordinates] = useState<Coordinates[]>([]);
    
    // Web fallback
    if (Platform.OS === 'web') {
        return (
            <View style={[styles.fallbackContainer, style]}>
                <Text style={styles.fallbackText}>Maps are supported on mobile devices.</Text>
            </View>
        );
    }

    // Road route from OpenRouteServcie
    useEffect(() => {
        if (!driverLocation || !destinationLocation) return;

        const fetchRoute = async () => {
            if (ORS_API_KEY) {
                try {
                    const response = await fetch (
                        'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
                        {
                            method: 'POST',
                            headers: {
                                'Accepted': 'application/json, application/geo+json',
                                'Content-Type': 'application/json',
                                'Authorization': ORS_API_KEY,
                            },
                            body: JSON.stringify({
                                coordinates: [
                                    [driverLocation.longitude, driverLocation.latitude],
                                    [destinationLocation.longitude, destinationLocation.latitude],
                                ],
                            }),
                        }
                    );

                    const text = await response.text();

                    // if server returned valid JSON
                    if (text.startsWith('{')) {
                        const data = JSON.parse(text);
                        if (data?.features?.[0]) {
                            const feature = data.features[0];
                            const coords: Coordinates[] = feature.geometry.coordinates.map(
                                (point: [number, number]) => ({
                                    latitude: Number(point[1]),
                                    longitude: Number(point[0]),
                                })
                            );

                            setRouteCoordinates(coords);

                            const summary = feature.properties.summary;
                            const distanceKm = (summary.distance / 1000).toFixed(1);
                            const durationMins = Math.round(summary.duration / 60).toString();

                            if (onRouteCalculated) {
                                onRouteCalculated(distanceKm, durationMins);
                            }

                            return;
                        }
                    } else {
                        console.warn('ORS non-JSON response, using fallback router...');
                    }
                } catch (error) {
                    console.warn('OpenRouteService routing error:', error);
                }            
            }

            // Instant Fallback
            try {
                const start = `${driverLocation.longitude},${driverLocation.latitude}`;
                const end = `${destinationLocation.longitude},${destinationLocation.latitude}`;
                const osrmUrl = `https://router.project-osrm/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;

                const res = await fetch(osrmUrl);
                const data = await res.json();

                if (data?.routes?.[0]) {
                    const route = data.routes[0];
                    const coords: Coordinates[] = route.geometry.coordinates.map(
                        (point: [number, number]) => ({
                            latitude: Number(point[1]),
                            longitude: Number(point[0]),
                        })
                    );
                    setRouteCoordinates(coords);

                    const distanceKm = (route.distance / 1000).toString(1);
                    const durationMins = Math.round(route.duration / 60).toString();

                    if (onRouteCalculated) {
                        onRouteCalculated(distanceKm, durationMins);
                    }
                }
            } catch (fallbackError) {
                console.warn('Fallback routing error:', fallbackError);
            }
        };

        fetchRoute();
    }, [driverLocation, destinationLocation]);

    // Cam view
    useEffect(() => {
        if (driverLocation && destinationLocation && mapRef.current) {
            mapRef.current.fitToCoordinates([driverLocation, destinationLocation], {
                edgePadding: { top: 60, right: 60, bottom: 60, left: 60},
                animated: true,
            });
        }
    }, [driverLocation, destinationLocation]);

    if (!driverLocation) {
        return (
            <View style={[styles.fallbackContainer, style]}>
                <Text style={styles.fallbackText}>Locating driver GPS...</Text>
            </View>
        );
    }

    const toNum = (val: any, fallback: number = 0): number => {
        if (Array.isArray(val)) return Number(val[0]) || fallback;
        const n = Number(val);
        return isNaN(n) ? fallback : n;
    }

    return (
        <View style={[styles.container, style]}>
            <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                mapType={mapType} // standard | satelite | hybrid
                // provider={PROVIDER_GOOGLE}
                initialRegion={{
                    latitude: toNum(driverLocation.latitude, 10.3157),
                    longitude: toNum(driverLocation.longitude, 123.8854),
                    latitudeDelta: 0.015,
                    longitudeDelta: 0.015,
                }}
                showsUserLocation={false}
                showsMyLocationButton={true}
            >
                {/* Roads and bldgs */}
                {mapType === 'standard' && (
                    <UrlTile
                    urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maximumZ={19}
                    flipY={false}
                    />
                )}

            {/* Driver Pin */}
            <Marker coordinate={{
                latitude: toNum(driverLocation.latitude),
                longitude: toNum(driverLocation.longitude),
            }}
            title="Your location" 
            pinColor="#2980B9"/>

            {/* Destination Pin */}
            {destinationLocation && (
                <Marker coordinate={{
                    latitude: toNum(destinationLocation.latitude),
                    longitude: toNum(driverLocation.longitude),
                }}
                title={destinationTitle} 
                pinColor="#E74C3C"/>
            )}

            {/* Live Line Route */}
            {/* {destinationLocation && GOOGLE_API_KEY ? (
                <MapViewDirections
                    origin={driverLocation}
                    destination={destinationLocation}
                    apikey={GOOGLE_API_KEY}
                    strokeWidth={4}
                    strokeColor="#2980B9"
                    optimizeWaypoints={true}
                    onReady={(result) => {
                        if (onRouteCalculated) {
                            onRouteCalculated (
                                result.distance.toFixed(1),
                                Math.round(result.duration).toString()
                            );
                        }
                    }}
                    onError={(errorMessage) => {
                        console.warn('Routing Error:', errorMessage);
                    }}
                />
            ) : null}
            </MapView> */}

            {/* ORS (Polyline) */}
            {routeCoordinates.length > 0 && (
                <Polyline
                    coordinates={routeCoordinates.map((pt) => ({
                        latitude: toNum(pt.latitude),
                        longitude: toNum(pt.longitude),
                    }))}
                    strokeWidth={5}
                    strokeColor='#2980b9'
                />
            )}
            </MapView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 240,
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
    },
    fallbackContainer: {
        height: 240,
        width: '100%',
        borderRadius: 14,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fallbackText: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
});