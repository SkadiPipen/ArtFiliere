import * as ImagePicker from 'expo-image-picker';

export async function captureProfilePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw Error('Allow camera access in your device settings to take a profile photo.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], cameraType: ImagePicker.CameraType.front, allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
  if (result.canceled) return null;
  const encoded = result.assets[0].base64;
  if (!encoded) throw Error('Could not read the camera photo. Please try again.');
  if (encoded.length * 3 / 4 > 5 * 1024 * 1024) throw Error('The photo exceeds 5 MB. Please take a smaller photo.');
  const mime = encoded.startsWith('iVBORw0KGgo') ? 'image/png' : encoded.startsWith('UklGR') ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${encoded}`;
}
