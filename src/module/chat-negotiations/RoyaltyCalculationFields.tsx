import { Pressable, Text, TextInput, View } from 'react-native';
import type { CompensationTerms } from './compensation';

export default function RoyaltyCalculationFields({ terms, onChange }: { terms: CompensationTerms; onChange: (value: Partial<CompensationTerms>) => void }) {
  const rules = terms.calculation || {};
  const tiered = terms.subtype.includes('tiered');
  const guarantee = ['minimum_guaranteed', 'minimum_guarantee_royalty'].includes(terms.subtype);
  const update = (value: typeof rules) => onChange({ calculation: { ...rules, ...value } });
  const input = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, backgroundColor: '#fff' };
  return <View style={{ gap: 10 }}>
    <Text>Royalty reporting duration (months, 1–60)</Text>
    <TextInput accessibilityLabel="Royalty reporting duration" keyboardType="number-pad" value={String(terms.reporting_duration_months ?? 12)} onChangeText={value => onChange({ reporting_duration_months: Number(value) })} style={input} />
    {(tiered || guarantee) && <>
      <Text style={{ fontWeight: '700' }}>Calculation basis</Text>
      {Object.entries({ units: 'Items sold', gross_sales: 'Gross sales', net_sales: 'Net sales after permitted deductions', profit: 'Profit after deductions and costs' }).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: rules.basis === value }} onPress={() => update({ basis: value })} style={input}><Text>{rules.basis === value ? '● ' : '○ '}{label}</Text></Pressable>)}
    </>}
    {tiered && <>
      <Text>Graduated tiers apply separately to each reporting period. Each rate applies only to the portion in that tier. Start at zero.</Text>
      {(rules.tiers || [{ from: '0', rate: '' }]).map((tier, index, all) => <View key={index} style={{ gap: 8 }}>
        <Text>Tier {index + 1}: starting {rules.basis === 'units' ? 'item count' : 'PHP amount'} and {rules.basis === 'units' ? 'PHP per item' : 'percentage'}</Text>
        <TextInput accessibilityLabel={`Tier ${index + 1} threshold`} value={tier.from} keyboardType="decimal-pad" style={input} onChangeText={from => update({ tiers: all.map((t, i) => i === index ? { ...t, from } : t) })} />
        <TextInput accessibilityLabel={`Tier ${index + 1} rate`} value={tier.rate} keyboardType="decimal-pad" style={input} onChangeText={rate => update({ tiers: all.map((t, i) => i === index ? { ...t, rate } : t) })} />
        {index > 0 && <Pressable onPress={() => update({ tiers: all.filter((_, i) => i !== index) })}><Text>Remove tier</Text></Pressable>}
      </View>)}
      {(rules.tiers?.length || 1) < 10 && <Pressable onPress={() => update({ tiers: [...(rules.tiers || [{ from: '0', rate: '' }]), { from: '', rate: '' }] })}><Text>Add tier</Text></Pressable>}
    </>}
    {guarantee && <>
      <Text>{rules.basis === 'units' ? 'PHP royalty per item sold' : 'Royalty percentage'}</Text>
      <TextInput accessibilityLabel="Guaranteed royalty calculation rate" value={rules.rate || ''} keyboardType="decimal-pad" onChangeText={rate => update({ rate })} style={input} />
      <Text>The guarantee applies to EACH reporting period. Amount due = the greater of the guarantee or calculated royalty; it is not charged twice.</Text>
    </>}
    <Text>Evidence must support every reported figure, including deductions and costs. Zero sales still require a report and evidence. A late report remains overdue.</Text>
  </View>;
}
