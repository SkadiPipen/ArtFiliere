import BusinessPermitFields from '@/components/BusinessPermitFields';
import { pickDocument, type PermitDocument } from '@/components/businessPermit';
import PrivateDocumentPreview from '@/components/PrivateDocumentPreview';
import { ArrowLeft, Percent, RefreshCw } from 'lucide-react-native';
import { goBackOr } from '@/services/navigation';
import { Text } from '@/components/Typography';
import { useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { auth } from '@/firebase/config';
import { AuthContext } from '@/context/AuthContext';
import API_URL from '@/services/api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';

type Application = { source?: 'reseller'; status: string; royalty_enabled: boolean; permit_expires_on?: string; review_note?: string; submitted_at?: string };
export default function RoyaltyApplicationScreen({ onClose, onAccessChange }: { onClose?: () => void; onAccessChange?: (enabled: boolean) => void }) {
  const { user, loading: authLoading } = useContext(AuthContext);
  const [application, setApplication] = useState<Application | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [document, setDocument] = useState<PermitDocument | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [permit, setPermit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function upload() {
    setBusy(true); setError('');
    try { const value = await pickDocument(); if (value) setDocument(value); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
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
      if (!document || !consent || ['registered_business_name', 'permit_number', 'issuing_authority', 'issued_on', 'expires_on'].some(key => !details[key]?.trim())) throw Error('Complete the permit details, upload your business permit, and confirm the declaration.');
      const result = await request({ business_permit: document, permit_details: details, consent });
      setApplication(result); onAccessChange?.(result.royalty_enabled); setPermit(null);
      setSuccess('Business permit submitted successfully. Your application is awaiting admin review.');
      setDetails({}); setDocument(null); setConsent(false);
    }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF7F3' }}>
    <View style={s.header}><Pressable accessibilityLabel="Back" onPress={() => onClose ? onClose() : goBackOr('/(home)/settings')}><ArrowLeft size={24} color="#69534A" /></Pressable><Percent size={28} color="#C15656" /><Text style={s.headerTitle}>Royalty access</Text><Pressable accessibilityLabel="Refresh royalty status" disabled={busy || authLoading || !user} onPress={load} style={{ marginLeft: 'auto' }}><RefreshCw size={23} color="#C15656" /></Pressable></View>
    <ScrollView contentContainerStyle={s.page}>
    <Text style={s.title}>Royalty payment application</Text>
    <Text style={s.description}>Apply to use royalty-based and hybrid payment options for eligible commercial licenses.</Text>
    <View style={s.notice}><Text style={s.description}>Approved resellers can also use royalty payment options while their business permit is valid. Royalty approval alone does not grant reseller access; you must apply separately to become a reseller.</Text></View>
    {authLoading || busy ? <ActivityIndicator /> : !user ? <Pressable onPress={() => router.replace('/login')}><Text>Sign in to manage royalty access</Text></Pressable> : null}
    {!!success && <Text accessibilityRole="alert" style={{ color: '#286647' }}>{success}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#b00020' }}>{error}</Text>}
    {user && !application && !busy && <Pressable onPress={load}><Text style={{ color: '#C15656' }}>Retry loading application</Text></Pressable>}
    {application && <View style={s.card}>
      <Text>Status: {application.status === 'not_applied' ? 'Not applied' : application.status === 'approved' && !application.royalty_enabled ? 'Permit expired — submit a renewed permit' : application.status}</Text>
      {!!application.permit_expires_on && <Text>Permit expiration: {application.permit_expires_on}</Text>}
      {!!application.submitted_at && <Text>Submitted: {new Date(application.submitted_at).toLocaleString()}</Text>}
      {application.source === 'reseller' && <Pressable onPress={() => router.push('/reseller-verification')}><Text style={{ color: '#C15656' }}>View reseller permit and verification</Text></Pressable>}
      {application.source !== 'reseller' && application.status !== 'not_applied' && <Pressable disabled={busy} onPress={async () => {
        if (permit) { setPermit(null); return; }
        setBusy(true); setError('');
        try { setPermit((await request(undefined, 'permit/')).business_permit_image); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}><Text style={{ color: '#C15656', fontWeight: '700', paddingVertical: 10 }}>{permit ? 'Hide submitted business permit' : 'View submitted business permit'}</Text></Pressable>}
      {permit && <View style={{ height: 360 }}><PrivateDocumentPreview uri={permit} mime={permit.slice(5, permit.indexOf(';'))} label="Your submitted business permit" /></View>}
      {!!application.review_note && <Text>Admin review: {application.review_note}</Text>}
      {application.status === 'pending' && <Text>Your account is ready to use while the admin reviews your royalty application.</Text>}
      {application.royalty_enabled && <Text>Royalty-Based and Hybrid options are enabled for commercial negotiations.</Text>}
      {application.status !== 'pending' && !application.royalty_enabled && <>
        <BusinessPermitFields details={details} setDetails={setDetails} document={document} upload={upload} consent={consent} setConsent={setConsent} busy={busy} purpose="royalty" />
        <Pressable disabled={busy || !document || !consent || ['registered_business_name', 'permit_number', 'issuing_authority', 'issued_on', 'expires_on'].some(key => !details[key]?.trim())} onPress={submit} style={{ alignSelf: 'flex-end', paddingHorizontal: 26, paddingVertical: 16, borderRadius: 14, backgroundColor: '#C15656', opacity: busy || !document || !consent || ['registered_business_name', 'permit_number', 'issuing_authority', 'issued_on', 'expires_on'].some(key => !details[key]?.trim()) ? 0.5 : 1 }}><Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>Submit business permit for review</Text></Pressable>
      </>}
    </View>}
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  header: { minHeight: 76, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', gap: 16, alignItems: 'center', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E8D8D0' },
  headerTitle: { fontSize: 24, fontFamily: 'LoraSemiBold', color: '#C15656', flexShrink: 1 },
  page: { padding: 20, gap: 20, width: '100%', maxWidth: 1140, alignSelf: 'center', paddingBottom: 60 },
  title: { fontSize: 30, fontFamily: 'LoraSemiBold', color: '#382D29' },
  description: { fontSize: 16, lineHeight: 24, color: '#786862' },
  notice: { padding: 20, borderRadius: 14, backgroundColor: '#F5E8E3' },
  card: { padding: 24, gap: 18, borderWidth: 1, borderColor: '#E8D8D0', borderRadius: 18, backgroundColor: '#FFF' },
});
