import { auth } from '@/firebase/config';
import type { ActiveDelivery } from '@/module/delivery/types/delivery';
import API_URL from '@/services/api';

// 1. Fetch pending order requests for RiderOrdersScreen
async function fetchLegacyPendingOrders(): Promise<any[]> {
  try {
    const res = await fetch(`${API_URL}/api/delivery/orders/pending/`);
    if (!res.ok) return [];
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch (err) {
    console.warn('fetchPendingOrders error:', err);
    return [];
  }
}

// 2. Accept an order
export async function acceptOrderApi(orderId: string | number) {
  if (isVerified(orderId)) return tagVerified(await verifiedRequest(`orders/accept/${verifiedId(orderId)}/`, {}));
  try {
    const id = String(orderId).trim();
    const url = `${API_URL}/api/delivery/orders/accept/${id}/`;

    console.log('[acceptOrderApi] Sending POST to:', url);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const errMsg = errJson?.error || errJson?.message || `Server returned HTTP ${res.status}`;
      console.warn(`[acceptOrderApi] Error (${res.status}):`, errMsg);
      throw new Error(errMsg);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : { success: true };
  } catch (error) {
    console.error('acceptOrderApi exception:', error);
    throw error;
  }
}


// 3. Fetch active delivery (Safely returns null if empty to prevent JSON crash!)
async function fetchLegacyActiveDeliveryApi(): Promise<ActiveDelivery | null> {
  try {
    const res = await fetch(`${API_URL}/api/delivery/orders/active/`);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim() === '' || text.trim() === 'null') {
      return null;
    }
    return JSON.parse(text);
  } catch (err) {
    console.warn('fetchActiveDeliveryApi error:', err);
    return null;
  }
}

// 4. Update delivery status (ACCEPTED -> ARRIVED_AT_ARTIST -> PICKED_UP -> IN_TRANSIT -> ARRIVED_AT_BUYER -> DELIVERED)
export async function updateOrderStatusApi(orderId: string | number, nextStatus: string) {
  if (isVerified(orderId)) return tagVerified(await verifiedRequest(`orders/${verifiedId(orderId)}/status/`, { status: nextStatus }));
  try {
    const id = String(orderId).trim();
    const url = `${API_URL}/api/delivery/orders/${id}/status/`;

    console.log(`[updateOrderStatusApi] Sending status '${nextStatus}' to:`, url);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const errMsg =
        errJson?.error ||
        errJson?.message ||
        `Server returned HTTP ${res.status} from ${url}`;
      console.warn(`[updateOrderStatusApi] Error (${res.status}):`, errMsg);
      throw new Error(errMsg);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : { success: true };
  } catch (error) {
    console.error('updateOrderStatusApi exception:', error);
    throw error;
  }
}

// 5. Upload real-time proof of pickup/delivery (Matches your handleTakeProofPhoto)
export async function uploadDeliveryProofApi(
  orderId: string | number,
  role: 'artist' | 'buyer',
  photoUri: string,
  timestamp?: string,
  proofType?: 'PICKUP' | 'DELIVERY'
): Promise<any> {
  if (isVerified(orderId)) return tagVerified(await verifiedRequest(`orders/${verifiedId(orderId)}/proof/`, { proof_type: proofType || (role === 'artist' ? 'PICKUP' : 'DELIVERY'), image: photoUri }));
  const res = await fetch(`${API_URL}/api/delivery/orders/${orderId}/proof/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: proofType || (role === 'artist' ? 'PICKUP' : 'DELIVERY'),
      image: photoUri,
      timestamp: timestamp || new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error('Failed to upload proof photo');
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 6. Update rider live GPS location
export async function updateRiderLocationApi(
  riderId: number = 1,
  latitude: number,
  longitude: number
): Promise<any> {
  try {
    await verifiedRequest('rider/location/', { latitude, longitude }).catch(() => null);
    const res = await fetch(`${API_URL}/api/delivery/rider/location/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rider_id: riderId, latitude, longitude }),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.warn('updateRiderLocationApi error:', err);
    return null;
  }
}

// 7. Completed deliveries history
async function fetchLegacyDeliveryHistory(): Promise<any[]> {
  try {
    const res = await fetch(`${API_URL}/api/delivery/orders/history/`);
    if (!res.ok) return [];
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch (err) {
    console.warn('fetchDeliveryHistory error:', err);
    return [];
  }
}

// 8. Rider profile
async function fetchLegacyRiderProfile(): Promise<any> {
  try {
    const res = await fetch(`${API_URL}/api/delivery/rider/profile/`);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.warn('fetchRiderProfile error:', err);
    return null;
  }
}


// Keep protected platform order IDs separate from the legacy delivery.Order IDs.
const isVerified = (id: string | number) => String(id).startsWith('verified-');
const verifiedId = (id: string | number) => {
  const match = /^verified-(\d+)$/.exec(String(id));
  if (!match) throw new Error('Invalid platform delivery reference.');
  return match[1];
};
const tagVerified = (value: any): any => value ? { ...value, id: `verified-${value.id}`, delivery_fee: Number(value.delivery_fee || value.fee || 0) } : null;

async function verifiedRequest(path: string, body?: any) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in with your driver account.');
  const response = await fetch(`${API_URL}/api/delivery/verified/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.detail || `Delivery request failed (${response.status}).`);
  return data;
}

export async function fetchPendingOrders(): Promise<any[]> {
  const [legacy, platform] = await Promise.all([fetchLegacyPendingOrders(), verifiedRequest('orders/pending/')]);
  return [...(Array.isArray(platform) ? platform.map(tagVerified) : []), ...legacy];
}

export async function fetchActiveDeliveryApi(): Promise<ActiveDelivery | null> {
  const platform = await verifiedRequest('orders/active/').catch(() => null);
  return platform ? tagVerified(platform) : fetchLegacyActiveDeliveryApi();
}

export async function fetchDeliveryDetailsApi(orderId: string | number): Promise<ActiveDelivery | null> {
  if (isVerified(orderId)) return tagVerified(await verifiedRequest(`orders/${verifiedId(orderId)}/`));
  const response = await fetch(`${API_URL}/api/delivery/orders/${encodeURIComponent(String(orderId))}/`);
  if (!response.ok) throw new Error('Delivery not found.');
  return response.json();
}

export async function fetchDeliveryHistory(): Promise<any[]> {
  const [legacy, platform] = await Promise.all([fetchLegacyDeliveryHistory(), verifiedRequest('orders/history/').catch(() => [])]);
  return [...(Array.isArray(platform) ? platform.map(tagVerified) : []), ...legacy];
}

export async function fetchRiderProfile(): Promise<any> {
  const [legacy, profile] = await Promise.all([fetchLegacyRiderProfile(), verifiedRequest('rider/profile/').catch(() => null)]);
  return profile ? { ...legacy, ...profile } : legacy;
}

export async function setRiderClockApi(isClockedIn: boolean) {
  return verifiedRequest('rider/profile/', { is_clocked_in: isClockedIn });
}
