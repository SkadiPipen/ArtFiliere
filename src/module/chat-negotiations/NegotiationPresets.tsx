import { Text } from '@/components/Typography';
import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import InfoAccordion from './InfoAccordion';
import { defaultScope, type LicenseScope } from './LicenseScopeFields';
import type { CompensationCategory, CompensationTerms } from './compensation';
import type { ExclusivityType, LicenseType } from './types';

export type NegotiationPreset = { id: string; title: string; description: string; license: LicenseType; exclusivity: ExclusivityType; scope: LicenseScope; compensation: CompensationCategory; terms: CompensationTerms; licenseFactor: string; exclusivityFactor: string };
const preset = (id: string, title: string, description: string, license: LicenseType, uses: string[], products = '', exclusivity: ExclusivityType = 'non-exclusive', royalty = false): NegotiationPreset => ({
  id, title, description, license, exclusivity,
  scope: { ...defaultScope, uses, products, sublicensing: license === 'commercial' ? 'production_partners' : 'none', copyright_transfer: undefined },
  compensation: royalty ? 'royalty' : 'one_time',
  terms: royalty ? { subtype: 'gross_sales', rate: '5', reporting_frequency: 'monthly', reporting_duration_months: 12 } : { subtype: 'one_time_payment' },
  licenseFactor: license === 'commercial' ? '1.5' : '1', exclusivityFactor: exclusivity === 'exclusive' ? '1.5' : exclusivity === 'sole' ? '1.3' : '1',
});
export const negotiationPresets = [
  preset('personal_private', 'Personal · private display', 'Private, non-commercial enjoyment. No public posting or sublicensing; artist credit required.', 'personal', ['personal_display']),
  preset('personal_social', 'Personal · display and social sharing', 'Personal display and non-commercial social posts with artist credit. No merchandise or advertising.', 'personal', ['personal_display', 'social_media']),
  preset('commercial_marketing', 'Commercial · marketing', 'Non-exclusive advertising and social media use, technical formatting and production partners. Fixed fee.', 'commercial', ['advertising', 'social_media']),
  preset('commercial_exclusive', 'Commercial · exclusive campaign', 'Exclusive advertising and social use within the selected scope. Artist portfolio display remains reserved. Fixed fee.', 'commercial', ['advertising', 'social_media'], '', 'exclusive'),
  preset('merchandise_royalty', 'Commercial · merchandise royalty', 'Non-exclusive merchandise and packaging use. Editable 5% gross-sales starting rate, reported monthly.', 'commercial', ['merchandise', 'packaging'], '', 'non-exclusive', true),
];

export default function NegotiationPresets({ licenses, exclusivities, royaltyEnabled, onApply }: { licenses: LicenseType[]; exclusivities: ExclusivityType[]; royaltyEnabled: boolean; onApply: (preset: NegotiationPreset) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const available = negotiationPresets.filter(item => licenses.includes(item.license) && exclusivities.includes(item.exclusivity));
  const candidate = available.find(item => item.id === selected);
  const blocked = candidate?.compensation === 'royalty' && !royaltyEnabled;
  return <View style={{ gap: 12 }}>
    <Text style={{ fontSize: 18, fontWeight: '700', color: '#382C26' }}>Start with a preset</Text>
    <Text style={{ color: '#81756D', fontSize: 13, lineHeight: 20 }}>Choose a platform starting point, then customize any setting below. These are examples, not legal standards or industry rates.</Text>
    {available.map(item => <InfoAccordion key={item.id} title={item.title} description={item.description} selected={selected === item.id} onSelect={() => { setSelected(item.id); setApplied(false); }} details={`Philippines; 12 months; artist credit required; technical formatting only; no copyright transfer. Pricing uses editable multipliers: license x${item.licenseFactor}, exclusivity x${item.exclusivityFactor}, plus the separate 10% platform fee.${item.license === 'commercial' ? ' Specify the licensed products, media or campaign before sending.' : ''}${item.compensation === 'royalty' ? ' Royalty access approval is required. The checkout fee and future royalties are separate; review both.' : ''}`} />)}
    {!available.length && <Text>No presets match this artwork’s available license choices. Customize the settings below.</Text>}
    {!!candidate && <>
      <Text style={{ color: '#81756D', fontSize: 12, lineHeight: 19 }}>Applying replaces the license, territory, permissions, duration, compensation, pricing method and copyright-transfer settings in this draft. Notes and delivery details are kept. Review the resulting price and terms before sending.</Text>
      {blocked && <Text style={{ color: '#B91C1C', fontSize: 12 }}>Royalty access approval is required to apply this preset.</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={blocked} onPress={() => { onApply(candidate); setApplied(true); }} style={{ padding: 14, borderRadius: 10, backgroundColor: '#B55D4C', opacity: blocked ? 0.5 : 1 }}><Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '700' }}>Apply {candidate.title}</Text></TouchableOpacity>
    </>}
    {applied && <Text accessibilityLiveRegion="polite" style={{ color: '#477452', fontSize: 13 }}>Starting point applied. Review and customize the sections below; changes are not sent until you submit the proposal.</Text>}
  </View>;
}
