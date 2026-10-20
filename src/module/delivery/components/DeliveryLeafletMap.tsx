import WebDeliveryTiles from './WebDeliveryTiles';
import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';

interface DeliveryMapProps {
  driverLat?: number | null; driverLng?: number | null;
  targetLat: number | null; targetLng: number | null; targetLabel: string; isPickupStep: boolean;
  onRouteCalculated?: (distanceKm: string, durationMins: string) => void;
  onRouteUnavailable?: () => void;
}
const valid = (lat: any, lng: any) => typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export default function DeliveryLeafletMap({ driverLat, driverLng, targetLat, targetLng, targetLabel, isPickupStep, onRouteCalculated, onRouteUnavailable }: DeliveryMapProps) {
  const [route, setRoute] = useState<[number, number][]>([]);
  const [error, setError] = useState('');
  const callbacks = useRef({ onRouteCalculated, onRouteUnavailable });
  callbacks.current = { onRouteCalculated, onRouteUnavailable };
  const hasDriver = valid(driverLat, driverLng);
  const hasTarget = valid(targetLat, targetLng);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setRoute([]); setError(''); callbacks.current.onRouteUnavailable?.();
    if (!hasDriver || !hasTarget) return () => controller.abort();
    void (async () => {
      try {
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${driverLng},${driverLat};${targetLng},${targetLat}?overview=full&geometries=geojson&radiuses=100;100`, { signal: controller.signal });
        if (!response.ok) throw new Error('Road routing is unavailable.');
        const data = await response.json(); const result = data.routes?.[0];
        if (data.code !== 'Ok' || !result || !Number.isFinite(result.distance) || !Number.isFinite(result.duration) || !Array.isArray(result.geometry?.coordinates) || !result.geometry.coordinates.every((point: any) => valid(point[1], point[0]))) throw new Error('No road route could be verified between these locations.');
        if (!active) return;
        setRoute(result.geometry.coordinates.map((point: number[]) => [point[1], point[0]]));
        callbacks.current.onRouteCalculated?.((result.distance / 1000).toFixed(1), String(Math.max(1, Math.round(result.duration / 60))));
      } catch (e: any) { if (active) { setError(e.message || 'Road routing is unavailable.'); callbacks.current.onRouteUnavailable?.(); } }
    })();
    return () => { active = false; controller.abort(); };
  }, [driverLat, driverLng, targetLat, targetLng, hasDriver, hasTarget]);
  if (!hasTarget) return <View style={{ gap: 8 }}>
    <Text>Pickup or destination pin unavailable. Your location is shown when GPS is available; a route requires a verified destination.</Text>
    {Platform.OS === 'web' && <WebDeliveryTiles
      target={hasDriver ? [driverLat!, driverLng!] : [12.8797, 121.7740]}
      driver={null} points={[]} label="Your GPS location" color="#2980B9" overview={!hasDriver}
    />}
  </View>;
  const color = isPickupStep ? '#BC5454' : '#27AE60';
  return <View style={{ gap: 8 }}>
    {!hasDriver && <Text>Waiting for precise driver GPS. No route or ETA is estimated.</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}
    {Platform.OS === 'web' ? <WebDeliveryTiles target={[targetLat!, targetLng!]} driver={hasDriver ? [driverLat!, driverLng!] : null} points={route} label={`${isPickupStep ? 'Artist pickup' : 'Buyer destination'}: ${targetLabel}`} color={color} /> : <Text>Destination: {targetLabel}. Use Open in Maps for navigation.</Text>}
  </View>;
}
