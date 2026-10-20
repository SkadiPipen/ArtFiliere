import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';

let leafletPromise: Promise<any> | undefined;
function loadLeaflet(): Promise<any> {
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (!leafletPromise) leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve((window as any).L);
    script.onerror = () => { leafletPromise = undefined; reject(new Error('Map library could not load. Check your connection.')); };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

interface Props {
  target: [number, number]; driver: [number, number] | null;
  points: [number, number][]; label: string; color: string; accuracy?: number; overview?: boolean;
}
export default function WebDeliveryTiles({ target, driver, points, label, color, accuracy, overview = false }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any>(null);
  const [leaflet, setLeaflet] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    void loadLeaflet().then(library => { if (active) setLeaflet(library); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; mapRef.current?.remove(); mapRef.current = null; layersRef.current = null; };
  }, []);
  useEffect(() => {
    if (!leaflet || !container.current) return;
    if (!mapRef.current) {
      const map = leaflet.map(container.current).setView(target, overview ? 5 : 16);
      mapRef.current = map;
      const tiles = leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      });
      tiles.on('tileerror', () => setError('Map tiles could not load. Check your connection; the map provider may be temporarily unavailable.'));
      tiles.addTo(map);
      layersRef.current = leaflet.layerGroup().addTo(map);
    }
    const map = mapRef.current;
    const layers = layersRef.current;
    layers.clearLayers();
    if (accuracy && accuracy > 0) leaflet.circle(target, { radius: accuracy, color: '#2980B9', fillOpacity: 0.1 }).addTo(layers);
    const caption = document.createElement('div'); caption.textContent = label;
    if (!overview) leaflet.circleMarker(target, { radius: 10, fillColor: color, color: '#fff', weight: 3, fillOpacity: 1 }).addTo(layers).bindPopup(caption).openPopup();
    if (driver) leaflet.circleMarker(driver, { radius: 9, fillColor: '#2980B9', color: '#fff', weight: 3, fillOpacity: 1 }).addTo(layers).bindPopup('Your GPS location');
    if (points.length > 1) {
      const line = leaflet.polyline(points, { color, weight: 5 }).addTo(layers);
      map.fitBounds(line.getBounds(), { padding: [30, 30], maxZoom: 17 });
    } else if (driver) map.fitBounds(leaflet.latLngBounds([driver, target]), { padding: [30, 30], maxZoom: 17 });
    else if (accuracy && accuracy > 200) map.fitBounds(leaflet.circle(target, { radius: accuracy }).getBounds(), { padding: [30, 30], maxZoom: 16 });
    else map.setView(target, overview ? 5 : 16);
    map.invalidateSize();
  }, [leaflet, target[0], target[1], driver?.[0], driver?.[1], points, label, color, accuracy, overview]);
  return <View style={{ gap: 8 }}>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}
    {Platform.OS === 'web' && <div ref={container} aria-label="Delivery location and road route" style={{ width: '100%', height: 300, borderRadius: 14, overflow: 'hidden', zIndex: 0 }} />}
  </View>;
}
