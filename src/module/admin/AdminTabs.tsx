import { Pressable, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/Typography';
import { adminControls, adminType } from './adminDesign';

export default function AdminTabs<T extends string>({ items, value, onChange }: { items: readonly { id: T; label: string; icon?: LucideIcon }[]; value: T; onChange: (value: T) => void }) {
  return <View style={adminControls.tabs}>{items.map(({ id, label, icon: Icon }) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: value === id }} onPress={() => onChange(id)} style={({ pressed }) => [adminControls.tab, value === id && adminControls.tabSelected, pressed && { opacity: 0.8 }]}>{Icon && <Icon size={20} color={value === id ? '#A74646' : '#81756D'} />}<Text style={[adminType.button, { color: value === id ? '#A74646' : '#81756D' }]}>{label}</Text></Pressable>)}</View>;
}
