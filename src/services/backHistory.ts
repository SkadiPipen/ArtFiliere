/** Route-only, per-tab history. Never store tokens, documents or form values. */
export const historyParamNames = ['id', 'artworkId', 'artistId', 'username', 'conversationId', 'commissionId', 'recordId', 'filter'] as const;

export function safeInternalRoute(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000 || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return false;
  try {
    const url = new URL(value, 'https://artfiliere.invalid');
    return url.origin === 'https://artfiliere.invalid' && !['/login', '/sign-up', '/rider/login', '/royalty-payment-return'].includes(url.pathname);
  } catch { return false; }
}

export function cleanHistory(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(safeInternalRoute).slice(-30) : [];
}

export function recordRoute(history: string[], route: string): string[] {
  if (!safeInternalRoute(route)) return [];
  const previous = cleanHistory(history);
  const index = previous.lastIndexOf(route);
  // Navigating back must shrink the trail, not create A -> B -> A loops.
  return index >= 0 ? previous.slice(0, index + 1) : [...previous, route].slice(-30);
}

export function workspaceForRole(role?: string): string {
  return ({ platform_admin: '/admin-dashboard', hr: '/hr-dashboard', creative_moderator: '/moderator-dashboard', customer_support: '/customer-service-dashboard', driver: '/rider/(tabs)' } as Record<string, string>)[role || ''] || '/(home)/profile';
}
