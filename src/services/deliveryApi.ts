import API_URL from "@/services/api";

const BASE_URL = `${API_URL}/api/delivery`;

export const fetchPendingOrders = async () => {
    try {
        const response = await fetch(`${BASE_URL}/orders/pending/`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error (`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        return text && text.trim() ? JSON.parse(text) : [];
    } catch (error) {
        console.error('Error fetching pending orders: ', error);
        return[];
    }
};

export const acceptOrderApi = async (orderId: string | number) => {
    try {
        const response = await fetch(`${BASE_URL}/orders/accept/${orderId}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        });

        if (!response.ok) {
            console.error(`Accept Order failed with status: ${response.status}`);
            return false;
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching accepting order:', error);
        return false;
    }
};

export const updateRiderLocationApi = async (riderId: number, latitude: number, longitude: number) => {
    try {
        const response = await fetch(`${BASE_URL}/rider/location/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                rider_id: Number(riderId), 
                latitude: Number(Array.isArray(latitude) ? latitude[0] : latitude),
                longitude: Number(Array.isArray(longitude) ? longitude[0] : longitude),
            }),
        });
        return await response.json();
    } catch (error) {
        console.error('Error updating location:', error);
    }
};

export const updateOrderStatusApi = async (orderId: string | number, nextStatus: string ) => {
    try {
        const response = await fetch(`${BASE_URL}/orders/${orderId}/status/`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ status: nextStatus }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error(`Status update failed [${response.status}]:`, errorData);
            return false;
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating order status:', error);
        return false;
    }
};

export const fetchActiveDeliveryApi = async () => {
    try {
        const response = await fetch(`${BASE_URL}/orders/active/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();

        return text && text.trim() ? JSON.parse(text) : [];
    } catch (error) {
        console.error('Error fetching active delivery:', error);
        return null;
    }
};

export const uploadDeliveryProofApi = async (
    orderId: number,
    role: 'artist' | 'buyer',
    photoUri: string,
    timestamp: string,
    proofType: 'PICKUP' | 'DELIVERY'
) => {
    try {
        const formData = new FormData();
        const cleanUri = photoUri.startsWith('file://') ? photoUri: `file://${photoUri}`;
        const filename = cleanUri.split('/').pop() || `proof_${Date.now()}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}.toLowerCase()` : 'image/jpeg';

        formData.append('role', role);
        formData.append('timestamp', timestamp);
        formData.append('proof_type', proofType);
        formData.append('order_id', String(orderId));

        formData.append('proof_image', {
            uri: cleanUri,
            name: filename,
            type: type,
        } as any);

        const response = await fetch(`${BASE_URL}/orders/${orderId}/proof/`, {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': 'application/json',
            },
        });

        return response.ok;
    } catch (error) {
        console.error('Proof upload error:', error);
        return false;
    }
};

export const fetchDeliveryHistory = async () => {
  try {
    const response = await fetch('http://localhost:8000/api/delivery/orders/history/', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch delivery history:', error);
    return [];
  }
};

export const fetchRiderProfile = async () => {
  try {
    const response = await fetch('http://localhost:8000/api/delivery/rider/profile/', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch rider profile:', error);
    return null;
  }
};