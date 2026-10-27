import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from '@/components/Typography';

type Props = {
  sections: string[][]; completed: Record<string, boolean>; errors: Record<string, string>;
  attempted: boolean; desktop: boolean; onSelect: (id: string) => void;
  onCollapseAll: () => void; onExpandAll: () => void;
};
export default function FloatingProgressTracker({ sections, completed, errors, attempted, desktop, onSelect, onCollapseAll, onExpandAll }: Props) {
  const [expanded, setExpanded] = useState(false);
  const open = desktop || expanded;
  const count = sections.filter(([id]) => completed[id]).length;
  return <View style={{ borderRadius: 16, padding: 12, gap: 10, backgroundColor: '#FFFCFA', borderWidth: 1, borderColor: '#E4D4CA', shadowColor: '#382C26', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 8, maxWidth: 300 }}>
    <Pressable disabled={desktop} accessibilityRole={desktop ? undefined : "button"} accessibilityState={{ expanded: open }} onPress={() => setExpanded(!expanded)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ fontWeight: '700', color: '#A24F41', flex: 1 }}>Proposal progress · {count}/{sections.length}</Text>
      {!desktop && (open ? <ChevronDown size={17} color="#A24F41" /> : <ChevronUp size={17} color="#A24F41" />)}
    </Pressable>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: sections.length, now: count }} style={{ height: 6, backgroundColor: '#EAE2DA', borderRadius: 4, overflow: 'hidden' }}><View style={{ height: 6, width: `${Math.round(count / Math.max(1, sections.length) * 100)}%`, backgroundColor: '#C15656' }} /></View>
    {open && <>
      <Text style={{ fontSize: 11, color: '#75655F', lineHeight: 16 }}>Draft readiness, not the other party's acceptance. Select a section to open it.</Text>
      <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
        {sections.map(([id, label]) => <Pressable key={id} accessibilityRole="button" onPress={() => { onSelect(id); if (!desktop) setExpanded(false); }} style={{ flexDirection: 'row', gap: 7, alignItems: 'center', padding: 10, borderRadius: 9, marginBottom: 5, backgroundColor: attempted && errors[id] ? '#FDE8E8' : completed[id] ? '#EAF5ED' : '#F3F0ED' }}>
          {completed[id] && <Check size={14} color="#477452" />}<Text style={{ fontSize: 12, color: attempted && errors[id] ? '#B91C1C' : '#655B53', flex: 1 }}>{label}</Text>
        </Pressable>)}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 16 }}><Pressable accessibilityRole="button" onPress={onCollapseAll}><Text style={{ color: '#A33F45', fontSize: 12 }}>Collapse all</Text></Pressable><Pressable accessibilityRole="button" onPress={onExpandAll}><Text style={{ color: '#A33F45', fontSize: 12 }}>Expand all</Text></Pressable></View>
    </>}
  </View>;
}
