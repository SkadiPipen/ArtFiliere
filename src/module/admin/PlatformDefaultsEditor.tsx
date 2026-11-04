import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import { useAdminRefresh } from './AdminRefresh';
import { adminType as t, adminSurfaces as s } from './adminDesign';
import AdminTabs from './AdminTabs';

type Values = {
  platform_fee_percentage: string; royalty_platform_fee_percentage: string; royalty_platform_fee_basis: string;
  default_artist_royalty_percentage: string; default_exclusivity: string; default_license_duration_months: number;
  license_multipliers: Record<string, string>; exclusivity_multipliers: Record<string, string>;
};
export default function PlatformDefaultsEditor() {
  const [values, setValues] = useState<Values | null>(null);
  const [revision, setRevision] = useState(0);
  const [duration, setDuration] = useState('12');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    setLoading(true);
    try { const { revision, ...data } = await purchaseRequest('users/admin/platform-defaults/'); setValues(data); setRevision(revision); setDuration(String(data.default_license_duration_months)); setError(''); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useAdminRefresh(load);
  useEffect(() => { void load(); }, []);
  const field = (label: string, value: string, change: (value: string) => void, help?: string, unit?: string) => <View key={label} style={styles.field}><Text style={[t.button, { color: '#59453D' }]}>{label}</Text><View style={styles.inputWrap}><TextInput accessibilityLabel={label} value={String(value)} onChangeText={change} keyboardType="decimal-pad" editable={!saving} style={[t.body, styles.input]} />{unit && <Text style={styles.unit}>{unit}</Text>}</View>{help && <Text style={t.muted}>{help}</Text>}</View>;
  const save = async () => {
    if (!values) return;
    setSaving(true); setError(''); setNotice('');
    try { const { revision: savedRevision, ...data } = await purchaseRequest('users/admin/platform-defaults/', 'POST', { revision, values: { ...values, default_license_duration_months: Number(duration) } }); setValues(data); setRevision(savedRevision); setNotice('Platform defaults saved for new agreements and proposals.'); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };
  if (loading) return <ActivityIndicator color="#B65B50" />;
  return <View style={{ gap: 24 }}>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B42318' }}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: '#477452' }}>{notice}</Text>}
    {values && <>
      <View style={[s.card, { gap: 24 }]}><View style={{ gap: 8 }}><Text style={t.sectionTitle}>Platform fees</Text><Text style={t.muted}>Set the platform share for purchases and royalty payments.</Text></View><View style={styles.fields}>
        {field('Artwork & commission fee', values.platform_fee_percentage, value => setValues({ ...values, platform_fee_percentage: value }), 'Added to the artist fee. Delivery is excluded.', '%')}
        {field('Royalty service fee', values.royalty_platform_fee_percentage, value => setValues({ ...values, royalty_platform_fee_percentage: value }), 'Percentage of the artist royalty. Set to 0 to disable.', '%')}
      </View><View style={styles.example}><Text style={[t.button, { color: '#674B40' }]}>Royalty fee example</Text><Text style={t.muted}>At a 2% service fee, a PHP 500 artist royalty adds PHP 10 for the platform. Buyer total: PHP 510. Artist receives: PHP 500.</Text></View></View>
      <View style={s.card}><Text style={t.sectionTitle}>License defaults</Text><Text style={t.muted}>Starting suggestions for new drafts. Buyers and artists can agree on different permitted terms.</Text><Text style={t.cardTitle}>Default exclusivity</Text><AdminTabs items={[{ id: 'non-exclusive', label: 'Non-exclusive' }, { id: 'exclusive', label: 'Exclusive' }, { id: 'sole', label: 'Sole' }]} value={values.default_exclusivity} onChange={value => setValues({ ...values, default_exclusivity: value })} /><View style={styles.fields}>
        {field('Default license duration (months)', duration, setDuration, '1 to 60 whole months.')}
        {field('Suggested artist royalty (%)', values.default_artist_royalty_percentage, value => setValues({ ...values, default_artist_royalty_percentage: value }), 'Commercial-use royalty suggestion; separate from statutory resale royalties.')}
      </View></View>
      <View style={s.card}><Text style={t.sectionTitle}>Pricing multipliers</Text><Text style={t.muted}>Suggested price factors. These change pricing, not the rights granted.</Text><View style={styles.fields}>{Object.entries(values.license_multipliers).map(([key, value]) => field(`${key === 'personal' ? 'Personal' : 'Commercial'} license multiplier`, value, value => setValues({ ...values, license_multipliers: { ...values.license_multipliers, [key]: value } })))}{Object.entries(values.exclusivity_multipliers).map(([key, value]) => field(`${key.charAt(0).toUpperCase() + key.slice(1)} multiplier`, value, value => setValues({ ...values, exclusivity_multipliers: { ...values.exclusivity_multipliers, [key]: value } })))}</View></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 12 }}><Pressable accessibilityRole="button" disabled={saving} onPress={() => void load()} style={[s.button, { backgroundColor: '#F5E8E3' }]}><Text style={[t.button, { color: '#A74646' }]}>Discard changes</Text></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[s.button, { backgroundColor: '#B95353', opacity: saving ? .5 : 1 }]}><Text style={[t.button, { color: '#FFFFFF' }]}>{saving ? 'Saving...' : 'Save platform defaults'}</Text></Pressable></View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 },
  field: { flexGrow: 1, flexBasis: 260, maxWidth: 400, gap: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 12, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12 },
  unit: { ...t.muted, paddingHorizontal: 14, borderLeftWidth: 1, borderColor: '#E5DAD3' },
  example: { borderTopWidth: 1, borderColor: '#EFE3DD', paddingTop: 20, gap: 6 },
});
