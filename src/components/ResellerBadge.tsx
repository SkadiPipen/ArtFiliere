import { Text } from '@/components/Typography';
import { StyleSheet, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';

export const resellerBadgeNote = 'Seller documents reviewed by ArtFiliere. Resale eligibility is checked separately for each artwork.';

export default function ResellerBadge({ verified }: { verified?: boolean }) {
  if (!verified) return null;
  return <View accessible accessibilityLabel={'Verified Reseller. ' + resellerBadgeNote} style={s.badge}>
    <ShieldCheck size={15} color="#286C58" />
    <Text style={s.text}>Verified Reseller</Text>
  </View>;
}

const s = StyleSheet.create({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EAF5EF', borderColor: '#B5D8C5', borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5, marginVertical: 5 },
  text: { fontSize: 12, fontWeight: '700', color: '#286C58' },
});
