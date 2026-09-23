import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase/config';
import { fetchRiderProfile } from '@/services/deliveryApi';

export default function RiderGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState('loading');
  const router = useRouter();
  useEffect(() => {
    let generation = 0;
    const unsub = onAuthStateChanged(auth, user => {
      const version = ++generation;
      if (!user) { setState('login'); return; }
      setState('loading');
      fetchRiderProfile().then(() => { if (generation === version) setState('ready'); }).catch(e => { if (generation === version) setState(e.message); });
    });
    return () => { generation++; unsub(); };
  }, []);
  if (state === 'login') return <Redirect href={'/rider/login' as any} />;
  if (state === 'ready') return <>{children}</>;
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
    {state === 'loading' ? <ActivityIndicator /> : <><Text>{state}</Text><TouchableOpacity onPress={() => router.replace('/login')}><Text>Return to sign in</Text></TouchableOpacity></>}
  </View>;
}
