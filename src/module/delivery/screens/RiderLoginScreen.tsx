import { useState } from 'react';
import { TextInput } from 'react-native';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { auth } from '@/firebase/config';
import { fetchRiderProfile } from '@/services/deliveryApi';
import { Portal, Action, s } from '../components/Portal';
export default function RiderLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <Portal title="Rider Sign In" error={error}>
    <TextInput style={s.input} accessibilityLabel="Email" placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
    <TextInput style={s.input} accessibilityLabel="Password" placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
    <Action disabled={busy} title="Sign in" onPress={async () => { setBusy(true); setError(''); try { await signInWithEmailAndPassword(auth, email.trim(), password); await fetchRiderProfile(); router.replace('/rider/(tabs)' as any); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} />
    <Action title="Back to app sign in" onPress={() => router.replace('/login')} />
  </Portal>;
}
