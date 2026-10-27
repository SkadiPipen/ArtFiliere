import { Text, TextInput } from '@/components/Typography';
import { RequiredMark } from './NegotiationSection';
import RoyaltyCalculationFields from './RoyaltyCalculationFields';
import { Modal, Pressable, View } from 'react-native';
import { useState } from 'react';
import RoyaltyApplicationScreen from '@/module/royalties/RoyaltyApplicationScreen';
import InfoAccordion from './InfoAccordion';

export type CompensationCategory = 'one_time' | 'royalty' | 'hybrid';
export type PaymentEntry = { name: string; amount: string; due_date: string; acceptance: string };
export const scheduledTypes = ['milestone_payments', 'installment_payments', 'per_deliverable_fee'];
const emptyEntry = (): PaymentEntry => ({ name: '', amount: '', due_date: '', acceptance: '' });
export type CompensationTerms = { calculation?: { basis?: string; rate?: string; tiers?: { from: string; rate: string }[] }; reporting_duration_months?: number; entries?: PaymentEntry[]; subtype: string; rate?: string; minimum_guarantee?: string; details?: string; reporting_frequency?: string };
type Option = { id: string; label: string; description: string; rate?: 'unit' | 'percent'; guarantee?: boolean; details?: string };
export const compensationOptions: Record<CompensationCategory, Option[]> = {
  one_time: [
    { id: 'one_time_payment', label: 'One-Time Payment', description: 'One fixed amount for the agreed commercial license.' },
    { id: 'milestone_payments', label: 'Milestone Payments', description: 'A fixed total split across agreed milestones.', details: 'List each milestone, amount or percentage, and payment due date.' },
    { id: 'installment_payments', label: 'Installment Payments', description: 'A fixed license fee paid on an agreed schedule.', details: 'List installment amounts and due dates; the amounts must add up to the fixed total.' },
    { id: 'per_deliverable_fee', label: 'Per-Deliverable Fee', description: 'Fixed amounts assigned to specific artwork, files, or deliverables.', details: 'List each deliverable, its fee, and when payment is due.' },
  ],
  royalty: [
    { id: 'per_unit', label: 'Per-Unit Royalty', description: 'A fixed amount for each licensed item sold.', rate: 'unit' },
    { id: 'gross_sales', label: 'Gross Sales Royalty', description: 'A percentage of gross sales from licensed products.', rate: 'percent' },
    { id: 'net_sales', label: 'Net Sales Royalty', description: 'A percentage after contractually permitted deductions.', rate: 'percent', details: 'Define net sales and all permitted deductions.' },
    { id: 'profit_based', label: 'Profit-Based Royalty', description: 'A percentage of specifically defined profit.', rate: 'percent', details: 'Define profit and which costs may be deducted.' },
    { id: 'tiered', label: 'Tiered Royalty', description: 'Rates change when agreed sales thresholds are reached.', details: 'Specify the sales basis, each threshold, rate, and how tiers are calculated.' },
    { id: 'minimum_guaranteed', label: 'Minimum Guaranteed Royalty', description: 'A guaranteed minimum regardless of actual sales.', guarantee: true, details: 'The guarantee applies each reporting period. Pay the greater of the minimum or calculated royalty, never both added together.' },
  ],
  hybrid: [
    { id: 'upfront_per_unit', label: 'Upfront Fee + Per-Unit Royalty', description: 'An upfront fee plus an amount for every licensed item sold.', rate: 'unit' },
    { id: 'upfront_gross_sales', label: 'Upfront Fee + Gross Sales Royalty', description: 'An upfront fee plus a percentage of gross sales.', rate: 'percent' },
    { id: 'upfront_net_sales', label: 'Upfront Fee + Net Sales Royalty', description: 'An upfront fee plus a percentage of net sales.', rate: 'percent', details: 'Define net sales and permitted deductions.' },
    { id: 'upfront_profit_based', label: 'Upfront Fee + Profit-Based Royalty', description: 'An upfront fee plus a percentage of defined profit.', rate: 'percent', details: 'Define profit and all permitted costs.' },
    { id: 'upfront_tiered', label: 'Upfront Fee + Tiered Royalty', description: 'An upfront fee plus rates that change at agreed thresholds.', details: 'Specify the sales basis, thresholds, rates, and tier calculation.' },
    { id: 'minimum_guarantee_royalty', label: 'Minimum Guarantee + Royalty', description: 'Each period pays the greater of the guaranteed minimum or calculated royalty.', guarantee: true, details: 'Agree the calculation rate and minimum per period. The guarantee offsets the royalty; it is not an extra charge.' },
  ],
};
export function defaultCompensation(subtype: string): CompensationTerms {
  const perUnit = subtype.includes('per_unit');
  return { subtype, reporting_frequency: 'monthly', reporting_duration_months: 12,
    ...(scheduledTypes.includes(subtype) ? { entries: [emptyEntry()] } : {}),
    ...(!subtype.includes('tiered') && !subtype.includes('guarantee') && !subtype.includes('guaranteed') ? { rate: perUnit ? '1' : '5' } : {}),
    ...(subtype.includes('tiered') ? { calculation: { basis: 'gross_sales', tiers: [{ from: '0', rate: '5' }] } } : {}),
    ...(subtype.includes('guarantee') ? { calculation: { basis: 'gross_sales', rate: '5' } } : {}),
  };
}
export const categoryLabels: Record<CompensationCategory, string> = { one_time: 'Flat-Fee', royalty: 'Royalty-Based', hybrid: 'Hybrid' };
export const frequencies = { monthly: 'Monthly', quarterly: 'Quarterly', semi_annually: 'Semi-Annually', annually: 'Annually' };

export function compensationError(category: CompensationCategory, terms: CompensationTerms, expectedTotal?: number): string | null {
  const option = compensationOptions[category].find(value => value.id === terms.subtype);
  if (!option) return 'Choose a commercial compensation option.';
  if (option.rate && (!terms.rate || !/^\d+(\.\d{1,2})?$/.test(terms.rate) || Number(terms.rate) <= 0 || Number(terms.rate) > (option.rate === 'percent' ? 100 : 9999999999.99))) return 'Enter a positive royalty rate with up to two decimal places. Percentages cannot exceed 100%.';
  if (option.guarantee && (!terms.minimum_guarantee || !/^\d+(\.\d{1,2})?$/.test(terms.minimum_guarantee) || Number(terms.minimum_guarantee) <= 0 || Number(terms.minimum_guarantee) > 9999999999.99)) return 'Enter a positive minimum guaranteed amount with up to two decimal places.';
  if (scheduledTypes.includes(terms.subtype)) {
    if (!terms.entries?.length || terms.entries.length > 20) return 'Add between 1 and 20 payment entries.';
    for (const [index, entry] of terms.entries.entries()) {
      if (!entry.name.trim()) return `Enter a name for payment ${index + 1}.`;
      if (!/^\d+(\.\d{1,2})?$/.test(entry.amount) || Number(entry.amount) <= 0 || Number(entry.amount) > 9999999999.99) return `Enter a positive amount with up to two decimals for payment ${index + 1}.`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.due_date) || !Number.isFinite(Date.parse(entry.due_date)) || new Date(entry.due_date).toISOString().slice(0, 10) !== entry.due_date) return `Enter a valid due date (YYYY-MM-DD) for payment ${index + 1}.`;
      if (terms.subtype !== 'installment_payments' && !entry.acceptance.trim()) return `Define completion and acceptance for payment ${index + 1}.`;
    }
    const cents = terms.entries.reduce((sum, entry) => sum + Math.round(Number(entry.amount) * 100), 0);
    if (expectedTotal !== undefined && cents !== Math.round(expectedTotal * 100)) return 'Payment amounts must add up to the proposed artwork price, excluding delivery.';
  }
  if (option.details && !scheduledTypes.includes(terms.subtype) && !terms.details?.trim()) return option.details;
  if (category !== 'one_time' && !(terms.reporting_frequency && terms.reporting_frequency in frequencies)) return 'Choose a royalty reporting and payment frequency.';
  if (category !== 'one_time') {
    const duration = terms.reporting_duration_months ?? 12;
    if (!Number.isInteger(duration) || duration < 1 || duration > 60) return 'Reporting duration must be 1 to 60 months.';
    const rules = terms.calculation;
    if (terms.subtype.includes('tiered') || option.guarantee) {
      if (!rules?.basis || !['units', 'gross_sales', 'net_sales', 'profit'].includes(rules.basis)) return 'Choose a royalty calculation basis.';
      const validRate = (value?: string) => !!value && /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= (rules.basis === 'units' ? 9999999999.99 : 100);
      if (option.guarantee && !validRate(rules.rate)) return 'Enter a valid guaranteed royalty calculation rate.';
      if (terms.subtype.includes('tiered')) {
        if (!rules.tiers?.length || rules.tiers.length > 10) return 'Add 1 to 10 graduated royalty tiers.';
        for (const [index, tier] of rules.tiers.entries()) {
          const threshold = Number(tier.from);
          if (!/^\d+(\.\d{1,2})?$/.test(tier.from) || !Number.isFinite(threshold) || threshold < 0 || threshold > 9999999999.99 || (index === 0 && threshold !== 0) || (index > 0 && threshold <= Number(rules.tiers[index - 1].from)) || (rules.basis === 'units' && !Number.isInteger(threshold)) || !validRate(tier.rate)) return 'Tiers must start at zero with increasing thresholds and valid positive rates.';
        }
      }
    }
  }
  return null;
}

export function CompensationSettings({ enabled, category, terms, onChange, onAccessChange, expectedTotal, commissionMode = false, allowApplication = true }: { allowApplication?: boolean; commissionMode?: boolean; onAccessChange?: (enabled: boolean) => void; expectedTotal?: number; enabled: boolean; category: CompensationCategory; terms: CompensationTerms; onChange: (category: CompensationCategory, terms: CompensationTerms) => void }) {
  const [applicationOpen, setApplicationOpen] = useState(false);
  const option = compensationOptions[category].find(value => value.id === terms.subtype)!;
  const update = (values: Partial<CompensationTerms>) => onChange(category, { ...terms, ...values });
  const entries = terms.entries || [emptyEntry()];
  const editEntry = (index: number, values: Partial<PaymentEntry>) => update({ entries: entries.map((entry, i) => i === index ? { ...entry, ...values } : entry) });
  const inputStyle = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, backgroundColor: '#fff' };
  return <View style={{ gap: 12 }}>
    <Modal visible={applicationOpen} animationType="slide" onRequestClose={() => setApplicationOpen(false)}>
      {applicationOpen && <RoyaltyApplicationScreen onClose={() => setApplicationOpen(false)} onAccessChange={onAccessChange} />}
    </Modal>
    <Text style={{ fontSize: 18, fontWeight: '700' }}>Commercial compensation</Text>
    <Text style={{ color: '#81756D', fontSize: 13, lineHeight: 20 }}>Choose how the artist is paid, then set the amounts and schedule below.</Text>
    <View style={{ gap: 8 }}>{(Object.keys(categoryLabels) as CompensationCategory[]).filter(value => !commissionMode || value !== 'royalty').map(value => <InfoAccordion key={value} title={commissionMode ? value === 'one_time' ? 'One-time commission fee' : 'Upfront fee + commercial royalties' : categoryLabels[value]} description={value === 'one_time' ? 'A fixed fee, paid once or through an agreed schedule.' : value === 'royalty' ? 'Recurring payments based on reported units, sales or profit.' : 'An upfront fee with royalties, or a minimum guarantee per period.'} details={value === 'one_time' ? 'No recurring sales royalty. License scope and duration still apply.' : 'Reports need evidence and artist approval. Automatic collection requires separate payer authorization.'} selected={category === value} disabled={value !== 'one_time' && !enabled} onSelect={() => value !== category && onChange(value, defaultCompensation(value === 'one_time' ? 'one_time_payment' : value === 'royalty' ? 'gross_sales' : 'upfront_gross_sales'))} />)}</View>
    {!enabled && <Text style={{ color: '#666' }}>Royalty-Based and Hybrid require admin approval of your unexpired business permit.</Text>}
    {!enabled && allowApplication && <Pressable accessibilityRole="button" onPress={() => setApplicationOpen(true)}><Text style={{ color: '#C15656' }}>View royalty application / submit a permit</Text></Pressable>}
    {compensationOptions[category].filter(value => !commissionMode || value.id === 'one_time_payment' || value.id.startsWith('upfront_')).map(value => <View key={value.id}>
      <InfoAccordion embedded title={value.label} description={value.description} details={value.details} selected={value.id === terms.subtype} onSelect={() => value.id !== terms.subtype && onChange(category, { ...defaultCompensation(value.id), reporting_duration_months: terms.reporting_duration_months || 12, reporting_frequency: terms.reporting_frequency || 'monthly' })} />
    </View>)}
    {category !== 'one_time' && <InfoAccordion title="Editable royalty starting values" description="5% is an example starting point for percentage royalties, and PHP 1 for per-item royalties. Both are editable and negotiable. These are not legal minimums, statutory resale rates, or industry benchmarks. Existing negotiated values are preserved when reopening a proposal." />}
    {option?.rate && <><Text>{option.rate === 'unit' ? 'Royalty amount per unit (PHP)' : 'Royalty percentage (%)'}<RequiredMark /></Text><TextInput accessibilityLabel="Royalty rate" value={terms.rate || ''} onChangeText={rate => update({ rate })} keyboardType="decimal-pad" placeholder={option.rate === 'unit' ? '0.50' : '3'} style={inputStyle} /></>}
    {option?.guarantee && <><Text>Minimum guaranteed royalty (PHP)<RequiredMark /></Text><TextInput accessibilityLabel="Minimum guaranteed royalty" value={terms.minimum_guarantee || ''} onChangeText={minimum_guarantee => update({ minimum_guarantee })} keyboardType="decimal-pad" style={inputStyle} /></>}
    {scheduledTypes.includes(terms.subtype) && <View style={{ gap: 12 }}>
      <Text style={{ fontWeight: '700' }}>{option.label} schedule</Text>
      {entries.map((entry, index) => <View key={index} style={{ borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 8, padding: 12, gap: 8 }}>
        <Text style={{ fontWeight: '600' }}>{terms.subtype === 'milestone_payments' ? 'Milestone' : terms.subtype === 'per_deliverable_fee' ? 'Deliverable' : 'Installment'} {index + 1}</Text>
        <Text>{terms.subtype === 'installment_payments' ? 'Payment name' : terms.subtype === 'milestone_payments' ? 'Milestone / work to complete' : 'Deliverable / file or artwork'}</Text>
        <TextInput accessibilityLabel={`Payment ${index + 1} name`} value={entry.name} onChangeText={name => editEntry(index, { name })} maxLength={200} style={inputStyle} />
        <Text>Amount (PHP)<RequiredMark /></Text><TextInput accessibilityLabel={`Payment ${index + 1} amount`} value={entry.amount} onChangeText={amount => editEntry(index, { amount })} keyboardType="decimal-pad" style={inputStyle} />
        <Text>Payment due date (YYYY-MM-DD)<RequiredMark /></Text><TextInput accessibilityLabel={`Payment ${index + 1} due date`} value={entry.due_date} onChangeText={due_date => editEntry(index, { due_date })} placeholder="2026-12-31" maxLength={10} style={inputStyle} />
        {terms.subtype !== 'installment_payments' && <><Text>Completion and acceptance requirements<RequiredMark /></Text><TextInput accessibilityLabel={`Payment ${index + 1} acceptance requirements`} value={entry.acceptance} onChangeText={acceptance => editEntry(index, { acceptance })} multiline maxLength={500} style={inputStyle} /></>}
        {entries.length > 1 && <Pressable onPress={() => update({ entries: entries.filter((_, i) => i !== index) })}><Text style={{ color: '#C15656' }}>Remove payment</Text></Pressable>}
      </View>)}
      {entries.length < 20 && <Pressable onPress={() => update({ entries: [...entries, emptyEntry()] })}><Text style={{ color: '#C15656' }}>+ Add {terms.subtype === 'milestone_payments' ? 'milestone' : terms.subtype === 'per_deliverable_fee' ? 'deliverable' : 'installment'}</Text></Pressable>}
      <Text>Schedule total: PHP {entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0).toFixed(2)}{expectedTotal !== undefined ? ` / Proposed artwork price: PHP ${expectedTotal.toFixed(2)} (excluding delivery)` : ''}</Text>
      {!!terms.details && <Text>Previous schedule notes: {terms.details}</Text>}
    </View>}
    {option?.details && !scheduledTypes.includes(terms.subtype) && <><Text>{option.details}<RequiredMark /></Text><TextInput accessibilityLabel="Compensation calculation and payment details" multiline maxLength={3000} value={terms.details || ''} onChangeText={details => update({ details })} style={[inputStyle, { minHeight: 100 }]} /></>}
    {category !== 'one_time' && <RoyaltyCalculationFields terms={terms} onChange={update} />}
    {category !== 'one_time' && <><Text style={{ fontWeight: '700' }}>Royalty Reporting &amp; Payment</Text><View style={{ gap: 8 }}>{Object.entries(frequencies).map(([value, label]) => <InfoAccordion key={value} title={label} description={`Report this period's figures ${value === 'monthly' ? 'every month' : value === 'quarterly' ? 'every three months' : value === 'semi_annually' ? 'every six months' : 'every twelve months'}. Reports are due seven days after the period ends; payment is due seven days later. Admin verification releases held funds.`} selected={terms.reporting_frequency === value} onSelect={() => update({ reporting_frequency: value })} />)}</View></>}
    <Text style={{ color: '#666' }}>The artwork checkout is separate. {commissionMode ? 'Commission royalty periods start after final delivery approval; production milestones do not collect royalties.' : 'Royalty periods start on the later signing date.'} Submit evidence within seven days after each period ends, then pay by seven days after the report deadline. A platform administrator verifies the report before releasing held funds to the artist wallet. Scheduled flat-fee payments remain contractual obligations.</Text>
    {category === 'hybrid' && terms.subtype.startsWith('upfront_') && <Text>The proposed artwork price below is the upfront fee; royalties apply in addition.</Text>}
  </View>;
}
