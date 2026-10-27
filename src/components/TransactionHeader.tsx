import { Text } from '@/components/Typography';
import { ArrowLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

export default function TransactionHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={s.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Back from ${title}`} onPress={onBack} style={s.back}><ArrowLeft size={24} color="#000000" /></Pressable>
    <Text style={s.title}>{title}</Text>
  </View>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  title: { flex: 1, fontSize: 26, fontWeight: '700', color: '#302624' },
});
