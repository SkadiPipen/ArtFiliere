import type { ActiveDelivery } from '@/module/delivery/types/delivery';
import API_URL from '@/services/api';

// 1. Fetch pending order requests for RiderOrdersScreen
export async function fetchPendingOrders(): Promise<any[]> {
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
export async function fetchActiveDeliveryApi(): Promise<ActiveDelivery | null> {
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
  orderId: number,
  role: 'artist' | 'buyer',
  photoUri: string,
  timestamp?: string,
  proofType?: 'PICKUP' | 'DELIVERY'
): Promise<any> {
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
export async function fetchDeliveryHistory(): Promise<any[]> {
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
export async function fetchRiderProfile(): Promise<any> {
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
