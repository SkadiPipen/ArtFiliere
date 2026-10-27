import { Text, TextInput } from '@/components/Typography';
import { RequiredMark } from './NegotiationSection';
import { useState } from 'react';
import { View } from 'react-native';
import InfoAccordion from './InfoAccordion';

const options = [
  { title: 'Portfolio display', text: 'Non-commercial display in the artist’s portfolio and personal website.', description: 'Show the work as an example of the artist’s previous work.' },
  { title: 'Social media promotion', text: 'Display on the artist’s own social media solely to promote their artistic services; no merchandise or third-party licensing.', description: 'Post the work to promote the artist’s services, without selling copies or licensing it to others.' },
  { title: 'Exhibitions and competitions', text: 'Non-commercial display in exhibitions and submission to competitions, without granting organizers independent exploitation rights.', description: 'Display or submit the work; organizer permissions must stay within this reservation.' },
  { title: 'Teaching and presentations', text: 'Non-commercial use in the artist’s teaching and presentations; no sale or distribution of standalone artwork files.', description: 'Use the work as an educational example without selling artwork files.' },
];

export default function ArtistReservedUses({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const lines = value.split('\n').filter(line => line.trim() && line.trim().toLowerCase() !== 'none');
  const selected = options.filter(option => lines.includes(option.text));
  const custom = lines.filter(line => !options.some(option => option.text === line)).join('\n');
  const [otherOpen, setOtherOpen] = useState(!!custom);
  const save = (texts: string[], other: string) => onChange([...texts, ...(other ? [other] : [])].join('\n'));
  return <View style={{ gap: 10 }}>
    <Text style={{ fontWeight: '600' }}>Uses reserved to the artist after transfer<RequiredMark /></Text>
    <Text style={{ fontSize: 12, color: '#81756D', lineHeight: 18 }}>Select all uses the artist may keep. These reservations will be written into the assignment and must be accepted by both parties.</Text>
    <InfoAccordion title="No reserved uses" description="The artist keeps no contractual permission to exercise the assigned rights. Authorship, moral rights and statutory exceptions remain protected." multiple selected={value.trim().toLowerCase() === 'none'} onSelect={() => { setOtherOpen(false); onChange(value.trim().toLowerCase() === 'none' ? '' : 'None'); }} />
    {options.map(option => <InfoAccordion key={option.title} title={option.title} description={option.description} details={option.text} multiple selected={selected.includes(option)} onSelect={() => save(selected.includes(option) ? selected.filter(item => item !== option).map(item => item.text) : [...selected.map(item => item.text), option.text], custom)} />)}
    <InfoAccordion title="Other reserved uses" description="Write a custom permission, including any agreed commercial use or limits." multiple selected={otherOpen || !!custom} onSelect={() => { const next = !(otherOpen || !!custom); setOtherOpen(next); if (!next) save(selected.map(item => item.text), ''); else if (value.trim().toLowerCase() === 'none') onChange(''); }} />
    {(otherOpen || !!custom) && <TextInput accessibilityLabel="Other uses reserved to the artist" placeholder="Describe the reserved use and its limits" value={custom} onChangeText={text => save(selected.map(item => item.text), text)} maxLength={1000} multiline style={{ minHeight: 90, textAlignVertical: 'top', borderWidth: 1, borderColor: '#DCD5CF', borderRadius: 10, padding: 12, backgroundColor: '#FFFFFF' }} />}
    {!value.trim() && <Text style={{ color: '#81756D', fontSize: 12 }}>Choose at least one reservation, enter a custom permission, or select No reserved uses.</Text>}
  </View>;
}
