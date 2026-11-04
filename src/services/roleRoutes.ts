/** Dashboard routing uses the server's role, never an email or login-page choice. */
export function staffDashboardForRole(role: unknown): string | null {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : '';
  return ({
    platform_admin: '/admin-dashboard',
    customer_support: '/customer-service-dashboard',
    hr: '/hr-dashboard',
    creative_moderator: '/creative-dashboard',
    driver: '/rider/(tabs)',
    rider: '/rider/(tabs)',
  } as Record<string, string>)[normalized] || null;
}
