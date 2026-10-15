import { useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { auth } from '@/firebase/config';
import { AuthContext } from '@/context/AuthContext';
import API_URL from '@/services/api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';
import RoyaltyInfo from '@/module/auth/sign-up/components/RoyaltyInfo';
import { INITIAL_SIGN_UP_FORM_DATA, SignUpFormData, UpdateSignUpField } from '@/module/auth/sign-up/types';

type Application = { status: string; royalty_enabled: boolean; permit_expires_on?: string; review_note?: string; submitted_at?: string };
export default function RoyaltyApplicationScreen({ onClose, onAccessChange }: { onClose?: () => void; onAccessChange?: (enabled: boolean) => void }) {
  const { user, loading: authLoading } = useContext(AuthContext);
  const [application, setApplication] = useState<Application | null>(null);
  const [form, setForm] = useState<SignUpFormData>({ ...INITIAL_SIGN_UP_FORM_DATA, wantsRoyalty: 'yes' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [permit, setPermit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const updateField: UpdateSignUpField = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  async function request(body?: object, path = '') {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw Error('Please sign in again.');
    const response = await fetch(`${API_URL}/auth/royalty/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return readApiResponse(response);
  }
  async function load() {
    setBusy(true); setError('');
    try { const result = await request(); setApplication(result); onAccessChange?.(result.royalty_enabled); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!authLoading && user) load();
    else if (!authLoading) { setApplication(null); setPermit(null); setSuccess(''); }
  }, [authLoading, user?.uid]);
  async function submit() {
    setBusy(true); setError(''); setSuccess('');
    try {
      if (!form.businessPermitImage) throw Error('Choose an image of your business permit.');
      const day = new Date(`${form.permitExpiresOn}T00:00:00`);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.permitExpiresOn) || !Number.isFinite(day.getTime()) || day < today || `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` !== form.permitExpiresOn) throw Error('Enter an unexpired permit date in YYYY-MM-DD format.');
      const result = await request({ business_permit_image: form.businessPermitImage, permit_expires_on: form.permitExpiresOn });
      setApplication(result); onAccessChange?.(result.royalty_enabled); setPermit(null);
      setSuccess('Business permit submitted successfully. Your application is awaiting admin review.');
      setForm({ ...INITIAL_SIGN_UP_FORM_DATA, wantsRoyalty: 'yes' });
    }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#fffaf5' }}><ScrollView contentContainerStyle={{ padding: 24, gap: 18, width: '100%', maxWidth: 600, alignSelf: 'center' }}>
    <Pressable onPress={() => onClose ? onClose() : router.canGoBack() ? router.back() : router.replace('/(home)/settings')}><Text style={{ color: '#C15656' }}>Back</Text></Pressable>
    <Text style={{ fontSize: 24, fontWeight: '700' }}>Royalty access</Text>
    {authLoading || busy ? <ActivityIndicator /> : !user ? <Pressable onPress={() => router.replace('/login')}><Text>Sign in to manage royalty access</Text></Pressable> : null}
    {!!success && <Text accessibilityRole="alert" style={{ color: '#286647' }}>{success}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#b00020' }}>{error}</Text>}
    {user && !application && !busy && <Pressable onPress={load}><Text style={{ color: '#C15656' }}>Retry loading application</Text></Pressable>}
    {application && <View style={{ gap: 12 }}>
      <Text>Status: {application.status === 'not_applied' ? 'Not applied' : application.status === 'approved' && !application.royalty_enabled ? 'Permit expired — submit a renewed permit' : application.status}</Text>
      {!!application.permit_expires_on && <Text>Permit expiration: {application.permit_expires_on}</Text>}
      {!!application.submitted_at && <Text>Submitted: {new Date(application.submitted_at).toLocaleString()}</Text>}
      {application.status !== 'not_applied' && <Pressable disabled={busy} onPress={async () => {
        if (permit) { setPermit(null); return; }
        setBusy(true); setError('');
        try { setPermit((await request(undefined, 'permit/')).business_permit_image); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}><Text style={{ color: '#C15656', fontWeight: '700', paddingVertical: 10 }}>{permit ? 'Hide submitted business permit' : 'View submitted business permit'}</Text></Pressable>}
      {permit && <Image source={{ uri: permit }} accessibilityLabel="Your submitted business permit" resizeMode="contain" style={{ width: '100%', height: 360 }} />}
      {!!application.review_note && <Text>Admin review: {application.review_note}</Text>}
      {application.status === 'pending' && <Text>Your account is ready to use while the admin reviews your royalty application.</Text>}
      {application.royalty_enabled && <Text>Royalty-Based and Hybrid options are enabled for commercial negotiations.</Text>}
      {application.status !== 'pending' && !application.royalty_enabled && <>
        <RoyaltyInfo formData={form} updateField={updateField} />
        <Pressable disabled={busy || form.wantsRoyalty !== 'yes' || !form.businessPermitImage || !form.permitExpiresOn} onPress={submit} style={{ padding: 14, borderRadius: 8, backgroundColor: '#C15656', opacity: busy || form.wantsRoyalty !== 'yes' || !form.businessPermitImage || !form.permitExpiresOn ? 0.5 : 1 }}><Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>Submit business permit for review</Text></Pressable>
      </>}
      <Pressable disabled={busy} onPress={load}><Text style={{ color: '#C15656' }}>Refresh status</Text></Pressable>
    </View>}
  </ScrollView></SafeAreaView>;
}
