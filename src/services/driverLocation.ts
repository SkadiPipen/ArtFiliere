import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type DriverPosition = { latitude: number; longitude: number; accuracy: number };
export function checkedDriverPosition(coords: { latitude: number; longitude: number; accuracy: number | null }, allowApproximate = false): DriverPosition {
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180 || coords.accuracy == null || !Number.isFinite(coords.accuracy) || coords.accuracy < 0 || (!allowApproximate && coords.accuracy > 200)) {
    throw new Error('A precise GPS location is unavailable. Enable precise location or use your phone outdoors. No estimated location has been used.');
  }
  // Browser GeolocationCoordinates uses prototype getters, not enumerable fields.
  return { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
}
export async function getDriverPosition(): Promise<DriverPosition> {
  if (Platform.OS === 'web') {
    if (!navigator.geolocation) throw new Error('GPS is unavailable in this browser.');
    const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }));
    return checkedDriverPosition(position.coords);
  }
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Allow precise location access to locate the driver.');
  return checkedDriverPosition((await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest })).coords);
}
