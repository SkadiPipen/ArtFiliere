import { Text } from '@/components/Typography';
import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

// Payout routing values, not checkout payment-method codes.
// https://help.xendit.co/hc/en-us/articles/360028007151
// Banks retain the existing SWIFT recipient format; codes are published by each bank.
export const payoutDestinations = {
  WALLET: [
    { value: 'PH_GCASH', label: 'GCash' },
    { value: 'PH_PAYMAYA', label: 'Maya' },
    { value: 'PH_GRABPAY', label: 'GrabPay' },
    { value: 'PH_COINS', label: 'Coins.ph' },
  ],
  SWIFT: [
    { value: 'BOPIPHMM', label: 'BPI' },
    { value: 'BNORPHMM', label: 'BDO Unibank' },
    { value: 'UBPHPHMM', label: 'UnionBank' },
  ],
};

export function payoutDestinationName(value: string) {
  return [...payoutDestinations.WALLET, ...payoutDestinations.SWIFT].find(item => item.value === value || item.value + 'XXX' === value)?.label || value;
}

export default function PayoutDestinationSelect({ type, value, disabled, onChange }: {
  type: string; value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const choices = type === 'SWIFT' ? payoutDestinations.SWIFT : payoutDestinations.WALLET;
  const options = value && !choices.some(item => item.value === value) ? [{ value, label: `${payoutDestinationName(value)} · current destination` }, ...choices] : choices;
  const label = type === 'SWIFT' ? 'Choose your bank' : 'Choose your e-wallet';
  return <View style={{ gap: 6 }}>
    <Text style={s.label}>{type === 'SWIFT' ? 'Bank' : 'E-wallet provider'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(current => !current)} style={[s.field, open && { borderColor: '#A43F48' }]}>
      <Text style={{ color: value ? '#40322E' : '#88746B', flex: 1 }}>{value ? payoutDestinationName(value) : label}</Text>
      <ChevronDown size={18} color="#A43F48" />
    </Pressable>
    {open && <View style={s.menu}><ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>{options.map(item => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: item.value === value, disabled }} disabled={disabled} onPress={() => { onChange(item.value); setOpen(false); }} style={[s.option, item.value === value && { backgroundColor: '#FAECE8' }]}>
      <Text style={{ flex: 1, color: '#633D37', fontWeight: item.value === value ? '700' : '400' }}>{item.label}</Text>
      {item.value === value && <Check size={17} color="#A43F48" />}
    </Pressable>)}</ScrollView></View>}
    <Text style={s.note}>Availability depends on the platform’s Xendit payout configuration.</Text>
  </View>;
}

const s = StyleSheet.create({
  label: { color: '#806E66', fontSize: 12 },
  field: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#DDACA7', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#FFF' },
  menu: { borderWidth: 1, borderColor: '#EDD5CE', borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFF' },
  option: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { color: '#88746B', fontSize: 11, lineHeight: 16 },
});
