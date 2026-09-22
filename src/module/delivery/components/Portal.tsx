import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

export function Portal({ title, error, children }: { title: string; error?: string; children: ReactNode }) {
  return <ScrollView contentContainerStyle={s.page}><Text style={s.title}>{title}</Text>{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{children}</ScrollView>;
}
export function Action({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[s.button, disabled && { opacity: 0.5 }]}><Text style={s.white}>{title}</Text></TouchableOpacity>;
}
export const s = StyleSheet.create({
  page: { padding: 24, paddingTop: 50, gap: 16, maxWidth: 800, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#BC5454' },
  card: { backgroundColor: '#FFFDF6', borderColor: '#FADBD8', borderWidth: 1, padding: 18, borderRadius: 12, gap: 12 },
  button: { backgroundColor: '#BC5454', padding: 14, borderRadius: 8, alignItems: 'center' },
  white: { color: '#fff', fontWeight: '700' }, error: { color: '#b00020' },
  input: { padding: 12, borderColor: '#bbb', borderWidth: 1, borderRadius: 8 },
});
