import { goBackOr } from '@/services/navigation';
import { Text, TextInput } from '@/components/Typography';
import ResellerBadge, { resellerBadgeNote } from '@/components/ResellerBadge';
import { purchaseRequest } from '@/services/purchases';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

type Document = { name: string; data_uri: string };

async function pickDocument(): Promise<Document | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = result.assets[0];
  if ((file.size || 0) > 5 * 1024 * 1024) throw Error('Choose a document up to 5 MB.');
  let data: string;
  if (Platform.OS === 'web') {
    const blob = file.file || await (await fetch(file.uri)).blob();
    data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error('Could not read this document.'));
      reader.readAsDataURL(blob);
    });
  } else {
    const files = await import('expo-file-system/legacy');
    const content = await files.readAsStringAsync(file.uri, { encoding: files.EncodingType.Base64 });
    data = 'data:' + (file.mimeType || 'application/pdf') + ';base64,' + content;
  }
  return { name: file.name, data_uri: data };
}

export default function ResellerVerificationScreen() {
  const [record, setRecord] = useState<any>(null);
  const [tin, setTin] = useState('');
  const [bir, setBir] = useState<Document | null>(null);
  const [sworn, setSworn] = useState<Document | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setRecord(await purchaseRequest('reseller/application/')); }
    catch (failure: any) { setError(failure.message); }
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { void load(); }, []));
  const upload = async (setter: (value: Document | null) => void) => {
    setBusy(true); setError('');
    try { const document = await pickDocument(); if (document) setter(document); }
    catch (failure: any) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (busy) return;
    if (!bir || !consent || ![9, 12].includes(tin.replace(/[ -]/g, '').length)) {
      setError('Enter your TIN, upload your BIR certificate, and confirm the declaration.'); return;
    }
    setBusy(true); setError('');
    try {
      const item = await purchaseRequest('reseller/application/', 'POST', { tin_number: tin, bir_certificate: bir, sworn_declaration: sworn, consent });
      setRecord({ verified: false, application: item }); setBir(null); setSworn(null); setTin(''); setConsent(false);
    } catch (failure: any) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const status = record?.application?.status;
  const eligibleToApply = !!record && !['pending', 'approved'].includes(status);
  return <ScrollView contentContainerStyle={s.page}>
    <TouchableOpacity onPress={() => goBackOr('/(home)/profile')}><Text style={s.link}>← Back</Text></TouchableOpacity>
    <View style={s.card}>
      <Text style={s.title}>Reseller verification</Text>
      <Text>Prepare your seller documents now—even before your first purchase. Your account stays a buyer account; no artist portfolio or hourly rate is needed.</Text>
      <Text style={s.note}>Approval verifies seller documents only. Every resale must still be allowed by the agreement and your transferable rights.</Text>
      <ResellerBadge verified={record?.verified} />
      {!!record?.verified && <Text>{resellerBadgeNote}</Text>}
      {loading && <ActivityIndicator color="#C15656" />}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!!status && <Text style={s.label}>Application: {status}</Text>}
      {status === 'pending' && <Text>Your application is awaiting document review. You do not need to purchase anything while waiting.</Text>}
      {status === 'approved' && <Text>Go to an eligible purchase to resell. If you have none yet, no further action is needed.</Text>}
      {!!record?.application?.review_note && <Text>Review note: {record.application.review_note}</Text>}
      <TouchableOpacity disabled={busy || loading} onPress={load}><Text style={s.link}>Refresh application status</Text></TouchableOpacity>
      {eligibleToApply && <>
        <Text style={s.label}>{status ? 'Submit a new application' : 'Apply in advance'}</Text>
        <Text style={s.label}>TIN (9 digits, with optional 3-digit branch code)</Text>
        <TextInput accessibilityLabel="Tax identification number" value={tin} onChangeText={setTin} maxLength={16} keyboardType="number-pad" style={s.input} />
        <TouchableOpacity disabled={busy} style={s.upload} onPress={() => upload(setBir)}><Text>BIR Certificate of Registration (Form 2303) *</Text><Text style={s.link}>{bir?.name || 'Choose PDF or image · up to 5 MB'}</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} style={s.upload} onPress={() => upload(setSworn)}><Text>Sworn declaration, if applicable (optional)</Text><Text style={s.link}>{sworn?.name || 'Choose PDF or image · up to 5 MB'}</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(value => !value)} style={s.upload}>
          <Text>{consent ? '☑' : '☐'} I confirm these documents are mine. I understand seller approval does not grant authorship or permission to resell every artwork.</Text>
        </TouchableOpacity>
        <Text style={s.note}>Documents are private and available only to you and authorized reviewers. They are not stored on the blockchain.</Text>
        <TouchableOpacity disabled={busy} style={s.button} onPress={submit}><Text style={s.white}>{busy ? 'Please wait…' : 'Submit for review'}</Text></TouchableOpacity>
      </>}
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { padding: 22, gap: 18, width: '100%', maxWidth: 850, alignSelf: 'center', paddingBottom: 100 },
  card: { padding: 22, gap: 15, borderRadius: 14, backgroundColor: '#FFFDF6', borderWidth: 1, borderColor: '#E8DCD4' },
  title: { fontSize: 24, fontWeight: '700', color: '#C15656' },
  label: { fontWeight: '700', color: '#58433C' },
  note: { color: '#76665F', fontSize: 13, lineHeight: 19 },
  link: { color: '#A74646', fontWeight: '700' },
  error: { color: '#B00020' },
  input: { borderWidth: 1, borderColor: '#D8C9C0', borderRadius: 8, padding: 12, backgroundColor: '#FFF' },
  upload: { borderWidth: 1, borderColor: '#D8C9C0', borderRadius: 8, padding: 14, gap: 8 },
  button: { padding: 14, borderRadius: 8, backgroundColor: '#C15656', alignItems: 'center' },
  white: { color: '#FFF', fontWeight: '700' },
});
