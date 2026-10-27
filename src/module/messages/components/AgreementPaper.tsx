import { Text } from '@/components/Typography';
import { StyleSheet, View } from 'react-native';

/** Preserve the agreement wording and paragraph breaks in a readable document. */
export default function AgreementPaper({ document }: { document: string }) {
  return <View style={s.paper}>
    {document.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((paragraph, index) => {
      const title = /^ART LICENS(?:E|ING)(?: AND COPYRIGHT ASSIGNMENT)? AGREEMENT$/i.test(paragraph);
      const heading = title || /^\d+\.\s+[^\n]{1,100}$/.test(paragraph) || paragraph === 'Moral rights and authority' || /^[A-Z][A-Z /&() -]{3,}$/.test(paragraph);
      return <Text key={index} selectable accessibilityRole={heading ? 'header' : undefined} style={[s.paragraph, heading && s.heading, title && s.title]}>{paragraph}</Text>;
    })}
  </View>;
}
const s = StyleSheet.create({
  paper: { backgroundColor: '#FFFFFF', padding: 28, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  title: { color: '#111111', fontSize: 28, fontWeight: '700', marginBottom: 26, textAlign: 'center' },
  heading: { fontWeight: '700', textAlign: 'left', marginTop: 16, marginBottom: 14 },
  paragraph: { color: '#171717', fontSize: 16, lineHeight: 29, marginBottom: 16, textAlign: 'justify' },
});
