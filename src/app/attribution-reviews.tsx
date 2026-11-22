import { useContext, useEffect, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { Text } from '@/components/Typography';
import API_URL from '@/services/api';

// Preserve older bookmarks while keeping reviews inside the role's workspace.
export default function AttributionReviewsRedirect() {
  const { user, loading } = useContext(AuthContext);
  const [role, setRole] = useState<{ uid: string; value: string } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRole(null); setError('');
    if (user) void (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me/`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        if (!response.ok) throw new Error('Unable to verify your account.');
        const profile = await response.json();
        if (active) setRole({ uid: user.uid, value: profile.role });
      } catch (e: any) { if (active) setError(e.message || 'Unable to open the review workspace.'); }
    })();
    return () => { active = false; };
  }, [user?.uid, retry]);
  if (!loading && !user) return <Redirect href="/login" />;
  if (role?.uid === user?.uid && role) {
    if (role.value === 'platform_admin') return <Redirect href={'/admin-blockchain?tab=reviews' as any} />;
    if (role.value === 'creative_moderator') return <Redirect href={'/creative-dashboard?section=queues&queue=attribution' as any} />;
    return <Redirect href="/" />;
  }
  return <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
    {error ? <><Text accessibilityRole="alert">{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text>Try again</Text></TouchableOpacity></> : <ActivityIndicator />}
  </View>;
}
