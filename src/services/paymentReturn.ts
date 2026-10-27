import { Linking, Platform } from 'react-native';
import { auth } from '@/firebase/config';
import { purchaseRequest } from './purchases';

type Target = { kind: 'shop' | 'commission'; id: number; uid: string };
let target: Target | null = null;
let checkoutWindow: Window | null = null;
const key = 'artfiliere-payment-return';

export function preparePaymentWindow(): Window | null {
  if (Platform.OS !== 'web') return null;
  const tab = window.open('about:blank', '_blank');
  if (tab) { tab.opener = null; tab.document.title = 'Preparing secure checkout…'; }
  return tab;
}

export async function openPaymentCheckout(url: string, kind: Target['kind'], id: number, tab?: Window | null) {
  if (!/^https:\/\//i.test(url) || !Number.isInteger(id) || id <= 0 || !auth.currentUser) {
    tab?.close(); throw new Error('Checkout could not be opened. Refresh and try again.');
  }
  const browser = Platform.OS === 'web' ? tab || preparePaymentWindow() : null;
  if (Platform.OS === 'web' && !browser) throw new Error('Allow payment pop-ups for ArtFiliere, then click Checkout again.');
  target = { kind, id, uid: auth.currentUser.uid };
  if (Platform.OS === 'web') {
    try { sessionStorage.setItem(key, JSON.stringify(target)); } catch {}
    checkoutWindow = browser;
    browser!.location.href = url;
  } else await Linking.openURL(url);
}

export async function reconcilePaymentReturn(): Promise<boolean> {
  if (!target && Platform.OS === 'web') {
    try { target = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch {}
  }
  if (!target || auth.currentUser?.uid !== target.uid) return false;
  const current = target;
  const result = current.kind === 'shop'
    ? await purchaseRequest(`payments/${current.id}/refresh/`, 'POST')
    : await purchaseRequest(`commissions/flow/${current.id}/`, 'POST', { action: 'refresh_payment' });
  const paid = current.kind === 'shop' ? result.status === 'paid' : Boolean(result.funded_at);
  if (!paid && !['expired', 'refunded', 'cancelled'].includes(result.status)) return false;
  if (target !== current || auth.currentUser?.uid !== current.uid) return false;
  target = null;
  if (Platform.OS === 'web') {
    try { sessionStorage.removeItem(key); } catch {}
    if (paid) { try { checkoutWindow?.close(); window.focus(); } catch {} }
  }
  checkoutWindow = null;
  return paid;
}
