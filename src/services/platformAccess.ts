export const WEB_STAFF_ROLES = ['customer_support'];

export function platformAccessError(role: string, platform: string): string | null {
  if (WEB_STAFF_ROLES.includes(role) && platform !== 'web') return 'Customer support accounts are available on the website only. Please sign in using a web browser.';
  return null;
}
