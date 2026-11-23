import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
export async function commissionApi(path: string, body?: any) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in.');
  const multipart = body instanceof FormData;
  const response = await fetch(`${API_URL}/api/commissions/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.detail || JSON.stringify(data));
  return data;
}
