import { useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';

export default function PlatformGate({ platform, roles, children }: { platform: 'web' | 'mobile'; roles?: string[]; children: ReactNode }) {
  const { user, loading } = useContext(AuthContext);
  const [checked, setChecked] = useState<{ uid: string; role: string } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const allowedPlatform = platform === 'web' ? Platform.OS === 'web' : Platform.OS === 'android' || Platform.OS === 'ios';
  useEffect(() => {
    let active = true;
    setChecked(null); setError('');
    if (allowedPlatform && roles && user) (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me/`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Unable to verify your account.');
        if (active && auth.currentUser?.uid === user.uid) setChecked({ uid: user.uid, role: data.role });
      } catch (e: any) { if (active) setError(e.message); }
    })();
    return () => { active = false; };
  }, [allowedPlatform, user?.uid, !!roles, retry]);
  const message = !allowedPlatform ? platform === 'web' ? 'This panel is available on the website only. Open it in a web browser.' : 'Driver features are available in the Android or iOS mobile app only.' : error || (roles && checked?.uid === user?.uid && checked && !roles.includes(checked.role) ? 'Your account does not have access to this panel.' : '');
  if (message) return <View style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 18 }}><Text accessibilityRole="alert">{message}</Text>{!!error && <TouchableOpacity onPress={() => setRetry(n => n + 1)}><Text>Retry</Text></TouchableOpacity>}<TouchableOpacity onPress={() => router.replace('/login')}><Text style={{ color: '#C15656' }}>Back to login</Text></TouchableOpacity></View>;
  if (roles && !loading && !user) return <Redirect href="/login" />;
  if (roles && (loading || checked?.uid !== user?.uid)) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color="#C15656" /></View>;
  return <>{children}</>;
}
