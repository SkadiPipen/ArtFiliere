import { Text } from '@/components/Typography';
import MapView, { Marker } from 'react-native-maps';
import { View } from 'react-native';

export type AddressPoint = { latitude: number; longitude: number };
export type AddressLocationPickerProps = { value: AddressPoint | null; onChange: (point: AddressPoint) => void };

export default function AddressLocationPicker({ value, onChange }: AddressLocationPickerProps) {
  return <View style={{ gap: 8 }}>
    <Text>Tap your exact delivery location on the map. Drag the pin to adjust it, then save the address. The initial map view is not a selected location.</Text>
    <MapView style={{ height: 300, width: '100%' }} initialRegion={{ ...(value || { latitude: 10.3157, longitude: 123.8854 }), latitudeDelta: 0.12, longitudeDelta: 0.12 }} onPress={event => onChange(event.nativeEvent.coordinate)}>
      {value && <Marker coordinate={value} draggable onDragEnd={event => onChange(event.nativeEvent.coordinate)} title="Selected delivery location" />}
    </MapView>
    <Text>{value ? 'Location selected · save address to calculate shipping.' : 'No exact location selected yet.'}</Text>
  </View>;
}
