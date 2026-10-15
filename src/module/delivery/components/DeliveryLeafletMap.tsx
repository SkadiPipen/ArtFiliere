import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';

interface DeliveryMapProps {
  driverLat?: number | null; driverLng?: number | null;
  targetLat: number | null; targetLng: number | null; targetLabel: string; isPickupStep: boolean;
  onRouteCalculated?: (distanceKm: string, durationMins: string) => void;
  onRouteUnavailable?: () => void;
}
const valid = (lat: any, lng: any) => typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const jsValue = (value: any) => JSON.stringify(value).replace(/</g, '\\u003c');

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
  if (!hasTarget) return <View style={{ padding: 20 }}><Text>Exact destination location unavailable. Ask the artist or buyer to save an accurate address pin, then refresh the delivery.</Text></View>;
  const color = isPickupStep ? '#BC5454' : '#27AE60';
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><style>html,body,#map{height:100%;width:100%;margin:0}</style></head><body><div id="map"></div><script>
    const target=${jsValue([targetLat, targetLng])}, driver=${jsValue(hasDriver ? [driverLat, driverLng] : null)}, points=${jsValue(route)};
    const map=L.map('map').setView(target,16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    const label=document.createElement('div');label.textContent=${jsValue(`${isPickupStep ? 'Artist pickup' : 'Buyer destination'}: ${targetLabel}`)};
    L.circleMarker(target,{radius:10,fillColor:'${color}',color:'#fff',weight:3,fillOpacity:1}).addTo(map).bindPopup(label).openPopup();
    if(driver)L.circleMarker(driver,{radius:9,fillColor:'#2980B9',color:'#fff',weight:3,fillOpacity:1}).addTo(map).bindPopup('Your GPS location');
    if(points.length>1){const line=L.polyline(points,{color:'${color}',weight:5}).addTo(map);map.fitBounds(line.getBounds(),{padding:[30,30],maxZoom:17});}
    else if(driver)map.fitBounds(L.latLngBounds([driver,target]),{padding:[30,30],maxZoom:17});
  </script></body></html>`;
  return <View style={{ gap: 8 }}>
    {!hasDriver && <Text>Waiting for precise driver GPS. No route or ETA is estimated.</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}
    {Platform.OS === 'web' ? <iframe srcDoc={html} sandbox="allow-scripts" title="Verified delivery location and road route" style={{ width: '100%', height: 300, border: 'none', borderRadius: 14 }} /> : <Text>Destination: {targetLabel}. Use Open in Maps for navigation.</Text>}
  </View>;
}
