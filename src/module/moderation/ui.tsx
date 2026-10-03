import { StyleSheet, Text, TouchableOpacity } from 'react-native';
export function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.45 }]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFDF8' }, content: { padding: 22, paddingBottom: 70, width: '100%', maxWidth: 1000, alignSelf: 'center', gap: 16 },
  title: { fontSize: 24, color: '#603C36', fontWeight: '700' }, heading: { fontSize: 17, color: '#603C36', fontWeight: '700' }, text: { color: '#5E514B', lineHeight: 22 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3D7D0', borderRadius: 12, padding: 16, gap: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  input: { padding: 12, borderWidth: 1, borderColor: '#CDBDB2', borderRadius: 8, backgroundColor: '#fff', minHeight: 44, color: '#322B29' },
  button: { padding: 12, borderRadius: 8, backgroundColor: '#F4E3DA', borderWidth: 1, borderColor: '#DFC1B2' }, buttonText: { color: '#82443D', fontWeight: '600' },
  error: { color: '#AF1535', paddingVertical: 8 }, success: { color: '#326141' }, photo: { width: '100%', height: 240 },
});
