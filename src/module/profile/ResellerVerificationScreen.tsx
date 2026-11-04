import BusinessPermitFields from '@/components/BusinessPermitFields';
import { ArrowLeft, Store, RefreshCw } from 'lucide-react-native';
import { goBackOr } from '@/services/navigation';
import { Text } from '@/components/Typography';
import ResellerBadge, { resellerBadgeNote } from '@/components/ResellerBadge';
import { purchaseRequest } from '@/services/purchases';
import { pickDocument, type PermitDocument } from '@/components/businessPermit';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function ResellerVerificationScreen() {
  const [record, setRecord] = useState<any>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [bir, setBir] = useState<PermitDocument | null>(null);
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
  const upload = async (setter: (value: PermitDocument | null) => void) => {
    setBusy(true); setError('');
    try { const document = await pickDocument(); if (document) setter(document); }
    catch (failure: any) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (busy) return;
    if (!bir || !consent || ['registered_business_name', 'permit_number', 'issuing_authority', 'issued_on', 'expires_on'].some(key => !details[key]?.trim())) {
      setError('Complete the permit details, upload your business permit, and confirm the declaration.'); return;
    }
    setBusy(true); setError('');
    try {
      const item = await purchaseRequest('reseller/application/', 'POST', { permit_details: details, business_permit: bir, consent });
      setRecord({ verified: false, application: item }); setBir(null); setDetails({}); setConsent(false);
    } catch (failure: any) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const status = record?.application?.status;
  const expired = !!record?.application?.permit_expires_on && new Date(record.application.permit_expires_on + 'T23:59:59+08:00') < new Date();
  const eligibleToApply = !loading && !!record && (!['pending', 'approved'].includes(status) || (status === 'approved' && expired));
  return <View style={{ flex: 1, backgroundColor: '#FAF7F3' }}>
    <View style={s.header}><TouchableOpacity accessibilityLabel="Back to profile" onPress={() => goBackOr('/(home)/profile')}><ArrowLeft size={24} color="#69534A" /></TouchableOpacity><Store size={28} color="#C15656" /><Text style={s.headerTitle}>Become a reseller</Text><TouchableOpacity accessibilityLabel="Refresh application status" disabled={busy || loading} onPress={load} style={{ marginLeft: 'auto' }}><RefreshCw size={23} color="#C15656" /></TouchableOpacity></View>
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.title}>Reseller application</Text>
      <Text style={s.description}>Submit your business permit for review. You can apply before your first purchase; your account stays a buyer account.</Text>
      <View style={s.notice}><Text style={s.description}>Once approved as a reseller, you can also use royalty payment options while your business permit is valid. Each artwork must allow the selected license and payment terms.</Text></View>
    <View style={s.card}>
      <ResellerBadge verified={record?.verified} />
      {!!record?.verified && <Text>{resellerBadgeNote}</Text>}
      {loading && <ActivityIndicator color="#C15656" />}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!!status && <Text style={s.label}>Application: {expired ? 'Permit expired - submit a renewed permit' : status}</Text>}
      {status === 'pending' && <Text>Your application is awaiting document review. You do not need to purchase anything while waiting.</Text>}
      {status === 'approved' && !expired && <Text>Go to an eligible purchase to resell. If you have none yet, no further action is needed.</Text>}
      {!!record?.application?.permit_expires_on && <Text style={s.description}>Permit expires: {record.application.permit_expires_on}</Text>}
      {!!record?.application?.review_note && <Text>Review note: {record.application.review_note}</Text>}
      {eligibleToApply && <>
        <BusinessPermitFields details={details} setDetails={setDetails} document={bir} upload={() => upload(setBir)} consent={consent} setConsent={setConsent} busy={busy} purpose="reseller" />
        <TouchableOpacity disabled={busy} style={s.button} onPress={submit}><Text style={s.white}>{busy ? 'Submitting...' : 'Submit for review'}</Text></TouchableOpacity>
      </>}
    </View>
  </ScrollView></View>;
}

const s = StyleSheet.create({
  header: { minHeight: 76, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', gap: 16, alignItems: 'center', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E8D8D0' },
  headerTitle: { fontSize: 24, fontFamily: 'LoraSemiBold', color: '#C15656', flexShrink: 1 },
  page: { padding: 20, gap: 20, width: '100%', maxWidth: 1140, alignSelf: 'center', paddingBottom: 60 },
  card: { padding: 24, gap: 18, borderRadius: 18, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8D8D0' },
  title: { fontSize: 30, fontFamily: 'LoraSemiBold', color: '#382D29' },
  sectionTitle: { fontSize: 22, fontFamily: 'LoraSemiBold', color: '#49372F' },
  description: { color: '#786862', fontSize: 16, lineHeight: 24 },
  label: { fontSize: 16, fontWeight: '600', color: '#695047' },
  note: { color: '#786862', fontSize: 14, lineHeight: 21 },
  link: { color: '#A74646', fontSize: 15, fontWeight: '600' },
  error: { color: '#B00020' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  field: { flexGrow: 1, flexBasis: 300, gap: 10 },
  input: { borderWidth: 1, borderColor: '#E8D8D0', borderRadius: 14, padding: 16, fontSize: 16, backgroundColor: '#FFF' },
  upload: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#D9B5A9', borderRadius: 14, padding: 22, gap: 10, backgroundColor: '#FCF9F6' },
  notice: { backgroundColor: '#F5E8E3', borderRadius: 14, padding: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  button: { padding: 16, paddingHorizontal: 26, borderRadius: 14, backgroundColor: '#C15656', alignSelf: 'flex-end', alignItems: 'center' },
  white: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
