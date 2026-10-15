import { StyleSheet, Text, View } from 'react-native';

/** Preserve the agreement wording and paragraph breaks in a readable document. */
export default function AgreementPaper({ document }: { document: string }) {
  return <View style={s.paper}>
    <Text style={s.title}>ART LICENSING AGREEMENT</Text>
    {document.split(/\r?\n\s*\r?\n/).map((paragraph, index) => {
      const title = /^ART LICENS(?:E|ING) AGREEMENT$/i.test(paragraph.trim());
      const heading = title || /^\d+\.\s+[^\n]{1,100}$/.test(paragraph.trim()) || /^[A-Z][A-Z /&() -]{3,}$/.test(paragraph.trim());
      return <Text key={index} selectable accessibilityRole={heading ? 'header' : undefined} style={[s.paragraph, heading && s.heading]}>{title ? 'Art Licensing Agreement' : paragraph}</Text>;
    })}
  </View>;
}
const s = StyleSheet.create({
  paper: { backgroundColor: '#FFFFFF', padding: 28, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  title: { color: '#111111', fontSize: 28, fontWeight: '700', marginBottom: 26, textAlign: 'center' },
  heading: { fontWeight: '700' },
  paragraph: { color: '#171717', fontSize: 16, lineHeight: 29, marginBottom: 28 },
});
