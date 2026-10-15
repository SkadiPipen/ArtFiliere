import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export async function settingsRequest(path = '', method = 'GET', body?: object) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Error('Please sign in again.');
  return readApiResponse(await fetch(`${API_URL}/auth/settings/${path}`, { method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) }));
}
export async function pickSettingsImage(square = false): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8, allowsEditing: square, ...(square ? { aspect: [1, 1] as [number, number] } : {}) });
  if (result.canceled) return null;
  const encoded = result.assets[0].base64;
  if (!encoded) throw Error('Unable to read this photo. Choose a different image.');
  if (encoded.length * 3 / 4 > 5 * 1024 * 1024) throw Error('Choose a photo no larger than 5 MB.');
  const mime = encoded.startsWith('iVBORw0KGgo') ? 'image/png' : encoded.startsWith('UklGR') ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${encoded}`;
}

export async function openSettingsDocument(uri: string, filename = 'bir-registration.pdf') {
  const match = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(uri);
  if (!match) throw Error('This saved document is unavailable. Submit an updated photo for review.');
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(await (await fetch(uri)).blob());
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    const fs = await import('expo-file-system/legacy');
    const sharing = await import('expo-sharing');
    if (!await sharing.isAvailableAsync()) throw Error('Document sharing is unavailable on this device.');
    const extension = match[1] === 'application/pdf' ? 'pdf' : match[1].split('/')[1];
    const path = `${fs.cacheDirectory}bir-registration.${extension}`;
    try { await fs.writeAsStringAsync(path, match[2], { encoding: fs.EncodingType.Base64 }); await sharing.shareAsync(path, { mimeType: match[1] }); }
    finally { await fs.deleteAsync(path, { idempotent: true }); }
  }
}
