import { Text } from '@/components/Typography';
import { useState, type ReactNode } from 'react';
import { CheckCircle, Circle, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

type Props = {
  embedded?: boolean;
  choice?: ReactNode;
  title: string;
  description: string;
  permitted?: string[];
  restrictions?: string[];
  details?: string;
  selected?: boolean;
  onSelect?: () => void;
  multiple?: boolean;
  disabled?: boolean;
};

export default function InfoAccordion({ title, description, permitted, restrictions, details, embedded = false, choice, selected = false, onSelect, multiple = false, disabled = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  return <View style={[s.container, embedded && s.embedded, selected && s.selected]}>
    <View style={s.choiceRow}>
      {onSelect ? <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onSelect} style={({ pressed }) => [s.select, pressed && s.pressed, disabled && { opacity: 0.5 }]}>
        {selected ? <CheckCircle size={23} color="#E68A50" /> : <Circle size={23} color="#C7C9CE" />}
        <View style={s.choice}><Text style={s.title}>{title}</Text><Text style={s.description}>{description}</Text></View>
      </Pressable> : choice ? <View style={s.choice}>{choice}<Text style={[s.description, { paddingHorizontal: 12, paddingBottom: 12 }]}>{description}</Text></View> : <View style={s.select}><View style={s.choice}><Text style={s.title}>{title}</Text><Text style={s.description}>{description}</Text></View></View>}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${title} details`}
      accessibilityHint={expanded ? 'Collapse the details' : 'Expand to read the details'}
      accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)}
      style={({ pressed }) => [s.header, pressed && s.pressed]}
    >
      {expanded ? <ChevronUp size={20} color="#784738" /> : <ChevronDown size={20} color="#784738" />}
    </Pressable>
    </View>
    {expanded && <View style={s.body}>
      {!!permitted?.length && <>
        <Text style={s.heading}>Permitted uses</Text>
        {permitted.map(value => <Text key={value} style={s.copy}>• {value}</Text>)}
      </>}
      {!!restrictions?.length && <>
        <Text style={s.heading}>Restrictions</Text>
        {restrictions.map(value => <Text key={value} style={s.copy}>• {value}</Text>)}
      </>}
      {!!details && <><Text style={s.heading}>Details to agree on</Text><Text style={s.copy}>{details}</Text></>}
      {!permitted?.length && !restrictions?.length && !details && <Text style={s.copy}>{description}</Text>}
    </View>}
  </View>;
}

const s = StyleSheet.create({
  container: { borderWidth: 1, borderColor: '#E6E0DB', borderRadius: 12, overflow: 'hidden', backgroundColor: '#FAFAFB' },
  embedded: { borderWidth: 1 },
  selected: { borderColor: '#E68A50', backgroundColor: '#FFF7F0' },
  select: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, minHeight: 64 },
  title: { fontSize: 14, fontWeight: '600', color: '#292321' },
  description: { fontSize: 12, lineHeight: 18, color: '#796F69', marginTop: 4 },
  choiceRow: { flexDirection: 'row', alignItems: 'center' },
  choice: { flex: 1 },
  header: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  pressed: { backgroundColor: '#FDF1E8' },
  body: { padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: '#EFE2D8', backgroundColor: '#FFFCF9' },
  heading: { color: '#333', fontSize: 14, fontWeight: '700', marginTop: 4 },
  copy: { color: '#555', fontSize: 14, lineHeight: 22 },
});
