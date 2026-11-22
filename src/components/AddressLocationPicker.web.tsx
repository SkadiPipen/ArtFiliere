import { Text } from '@/components/Typography';
import { loadLeaflet } from '@/module/delivery/components/WebDeliveryTiles';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { AddressLocationPickerProps } from './AddressLocationPicker';

export default function AddressLocationPicker({ value, onChange }: AddressLocationPickerProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const [library, setLibrary] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void loadLeaflet().then(L => { if (active) setLibrary(L); }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!library || !container.current) return;
    const initial = latest.current.value;
    const instance = library.map(container.current).setView(initial ? [initial.latitude, initial.longitude] : [10.3157, 123.8854], initial ? 17 : 12);
    library.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(instance);
    instance.on('click', (event: any) => latest.current.onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; marker.current = null; };
  }, [library]);
  useEffect(() => {
    if (!map.current || !library) return;
    if (!value) { marker.current?.remove(); marker.current = null; return; }
    const point = [value.latitude, value.longitude];
    if (!marker.current) marker.current = library.circleMarker(point, { radius: 10, color: '#FFF', fillColor: '#C15656', fillOpacity: 1, weight: 3 }).addTo(map.current);
    else marker.current.setLatLng(point);
    map.current.panTo(point);
  }, [value?.latitude, value?.longitude, library]);
  return <View style={{ gap: 8 }}>
    <Text>Zoom in and click your exact delivery location. Click again to move the pin, then save the address. The initial map view is not a selected location.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A13030' }}>{error}</Text>}
    <div ref={container} aria-label="Select exact delivery location on map" style={{ height: 300, width: '100%', borderRadius: 12, overflow: 'hidden', zIndex: 0 }} />
    <Text>{value ? 'Location selected · save address to calculate shipping.' : 'No exact location selected yet.'}</Text>
  </View>;
}
