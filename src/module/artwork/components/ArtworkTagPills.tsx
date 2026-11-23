import { Text } from '@/components/Typography';
import { COLORS } from '@/constants/colors';
import { StyleSheet, View } from 'react-native';

export default function ArtworkTagPills({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return <View style={styles.row}>
    {tags.map(tag => <View key={tag} style={styles.pill}>
      <Text style={styles.label}>{tag.replace(/_/g, ' ')}</Text>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: COLORS.roseLight, borderWidth: 1, borderColor: COLORS.red },
  label: { color: COLORS.redDark, fontSize: 12, fontWeight: '700' },
});
