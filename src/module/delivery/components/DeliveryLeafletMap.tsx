import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

interface DeliveryMapProps {
  driverLat?: number | null;
  driverLng?: number | null;
  targetLat: number;
  targetLng: number;
  targetLabel: string;
  isPickupStep: boolean;
  onRouteCalculated?: (distanceKm: string, durationMins: string) => void;
}

export default function DeliveryLeafletMap({
  driverLat,
  driverLng,
  targetLat,
  targetLng,
  targetLabel,
  isPickupStep,
  onRouteCalculated,
}: DeliveryMapProps) {
  const currentDriverLat = driverLat || 10.3157;
  const currentDriverLng = driverLng || 123.8854;

  const targetColor = isPickupStep ? '#BC5454' : '#27AE60';
  const stepTitle = isPickupStep ? 'Pickup from Artist' : 'Drop-off to Buyer';

  // State to hold real street geometry from OSRM
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([
    [currentDriverLat, currentDriverLng],
    [targetLat, targetLng],
  ]);

  // Fetch road route and accurate driving time from OSRM
  useEffect(() => {
    let isMounted = true;

    async function fetchRoadRoute() {
      try {
        const start = `${currentDriverLng},${currentDriverLat}`;
        const end = `${targetLng},${targetLat}`;
        const url = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;

        const res = await fetch(url);
        const data = await res.json();

        if (data?.routes?.[0] && isMounted) {
          const route = data.routes[0];
          // OSRM coordinates format: [lng, lat] -> Leaflet format: [lat, lng]
          const coords: [number, number][] = route.geometry.coordinates.map(
            (pt: [number, number]) => [pt[1], pt[0]]
          );
          setRouteGeometry(coords);

          const distanceKm = (route.distance / 1000).toFixed(1);
          const durationMins = Math.max(1, Math.round(route.duration / 60)).toString();

          if (onRouteCalculated) {
            onRouteCalculated(distanceKm, durationMins);
          }
        }
      } catch (err) {
        console.warn('OSRM router error, falling back to straight coordinate line:', err);
      }
    }

    fetchRoadRoute();

    return () => {
      isMounted = false;
    };
  }, [currentDriverLat, currentDriverLng, targetLat, targetLng]);

  const leafletHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; }
          .leaflet-popup-content-wrapper { border-radius: 8px; font-family: sans-serif; font-size: 12px; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const centerLat = ${(currentDriverLat + targetLat) / 2};
          const centerLng = ${(currentDriverLng + targetLng) / 2};
          const map = L.map('map', { zoomControl: true }).setView([centerLat, centerLng], 13);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          // Rider GPS Location Marker (Blue Icon with Pulse)
          const riderMarker = L.circleMarker([${currentDriverLat}, ${currentDriverLng}], {
            radius: 9,
            fillColor: '#2980B9',
            color: '#FFFFFF',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.95
          }).addTo(map).bindPopup('<b>Your Current Location (Rider)</b>');

          // Target Destination Marker (Red for Artist Pickup, Green for Buyer Drop-off)
          const destinationMarker = L.circleMarker([${targetLat}, ${targetLng}], {
            radius: 10,
            fillColor: '${targetColor}',
            color: '#FFFFFF',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.95
          }).addTo(map).bindPopup('<b>${stepTitle}</b><br/>${targetLabel}').openPopup();

          // Live turn-by-turn road route line
          const roadPoints = ${JSON.stringify(routeGeometry)};
          const polyline = L.polyline(roadPoints, {
            color: '${targetColor}',
            weight: 5,
            opacity: 0.85,
            lineJoin: 'round'
          }).addTo(map);

          // Pan and zoom to show the entire route clearly
          map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
        </script>
      </body>
    </html>
  `;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <iframe
          srcDoc={leafletHtml}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 14 }}
          title="Live Delivery Route"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.nativeFallback]}>
      <Text style={styles.fallbackTitle}>Target: {targetLabel}</Text>
      <Text style={styles.fallbackSubtitle}>Tap Open in Maps to launch external navigation</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 250,
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#EAECEE',
  },
  nativeFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    padding: 16,
  },
  fallbackTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2C3E50',
  },
  fallbackSubtitle: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 4,
  },
});