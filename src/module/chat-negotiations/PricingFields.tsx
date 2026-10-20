import { RequiredMark } from './NegotiationSection';
import { Text, TextInput, View } from 'react-native';
import InfoAccordion from './InfoAccordion';

export default function PricingFields({ mode, onMode, license, exclusivity, fixed, onLicense, onExclusivity, onFixed, base, subtotal, fee, total, error }: {
  mode: 'multipliers' | 'fixed'; onMode: (mode: 'multipliers' | 'fixed') => void;
  license: string; exclusivity: string; fixed: string; onLicense: (value: string) => void; onExclusivity: (value: string) => void; onFixed: (value: string) => void;
  base: number; subtotal: number; fee: number; total: number; error?: string;
}) {
  const input = { borderWidth: 1, borderColor: '#DCD5CF', borderRadius: 10, padding: 13, backgroundColor: '#FFFFFF' };
  const money = (value: number) => Number.isFinite(value) ? `PHP ${value.toFixed(2)}` : 'Enter valid pricing';
  return <View style={{ gap: 12 }}>
    <Text style={{ fontSize: 18, fontWeight: '700', color: '#382C26' }}>Negotiated pricing</Text>
    <Text style={{ fontSize: 13, lineHeight: 20, color: '#81756D' }}>Choose a calculation method. Either party can propose changes; the other party must accept. Royalties are agreed separately.</Text>
    <InfoAccordion title="Calculate using multipliers" description="Adjust the license and exclusivity factors applied to the artwork’s base price." details="Starting values are suggestions, not legal rates. The total cannot fall below the artwork base price. A multiplier changes the price, not the rights granted. Values must be greater than zero and no more than 100, with up to two decimals." selected={mode === 'multipliers'} onSelect={() => onMode('multipliers')} />
    <InfoAccordion title="Enter an agreed fixed fee" description="Propose a license fee directly, without applying multipliers." details="The checkout total must be at least the artwork base price. The platform fee is shown separately. Switching methods uses only the active method to calculate the proposal." selected={mode === 'fixed'} onSelect={() => onMode('fixed')} />
    {mode === 'multipliers' ? <>
      <Text>Artwork base price: {money(base)}</Text>
      <Text>License multiplier<RequiredMark /></Text><TextInput accessibilityLabel="License multiplier" value={license} onChangeText={onLicense} keyboardType="decimal-pad" style={input} />
      <Text style={{ color: '#81756D', fontSize: 12 }}>After license multiplier: {money(Math.round((base * Number(license) + Number.EPSILON) * 100) / 100)}</Text>
      <Text>Exclusivity multiplier<RequiredMark /></Text><TextInput accessibilityLabel="Exclusivity multiplier" value={exclusivity} onChangeText={onExclusivity} keyboardType="decimal-pad" style={input} />
      <Text style={{ color: '#81756D', fontSize: 12 }}>After both multipliers: {money(subtotal)}</Text>
    </> : <><Text>Agreed license fee (PHP, before platform fee and delivery)<RequiredMark /></Text><TextInput accessibilityLabel="Agreed fixed license fee" value={fixed} onChangeText={onFixed} keyboardType="decimal-pad" style={input} /></>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text>}
    <View style={{ padding: 14, borderRadius: 12, gap: 8, backgroundColor: '#FFF7F0' }}>
      <Text>Minimum checkout before delivery: {money(Math.round((base + Number.EPSILON) * 100) / 100)}</Text>
      <Text>License fee: {money(subtotal)}</Text>
      <Text>Platform fee (10%, not negotiable): {money(fee)}</Text>
      <Text style={{ fontWeight: '700' }}>Checkout before delivery: {money(total)}</Text>
    </View>
  </View>;
}
