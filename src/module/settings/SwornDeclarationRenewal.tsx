import { Text } from '@/components/Typography';
import CalendarDateField from '@/components/CalendarDateField';
import { COLORS } from '@/constants/colors';
import { purchaseRequest } from '@/services/purchases';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

const endpoint = 'users/sworn-declaration-renewals/';
const remittanceOptions = [
  ['not_exceed_500000', 'Does not exceed ₱500,000'],
  ['exceed_500000', 'Exceeds ₱500,000'],
] as const;
type Document = { name: string; data_uri: string };
type RenewalStatus = {
  taxable_year: number;
  approved_year: number | string | null;
  renewals: { id: number; status: string; review_note: string; details: { taxable_year: number } }[];
};

async function pickDeclaration(): Promise<Document | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const limit = 5 * 1024 * 1024;
  if ((asset.size ?? 0) > limit) throw Error('Choose a document no larger than 5 MB.');
  let dataUri: string;
  if (Platform.OS === 'web') {
    const blob = asset.file ?? await (await fetch(asset.uri)).blob();
    if (blob.size > limit) throw Error('Choose a document no larger than 5 MB.');
    dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(Error('Unable to read the document.'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  } else {
    const fs = await import('expo-file-system/legacy');
    const data = await fs.readAsStringAsync(asset.uri, { encoding: fs.EncodingType.Base64 });
    const mime = asset.mimeType ?? ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[asset.name.split('.').pop()?.toLowerCase() ?? '']);
    if (!mime) throw Error('Choose a PDF, JPEG, PNG, or WebP file.');
    dataUri = `data:${mime};base64,${data}`;
  }
  return { name: asset.name, data_uri: dataUri };
}

export default function SwornDeclarationRenewal() {
  const [record, setRecord] = useState<RenewalStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [document, setDocument] = useState<Document | null>(null);
  const [notarized, setNotarized] = useState('');
  const [received, setReceived] = useState('');
  const [remittance, setRemittance] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    purchaseRequest(endpoint).then(data => { if (active) setRecord(data); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update the declaration.'); }
    finally { setBusy(false); }
  };
  const latest = record?.renewals[0];
  const pending = latest?.status === 'pending';
  const current = record && String(record.approved_year) === String(record.taxable_year);
  const submit = () => run(async () => {
    if (!record || !document || !notarized || !received || !remittance || !confirmed) return;
    const renewal = await purchaseRequest(endpoint, 'POST', { document, details: {
      taxable_year: record.taxable_year, notarized_date: notarized, bir_received_date: received,
      remittance_status: remittance, confirmed,
    } });
    setRecord({ ...record, renewals: [renewal, ...record.renewals] });
    setEditing(false);
    setDocument(null);
  });
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[s.button, disabled && { opacity: .5 }]}>
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={s.section}>
      <Text style={s.heading}>Sworn declaration of gross remittances</Text>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!record && !error && <ActivityIndicator color={COLORS.red} />}
      {record && <>
        <Text style={s.copy}>{current ? `Current declaration on file for ${record.taxable_year}.` : record.approved_year ? `Last approved taxable year: ${record.approved_year}.` : 'No approved taxable year is recorded.'}</Text>
        {current && <Text style={s.copy}>No renewal is due for this taxable year.</Text>}
        {latest && <Text style={s.copy}>Latest renewal: {latest.status}{latest.review_note ? ` · ${latest.review_note}` : ''}</Text>}
        {!current && !pending && !editing && button(`Renew for ${record.taxable_year}`, () => setEditing(true))}
        {pending && <Text style={s.copy}>Your new declaration is awaiting Platform Admin review.</Text>}
        {editing && <>
          <Text style={s.copy}>Upload the notarized, BIR-received declaration for {record.taxable_year}. Include covered remittances across marketplaces and payment providers.</Text>
          {button(document?.name ?? 'Attach declaration (PDF or image)', () => { void run(async () => { const file = await pickDeclaration(); if (file) setDocument(file); }); }, busy)}
          <CalendarDateField label="Notarized date" value={notarized} onChange={setNotarized} maximumDate={new Date()} />
          <CalendarDateField label="BIR received date" value={received} onChange={setReceived} maximumDate={new Date()} />
          <Text style={s.copy}>Remittance status on your declaration</Text>
          <View style={s.options}>
            {remittanceOptions.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: remittance === value }} onPress={() => setRemittance(value)} style={[s.choice, remittance === value && s.selected]}><Text style={s.copy}>{label}</Text></Pressable>)}
          </View>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} onPress={() => setConfirmed(value => !value)} style={s.choice}>
            <Text style={s.copy}>{confirmed ? '☑' : '☐'} I confirm that these details match the uploaded declaration.</Text>
          </Pressable>
          {button(busy ? 'Please wait…' : 'Submit declaration for review', () => { void submit(); }, busy || !document || !notarized || !received || !remittance || !confirmed)}
          {button('Cancel', () => setEditing(false), busy)}
        </>}
      </>}
    </View>
  );
}

const s = StyleSheet.create({
  section: { borderTopWidth: 1, borderColor: COLORS.border, gap: 12, paddingTop: 20 },
  heading: { color: COLORS.textDark, fontSize: 16, fontWeight: '700' },
  copy: { color: COLORS.textDark, fontSize: 13 },
  error: { color: '#B00020', fontSize: 13 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { padding: 10, borderColor: COLORS.border, borderWidth: 1, borderRadius: 8 },
  selected: { backgroundColor: COLORS.roseLight, borderColor: COLORS.red },
  button: { padding: 12, minHeight: 44, borderRadius: 8, backgroundColor: COLORS.redDark, justifyContent: 'center' },
  buttonText: { color: COLORS.white, fontWeight: '700', textAlign: 'center' },
});
