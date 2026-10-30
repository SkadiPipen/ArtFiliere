import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { purchaseRequest } from '@/services/purchases';

/** Best-effort read receipts must never block loading or deciding a request. */
export async function markAdminQueueRead(category: string, ids: Array<string | number>) {
  if (!ids.length) return;
  try {
    await auth.authStateReady();
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const profile = await fetch(API_URL + '/auth/me/', { headers: { Authorization: 'Bearer ' + token } });
    if (!profile.ok || (await profile.json()).role !== 'platform_admin') return;
    const summary = await purchaseRequest('users/admin/request-notifications/');
    await purchaseRequest('users/admin/request-notifications/', 'PATCH', { snapshot: summary.snapshot, category, request_ids: ids });
  } catch { /* Keep notices unread if acknowledgement fails; the request remains usable. */ }
}
