import { Text } from '@/components/Typography';
import { StyleSheet, TouchableOpacity } from 'react-native';
export function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.45 }]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FAF7F3' }, content: { padding: 22, paddingBottom: 70, width: '100%', maxWidth: 1000, alignSelf: 'center', gap: 16 },
  title: { fontSize: 26, fontFamily: 'LoraSemiBold', color: '#3A2D2A', fontWeight: '600' }, heading: { fontSize: 18, fontFamily: 'LoraSemiBold', color: '#5A3D37', fontWeight: '600' }, text: { color: '#786862', fontSize: 13, lineHeight: 21 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#EFE1DC', borderRadius: 14, padding: 18, gap: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  input: { padding: 12, borderWidth: 1, borderColor: '#CDBDB2', borderRadius: 8, backgroundColor: '#fff', minHeight: 44, color: '#322B29' },
  button: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 9, backgroundColor: '#F5E8E3', borderWidth: 1, borderColor: '#DAB5AA' }, buttonText: { color: '#A84B46', fontSize: 13, fontWeight: '600' },
  error: { color: '#AF1535', paddingVertical: 8 }, success: { color: '#326141' }, photo: { width: '100%', height: 240 },
});
