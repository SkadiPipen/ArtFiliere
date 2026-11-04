import { router, type Href } from 'expo-router';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { cleanHistory, recordRoute, safeInternalRoute, workspaceForRole } from './backHistory';

let storageKey = 'artfiliere:back:v1:guest';
let trail: string[] = [];

function save() {
  try { if (typeof window !== 'undefined') window.sessionStorage.setItem(storageKey, JSON.stringify(trail)); } catch { /* Private-mode storage may be disabled. Parent fallbacks still work. */ }
}

export function trackBackRoute(route: string, account = 'guest') {
  const key = 'artfiliere:back:v1:' + account;
  if (key !== storageKey || !trail.length) {
    storageKey = key;
    try { trail = typeof window !== 'undefined' ? cleanHistory(JSON.parse(window.sessionStorage.getItem(key) || '[]')) : []; }
    catch { trail = []; }
  }
  trail = recordRoute(trail, route);
  save();
}

function returnToHistory(): boolean {
  if (router.canGoBack()) { router.back(); return true; }
  if (trail.length > 1) {
    trail = trail.slice(0, -1);
    const previous = trail[trail.length - 1];
    save();
    if (safeInternalRoute(previous)) { router.replace(previous as Href); return true; }
  }
  return false;
}

/** Prefer the navigator, then the tab's saved page, then a known parent. */
export function goBackOr(fallback: Href = '/(home)') {
  if (!returnToHistory()) router.replace(fallback);
}

/** Shared staff review pages may be entered by HR or different moderator roles. */
export async function goBackToWorkspace() {
  if (returnToHistory()) return;
  let role: string | undefined;
  try {
    await auth.authStateReady();
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(API_URL + '/auth/me/', { signal: controller.signal, headers: { Authorization: 'Bearer ' + token } });
        if (response.ok) role = (await response.json()).role;
      } finally { clearTimeout(timeout); }
    }
  } catch { /* A failed profile request must not make Back inert. */ }
  router.replace(workspaceForRole(role) as Href);
}
