import DeliveryLeafletMap from './DeliveryLeafletMap';
import { View } from 'react-native';

export interface Coordinates { latitude: number; longitude: number }
interface DeliveryMapProps {
  driverLocation: Coordinates | null;
  driverAccuracy?: number;
  destinationLocation: Coordinates | null;
  destinationTitle?: string;
  onRouteCalculated?: (distanceKm: string, durationMins: string) => void;
  onRouteUnavailable?: () => void;
  style?: object;
  mapType?: 'standard' | 'satellite' | 'hybrid';
}

export default function DeliveryMap({ driverLocation, driverAccuracy, destinationLocation, destinationTitle = 'Destination', onRouteCalculated, onRouteUnavailable, style }: DeliveryMapProps) {
  const precise = driverAccuracy == null || driverAccuracy <= 200;
  return <View style={[{ minHeight: 310, width: '100%' }, style]}>
    <DeliveryLeafletMap driverLat={driverLocation?.latitude} driverLng={driverLocation?.longitude}
      targetLat={precise ? destinationLocation?.latitude ?? null : null} targetLng={precise ? destinationLocation?.longitude ?? null : null}
      targetLabel={destinationTitle} isPickupStep onRouteCalculated={onRouteCalculated} onRouteUnavailable={onRouteUnavailable} />
  </View>;
}
