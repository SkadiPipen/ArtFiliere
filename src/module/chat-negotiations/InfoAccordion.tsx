import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  embedded?: boolean;
  choice?: ReactNode;
  title: string;
  description: string;
  permitted?: string[];
  restrictions?: string[];
  details?: string;
};

export default function InfoAccordion({ title, description, permitted, restrictions, details, embedded = false, choice }: Props) {
  const [expanded, setExpanded] = useState(false);
  return <View style={[s.container, embedded && s.embedded]}>
    <View style={s.choiceRow}>
      {choice ? <View style={s.choice}>{choice}</View> : <Text style={[s.choice, { padding: 12, fontWeight: '700' }]}>{title}</Text>}
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
      <Text style={s.heading}>Description</Text>
      <Text style={s.copy}>{description}</Text>
      {!!permitted?.length && <>
        <Text style={s.heading}>Permitted uses</Text>
        {permitted.map(value => <Text key={value} style={s.copy}>• {value}</Text>)}
      </>}
      {!!restrictions?.length && <>
        <Text style={s.heading}>Restrictions</Text>
        {restrictions.map(value => <Text key={value} style={s.copy}>• {value}</Text>)}
      </>}
      {!!details && <><Text style={s.heading}>Details to agree on</Text><Text style={s.copy}>{details}</Text></>}
    </View>}
  </View>;
}

const s = StyleSheet.create({
  container: { borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFDFB' },
  embedded: { borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent' },
  choiceRow: { flexDirection: 'row', alignItems: 'center' },
  choice: { flex: 1 },
  header: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  pressed: { backgroundColor: '#FDF1E8' },
  body: { padding: 14, paddingTop: 0, gap: 8 },
  heading: { color: '#333', fontSize: 14, fontWeight: '700', marginTop: 4 },
  copy: { color: '#555', fontSize: 14, lineHeight: 22 },
});
