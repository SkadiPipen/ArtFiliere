import { useContext, useEffect } from 'react';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { historyParamNames } from '@/services/backHistory';
import { trackBackRoute } from '@/services/navigation';

export default function BackNavigationTracker() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const { user, loading } = useContext(AuthContext);
  const query = new URLSearchParams();
  for (const name of historyParamNames) {
    const value = params[name];
    if (typeof value === 'string' && value.length <= 128) query.set(name, value);
  }
  const serialized = query.toString();
  const route = pathname + (serialized ? '?' + serialized : '');
  useEffect(() => {
    if (!loading) trackBackRoute(route, user?.uid || 'guest');
  }, [route, loading, user?.uid]);
  return null;
}
