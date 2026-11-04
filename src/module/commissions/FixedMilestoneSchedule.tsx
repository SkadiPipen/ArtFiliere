import { Text } from '@/components/Typography';
import { StyleSheet, View } from 'react-native';

export const COMMISSION_MILESTONE_PERCENTAGES = [30, 30, 40] as const;
const labels = ['Sketch / Draft', 'WIP / Rendering', 'Final delivery'];

export default function FixedMilestoneSchedule({ deliveryType }: { deliveryType?: string }) {
  const physical = String(deliveryType).toLowerCase() === 'physical';
  return <View style={s.panel}>
    <Text style={s.heading}>Stage payment schedule and Rules</Text>
    {COMMISSION_MILESTONE_PERCENTAGES.map((percentage, index) => <View key={index} style={s.row}>
      <Text style={s.label}>Stage {index + 1} · {labels[index]}</Text><Text style={s.percentage}>{percentage}%</Text>
    </View>)}
    <Text style={s.rule}>Platform policy ·</Text>
    <Text style={s.rule}>• The buyer funds the full agreed total after both parties sign. Work starts after payment verification.</Text>
    <Text style={s.rule}>• Percentages apply to the artist net production fee, excluding platform fees and shipping. The agreement includes the exact peso amounts; any rounding remainder is allocated to Stage 3.</Text>
    <Text style={s.rule}>• Each stage requires buyer approval before release. Payout confirmation is tracked separately.</Text>
    <Text style={s.rule}>• One consolidated revision request is allowed per stage.</Text>
    <Text style={s.rule}>{physical ? '• Final approval requires receipt and inspection of the physical artwork. Shipping is separately allocated with Stage 3.' : '• The buyer reviews the final preview before approval. The original digital file unlocks after final approval.'}</Text>
  </View>;
}

const s = StyleSheet.create({
  panel: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E6C9BD', borderRadius: 12, padding: 16, gap: 10 },
  heading: { color: '#A6453E', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F0E4DD' },
  label: { flex: 1, color: '#55423B', fontSize: 13 }, percentage: { color: '#A6453E', fontSize: 16, fontWeight: '800' },
  rule: { color: '#806E66', fontSize: 12, lineHeight: 19 },
});
