import { RequiredMark } from './NegotiationSection';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Check, Search, X } from 'lucide-react-native';
import { countries } from './countries';

export default function CountrySelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const selected = value.split(';').map(name => name.trim()).filter(Boolean);
  const needle = query.trim().toLowerCase();
  const matches = countries.filter(country => country.name.toLowerCase().includes(needle) || country.code.toLowerCase() === needle);
  const toggle = (name: string) => {
    const next = selected.includes(name) ? selected.filter(item => item !== name) : [...selected, name];
    if (next.join('; ').length > 500) return;
    onChange(next.join('; '));
  };
  return <View style={{ gap: 10, paddingTop: 8 }}>
    <Text style={{ fontWeight: '600', color: '#382C26' }}>Countries / regions<RequiredMark /></Text>
    <Text style={{ fontSize: 12, lineHeight: 18, color: '#81756D' }}>Philippines is a starting selection. Search to add countries, or remove any selection below.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{selected.map(name => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Remove ${name}`} onPress={() => toggle(name)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 20, borderWidth: 1, borderColor: '#E68A50', backgroundColor: '#FFF7F0' }}><Text style={{ color: '#70482F', flexShrink: 1 }}>{name}</Text><X size={15} color="#A56840" /></Pressable>)}</View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: focused ? '#E68A50' : '#DCD5CF', borderRadius: 10, paddingHorizontal: 12 }}><Search size={18} color="#81756D" /><TextInput accessibilityLabel="Search countries or regions" placeholder="Search countries, e.g. Philippines or Japan" value={query} onChangeText={setQuery} onFocus={() => setFocused(true)} style={{ flex: 1, minWidth: 0, paddingVertical: 14, color: '#382C26' }} /><Pressable accessibilityRole="button" accessibilityLabel={query ? 'Clear country search' : 'Close country list'} onPress={() => { setQuery(''); setFocused(false); }} style={{ padding: 8 }}><X size={16} color="#81756D" /></Pressable></View>
    {(focused || !!query) && <View style={{ borderWidth: 1, borderColor: '#EAE2DA', borderRadius: 10, overflow: 'hidden' }}>
      <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator accessibilityLabel="Matching countries and regions">
      {matches.map(country => <Pressable key={country.code} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(country.name) }} onPress={() => { toggle(country.name); setQuery(''); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46, padding: 12, backgroundColor: selected.includes(country.name) ? '#FFF7F0' : '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F2ECE6' }}><Text style={{ color: '#382C26', flex: 1 }}>{country.name}</Text>{selected.includes(country.name) && <Check size={18} color="#E68A50" />}</Pressable>)}
      {!matches.length && <Text style={{ padding: 12, color: '#81756D' }}>No matching countries. Try a country name or two-letter code.</Text>}
      </ScrollView>
    </View>}
    {!selected.length && <Text accessibilityRole="alert" style={{ color: '#B91C1C', fontSize: 12 }}>Select at least one country or region.</Text>}
  </View>;
}
