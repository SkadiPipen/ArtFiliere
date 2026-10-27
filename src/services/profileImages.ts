import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

async function browserImage(uri: string, cover: boolean): Promise<string> {
  const image = new window.Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(Error('Unable to read this image. Try a JPEG or PNG file.'));
    image.src = uri;
  });
  if (!image.naturalWidth || !image.naturalHeight) throw Error('This image could not be read.');
  const scale = Math.min(1, (cover ? 1920 : 800) / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw Error('Image processing is unavailable in this browser.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL('image/jpeg', 0.82);
  if (result.length > 4194304) throw Error('Choose a smaller image, under 3 MB.');
  return result;
}

export async function pickProfileImage(cover = false): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: cover ? [18, 5] : [1, 1],
    quality: 0.8, base64: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  // Browser quality/cropping options are ignored by Expo's picker.
  if (Platform.OS === 'web') {
    if ((asset.fileSize || 0) > 20 * 1024 * 1024) throw Error('Choose an image under 20 MB.');
    return browserImage(asset.uri, cover);
  }
  if (!asset.base64 || asset.base64.length > 4194304) throw Error('Choose an image under 3 MB.');
  const mime = asset.base64.startsWith('/9j/') ? 'image/jpeg'
    : asset.base64.startsWith('iVBORw0KGgo') ? 'image/png'
    : asset.base64.startsWith('UklGR') ? 'image/webp' : asset.mimeType || 'image/jpeg';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw Error('Choose a JPEG, PNG or WebP image.');
  return `data:${mime};base64,${asset.base64}`;
}
