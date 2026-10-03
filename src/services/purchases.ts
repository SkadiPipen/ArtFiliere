import { auth } from '@/firebase/config';
import API_URL from './api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';
import { Platform } from 'react-native';

export async function purchaseRequest(path: string, method = 'GET', body?: object) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please log in again.');
  return readApiResponse(await fetch(`${API_URL}/api/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  }));
}

export async function downloadPurchase(id: number) {
  return downloadProtectedFile(`purchases/${id}/png/`, `artwork-${id}.png`, 'image/png');
}

export async function downloadProtectedFile(path: string, name: string, mimeType?: string) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please log in again.');
  const url = `${API_URL}/api/${path}`;
  const headers = { Authorization: `Bearer ${token}` };
  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers });
    if (!response.ok) { await readApiResponse(response); return; }
    const blob = URL.createObjectURL(await response.blob());
    const a = document.createElement('a'); a.href = blob; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(blob), 60000);
  } else {
    const FileSystem = await import('expo-file-system/legacy');
    const Sharing = await import('expo-sharing');
    const file = `${FileSystem.cacheDirectory}${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const result = await FileSystem.downloadAsync(url, file, { headers });
    if (result.status !== 200) {
      await FileSystem.deleteAsync(file, { idempotent: true });
      throw new Error('Unable to download this file.');
    }
    if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
    try { await Sharing.shareAsync(file, { mimeType }); }
    finally { await FileSystem.deleteAsync(file, { idempotent: true }); }
  }
}
