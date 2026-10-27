import { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react-native';
import { Text, TextInput } from '@/components/Typography';
import { ARTWORK_CATEGORIES, MAX_ARTWORK_CATEGORIES, CATEGORY_SOURCE, categoryLabel } from '@/services/artworkCategories';

export default function CategoryPicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [search, setSearch] = useState('');
  const [explain, setExplain] = useState(false);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(key => key !== id) : [...value, id]);
  return <View style={{ gap: 10 }}>
    <Text style={{ fontWeight: '700', fontSize: 16, color: '#382C26' }}>Artwork categories <Text style={{ color: '#B91C1C' }}>*</Text></Text>
    <Text style={{ color: '#75655F', fontSize: 13, lineHeight: 19 }}>Choose 1–{MAX_ARTWORK_CATEGORIES} work types. Your first choice is primary; add others only when they also describe this artwork. Digital/Physical and descriptive tags are separate.</Text>
    <Text style={{ color: '#A24F41', fontWeight: '700' }}>{value.length}/{MAX_ARTWORK_CATEGORIES} selected</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {value.map((id, index) => <View key={id} style={{ borderWidth: 1, borderColor: '#C15656', borderRadius: 12, padding: 9, backgroundColor: '#FFF1EC', gap: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${categoryLabel(id)}`} onPress={() => toggle(id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Text style={{ color: '#A24F41', fontWeight: '700' }}>{categoryLabel(id)}{index === 0 ? ' · Primary' : ''}</Text><X size={14} color="#A24F41" />
        </Pressable>
        {index > 0 && <Pressable accessibilityRole="button" onPress={() => onChange([id, ...value.filter(key => key !== id)])}><Text style={{ fontSize: 11, color: '#A24F41' }}>Make primary</Text></Pressable>}
      </View>)}
    </View>
    <TextInput accessibilityLabel="Search artwork categories" value={search} onChangeText={setSearch} placeholder="Search categories, e.g. painting or collage" style={{ borderWidth: 1, borderColor: '#DCCBC0', padding: 12, borderRadius: 10 }} />
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 300, borderWidth: 1, borderColor: '#EADDD4', borderRadius: 12 }}>
      {ARTWORK_CATEGORIES.filter(category => [category.label, category.description, ...category.aliases].join(' ').toLowerCase().includes(search.trim().toLowerCase())).map(category => {
        const selected = value.includes(category.id);
        const disabled = !selected && value.length >= MAX_ARTWORK_CATEGORIES;
        return <Pressable key={category.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => toggle(category.id)}
          style={{ padding: 12, borderWidth: 1, borderColor: selected ? '#C15656' : 'transparent', backgroundColor: selected ? '#FFF7F1' : '#FFF', opacity: disabled ? 0.45 : 1, flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 21, height: 21, borderWidth: 1.5, borderColor: selected ? '#C15656' : '#BCA89A', borderRadius: 6, justifyContent: 'center', alignItems: 'center' }}>{selected && <Check size={16} color="#C15656" />}</View>
          <View style={{ flex: 1, gap: 3 }}><Text style={{ fontWeight: '700', color: '#382C26' }}>{category.label}</Text><Text style={{ color: '#75655F', fontSize: 12, lineHeight: 17 }}>{category.description}</Text></View>
        </Pressable>;
      })}
    </ScrollView>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: explain }} onPress={() => setExplain(!explain)} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Text style={{ color: '#A24F41', fontWeight: '700' }}>Why these categories and a limit of five?</Text>{explain ? <ChevronUp size={16} color="#A24F41" /> : <ChevronDown size={16} color="#A24F41" />}</Pressable>
    {explain && <View style={{ gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#FAF4EE' }}><Text style={{ fontSize: 12, lineHeight: 18 }}>This is a curated marketplace list informed by Getty's art vocabulary, not a complete list of every art form. Getty's CONA guidelines allow multiple work types and say most individual records have 1–5. Five is ArtFiliere's limit to keep classification focused; Getty does not require this exact cap. Use tags for subjects, styles and materials.</Text><Pressable accessibilityRole="link" onPress={() => Linking.openURL(CATEGORY_SOURCE)}><Text style={{ color: '#A24F41', textDecorationLine: 'underline' }}>Read Getty's work-type guidance</Text></Pressable></View>}
  </View>;
}
