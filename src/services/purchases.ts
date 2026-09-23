import { auth } from '@/firebase/config';
import API_URL from './api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';
import { Platform } from 'react-native';

export async function purchaseRequest(path: string, method = 'GET', body?: object) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please log in again.');
  return readApiResponse(await fetch(`${API_URL}/api/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
}

export async function downloadPurchase(id: number) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please log in again.');
  const url = `${API_URL}/api/purchases/${id}/png/`;
  const headers = { Authorization: `Bearer ${token}` };
  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers });
    if (!response.ok) { await readApiResponse(response); return; }
    const blob = URL.createObjectURL(await response.blob());
    const a = document.createElement('a'); a.href = blob; a.download = `artwork-${id}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(blob), 60000);
  } else {
    const FileSystem = await import('expo-file-system/legacy');
    const Sharing = await import('expo-sharing');
    const file = `${FileSystem.cacheDirectory}purchase-${id}.png`;
    const result = await FileSystem.downloadAsync(url, file, { headers });
    if (result.status !== 200) {
      await FileSystem.deleteAsync(file, { idempotent: true });
      throw new Error('Unable to download this purchase.');
    }
    if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
    try { await Sharing.shareAsync(file, { mimeType: 'image/png' }); }
    finally { await FileSystem.deleteAsync(file, { idempotent: true }); }
  }
}
