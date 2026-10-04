import { StyleSheet, Text, View } from 'react-native';

/** Preserve the agreement wording and paragraph breaks in a readable document. */
export default function AgreementPaper({ document }: { document: string }) {
  return <View style={s.paper}>
    <Text style={s.title}>Art Licensing Agreement</Text>
    {document.split(/\r?\n\s*\r?\n/).map((paragraph, index) => <Text key={index} selectable style={s.paragraph}>{paragraph}</Text>)}
  </View>;
}
const s = StyleSheet.create({
  paper: { backgroundColor: '#FFFFFF', padding: 28, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  title: { color: '#111111', fontSize: 28, fontWeight: '700', marginBottom: 26 },
  paragraph: { color: '#171717', fontSize: 16, lineHeight: 29, marginBottom: 28 },
});
