import { Text, TextInput } from '@/components/Typography';
import { Square, SquareCheck } from 'lucide-react-native';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import type { PermitDocument } from './businessPermit';

export default function BusinessPermitFields({ details, setDetails, document, upload, consent, setConsent, busy, purpose }: { details: Record<string, string>; setDetails: (value: Record<string, string>) => void; document: PermitDocument | null; upload: () => void; consent: boolean; setConsent: (value: boolean) => void; busy: boolean; purpose: 'reseller' | 'royalty' }) {
  return <>
        <Text style={s.sectionTitle}>Business permit details</Text>
        <Text style={s.description}>Enter all details exactly as shown on your permit. Dates must use YYYY-MM-DD.</Text>
        <View style={s.grid}>{[
          ['registered_business_name', 'Registered business name'], ['permit_number', 'Permit number'],
          ['issuing_authority', 'Issuing authority'], ['issued_on', 'Issue date'], ['expires_on', 'Expiry date'],
        ].map(([key, label]) => <View key={key} style={s.field}><Text style={s.label}>{label} *</Text><TextInput editable={!busy} accessibilityLabel={label} value={details[key] || ''} onChangeText={value => setDetails({ ...details, [key]: value })} maxLength={key.endsWith('_on') ? 10 : 180} placeholder={key.endsWith('_on') ? 'YYYY-MM-DD' : label} style={s.input} /></View>)}</View>
        <Text style={s.sectionTitle}>Upload business permit</Text>
        <TouchableOpacity disabled={busy} style={s.upload} onPress={() => upload()}><Text style={s.label}>Business permit *</Text><Text style={s.link}>{document?.name || 'Choose PDF or image / up to 5 MB'}</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(!consent)} style={s.notice}>
          {consent ? <SquareCheck size={23} color="#C15656" /> : <Square size={23} color="#C15656" />}<Text style={{ flex: 1, color: '#69534A', lineHeight: 24 }}>I confirm this permit belongs to my business and these details are accurate. {purpose === 'reseller' ? 'Seller approval does not grant authorship or permission to resell every artwork.' : 'Royalty approval enables eligible payment options; each artwork remains subject to its agreed license terms.'}</Text>
        </TouchableOpacity>
        <Text style={s.note}>Documents are private and available only to you and authorized reviewers. They are not stored on the blockchain.</Text>
  </>;
}

const s = StyleSheet.create({
  sectionTitle: { fontSize: 22, fontFamily: 'LoraSemiBold', color: '#49372F' },
  description: { color: '#786862', fontSize: 16, lineHeight: 24 },
  label: { fontSize: 16, fontWeight: '600', color: '#695047' },
  note: { color: '#786862', fontSize: 14, lineHeight: 21 },
  link: { color: '#A74646', fontSize: 15, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  field: { flexGrow: 1, flexBasis: 300, gap: 10 },
  input: { borderWidth: 1, borderColor: '#E8D8D0', borderRadius: 14, padding: 16, fontSize: 16, backgroundColor: '#FFF' },
  upload: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#D9B5A9', borderRadius: 14, padding: 22, gap: 10, backgroundColor: '#FCF9F6' },
  notice: { backgroundColor: '#F5E8E3', borderRadius: 14, padding: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
});
