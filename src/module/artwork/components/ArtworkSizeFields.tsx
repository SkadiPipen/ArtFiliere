import { Text, TextInput } from '@/components/Typography';
import { StyleSheet, View } from 'react-native';

type Props = {
  digital: boolean;
  medium: string;
  dimensions: string;
  onMediumChange: (value: string) => void;
  onDimensionsChange: (value: string) => void;
};

export default function ArtworkSizeFields({ digital, medium, dimensions, onMediumChange, onDimensionsChange }: Props) {
  return <View style={styles.fields}>
    {!digital && <View style={styles.field}>
      <Text style={styles.label}>Medium *</Text>
      <TextInput accessibilityLabel="Artwork medium" value={medium} onChangeText={onMediumChange} maxLength={120}
        placeholder="e.g. Acrylic on canvas" placeholderTextColor="#9B8E88" style={styles.input} />
    </View>}
    <View style={styles.field}>
      <Text style={styles.label}>Dimensions *</Text>
      <TextInput accessibilityLabel="Artwork dimensions" value={dimensions} onChangeText={onDimensionsChange} maxLength={120}
        placeholder={digital ? 'e.g. 2000 × 3000 px' : 'e.g. 30 × 40 cm'} placeholderTextColor="#9B8E88" style={styles.input} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  fields: { gap: 12 },
  field: { gap: 6 },
  label: { color: '#674B40', fontSize: 14, fontWeight: '600' },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E4D3CB', backgroundColor: '#FFF', color: '#3A2D2A' },
});
