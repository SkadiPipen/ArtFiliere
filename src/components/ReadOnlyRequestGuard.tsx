import { useContext, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { AuthContext } from '@/context/AuthContext';
import API_URL from '@/services/api';

export default function ReadOnlyRequestGuard() {
  const { readOnly } = useContext(AuthContext);
  useEffect(() => {
    if (!readOnly) return;
    const original = globalThis.fetch;
    let notified = 0;
    const guarded: typeof fetch = async (input, init) => {
      const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
      const url = new URL(address, API_URL);
      const api = new URL(API_URL);
      const exception = url.pathname === '/api/account/appeals/' || url.pathname.startsWith('/api/support/tickets/') || url.pathname.startsWith('/api/commissions/workspace/') || url.pathname === '/auth/login/';
      if (url.origin === api.origin && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !exception) {
        const message = 'Your account is suspended. You can view the platform, contact Customer Service, or appeal, but you cannot make changes.';
        if (Date.now() - notified > 5000) { notified = Date.now(); if (Platform.OS === 'web') window.alert(message); else Alert.alert('View-only access', message); }
        throw new Error(message);
      }
      return original(input, init);
    };
    globalThis.fetch = guarded;
    return () => { if (globalThis.fetch === guarded) globalThis.fetch = original; };
  }, [readOnly]);
  return null;
}
