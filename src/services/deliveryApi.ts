import { purchaseRequest } from './purchases';
import type { ActiveDelivery } from '@/module/delivery/types/delivery';

export const fetchPendingOrders = () => purchaseRequest('delivery/orders/pending/');
export const acceptOrderApi = (id: string | number) => purchaseRequest(`delivery/orders/accept/${id}/`, 'POST', {});
export const fetchActiveDeliveryApi = (): Promise<ActiveDelivery | null> => purchaseRequest('delivery/orders/active/');
export const fetchDelivery = (id: string | number): Promise<ActiveDelivery> => purchaseRequest(`delivery/orders/${id}/`);
export const updateOrderStatusApi = (id: string | number, status: string): Promise<ActiveDelivery> => purchaseRequest(`delivery/orders/${id}/status/`, 'POST', { status });
export const uploadDeliveryProofApi = (id: string | number, proof_type: 'PICKUP' | 'DELIVERY', image: string): Promise<ActiveDelivery> => purchaseRequest(`delivery/orders/${id}/proof/`, 'POST', { proof_type, image });
export const fetchDeliveryHistory = () => purchaseRequest('delivery/orders/history/');
export const fetchRiderProfile = () => purchaseRequest('delivery/rider/profile/');
export const setRiderClock = (is_clocked_in: boolean) => purchaseRequest('delivery/rider/profile/', 'POST', { is_clocked_in });
export const updateRiderLocationApi = (latitude: number, longitude: number) => purchaseRequest('delivery/rider/location/', 'POST', { latitude, longitude });
