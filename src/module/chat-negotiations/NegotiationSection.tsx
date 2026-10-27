import { Text } from '@/components/Typography';
import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { CheckCircle, ChevronDown, ChevronUp } from 'lucide-react-native';

export const NegotiationSectionsContext = createContext<{
  collapsed: Record<string, boolean>; toggle: (id: string) => void;
  positions: (id: string, y: number) => void; errors: Record<string, string>;
  completed: Record<string, boolean>;
}>({ collapsed: {}, toggle: () => {}, positions: () => {}, errors: {}, completed: {} });

export function RequiredMark() { return <Text style={{ color: '#C62828' }}> *</Text>; }
export default function NegotiationSection({ id, title, required = false, children }: { id: string; title: string; required?: boolean; children: ReactNode }) {
  const context = useContext(NegotiationSectionsContext);
  const closed = context.collapsed[id] ?? true;
  const error = context.errors[id];
  return <View onLayout={event => context.positions(id, event.nativeEvent.layout.y)} style={{ marginBottom: 16, borderWidth: error ? 2 : 1, borderColor: error ? '#C62828' : '#EAE2DA', borderRadius: 16, backgroundColor: error ? '#FFF7F7' : '#FFFFFF', overflow: 'hidden' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${closed ? 'Expand' : 'Collapse'} ${title}`} accessibilityState={{ expanded: !closed }} onPress={() => context.toggle(id)} style={{ padding: 18, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: '#382C26' }}>{title}{required && <RequiredMark />}</Text>
      {required && context.completed[id] && <CheckCircle size={19} color="#477452" />}
      {closed ? <ChevronDown size={20} color="#A56840" /> : <ChevronUp size={20} color="#A56840" />}
    </Pressable>
    {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: '#B91C1C', paddingHorizontal: 18, paddingBottom: 12 }}>{error}</Text>}
    <View style={{ display: closed ? 'none' : 'flex', paddingHorizontal: 18, paddingBottom: 18, gap: 10 }}>{children}</View>
  </View>;
}
