import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AgreementPaper from './AgreementPaper';

export type AgreementTerms = {
  terms: string;
  licenseType: string;
  exclusivity: string;
  deliveryType: string;
  compensationType: string;
};

type Props = {
  terms: AgreementTerms;
  editable?: boolean;
  onChange?: (next: AgreementTerms) => void;
};

export const agreementExplanations: Record<string, string> = {
  personal: "Private, non-business use only.",
  commercial: "Business, marketing, product, or income-related use is allowed.",
  non_exclusive: "The artist may license the artwork to others.",
  exclusive: "Only this buyer may use it for the agreed purpose.",
  sole: "Buyer has exclusive use; artist may still show it in a portfolio.",
  digital: "Buyer receives a downloadable file.",
  physical: "A physical item is delivered; agree shipping in chat.",
  one_time: "The winning bid is the complete payment.",
  royalty: "Artist receives an agreed percentage from future sales.",
};

const choices = {
  licenseType: [["personal", "Personal use"], ["commercial", "Commercial use"]],
  exclusivity: [["non_exclusive", "Non-exclusive"], ["exclusive", "Exclusive"], ["sole", "Sole"]],
  deliveryType: [["digital", "Digital"], ["physical", "Physical"]],
  compensationType: [["one_time", "One-time"], ["royalty", "Royalty"]],
} as const;

const labelFor = {
  licenseType: "License",
  exclusivity: "Exclusivity",
  deliveryType: "Delivery",
  compensationType: "Compensation",
} as const;

export default function AgreementDocument({ terms, editable = false, onChange }: Props) {
  const update = (key: keyof AgreementTerms, value: string) => {
    onChange?.({ ...terms, [key]: value });
  };

  if (!editable) {
    const details = (Object.keys(choices) as (keyof typeof choices)[]).map(key => {
      const value = terms[key] || 'not_specified';
      return `${labelFor[key]}: ${value.replace(/_/g, ' ')}${agreementExplanations[value] ? `\n${agreementExplanations[value]}` : ''}`;
    });
    return <AgreementPaper document={[terms.terms, ...details].filter(Boolean).join('\n\n')} />;
  }

  return (
    <View style={styles.document}>
      <Text style={styles.title}>Art License Agreement</Text>
      <Text style={styles.subTitle}>Terms and conditions</Text>

      {editable ? (
        <View style={styles.platformTermsNotice}>
          <Text style={styles.platformTermsTitle}>Platform terms included</Text>
          <Text style={styles.platformTermsCopy}>
            The platform’s standard terms will be attached to this auction. Set the artwork-specific choices below.
          </Text>
        </View>
      ) : (
        <Text selectable style={styles.terms}>{terms.terms}</Text>
      )}

      {(Object.keys(choices) as (keyof typeof choices)[]).map((key) => (
        <View key={key} style={styles.section}>
          <Text style={styles.label}>{labelFor[key]}</Text>
          {editable ? (
            choices[key].map(([value, label]) => (
              <TouchableOpacity
                key={value}
                onPress={() => update(key, value)}
                style={[
                  styles.option,
                  terms[key] === value && styles.optionSelected,
                ]}
              >
                <Text style={terms[key] === value ? styles.selected : styles.normal}>
                  {terms[key] === value ? "✓" : "○"}
                </Text>
                <View style={styles.optionCopy}>
                  <Text style={terms[key] === value && styles.optionLabelSelected}>{label}</Text>
                  <Text style={styles.meaning}>{agreementExplanations[value]}</Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <>
              <Text style={styles.value}>{terms[key].replace(/_/g, " ")}</Text>
              <Text style={styles.meaning}>{agreementExplanations[terms[key]]}</Text>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  document: { backgroundColor: "#FFFDF8", borderRadius: 14, padding: 20, gap: 8 },
  title: { color: "#D75A5D", fontSize: 20, fontWeight: "800", textAlign: "center" },
  subTitle: { color: "#D75A5D", fontWeight: "800", textTransform: "uppercase", textAlign: "center", marginBottom: 8 },
  terms: { color: "#403633", fontSize: 14, lineHeight: 20 },
  platformTermsNotice: { borderRadius: 10, backgroundColor: "#FFF4E8", padding: 12 },
  platformTermsTitle: { color: "#A86542", fontWeight: "800", fontSize: 13 },
  platformTermsCopy: { color: "#766B66", fontSize: 12, lineHeight: 17, marginTop: 3 },
  section: { marginTop: 8 },
  label: { color: "#D75A5D", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  value: { color: "#403633", marginTop: 2, textTransform: "capitalize" },
  meaning: { color: "#766B66", fontSize: 12, lineHeight: 16, marginTop: 2 },
  option: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 9, borderWidth: 1, borderColor: "#E8DCD7", borderRadius: 9, marginTop: 6, backgroundColor: "#FFF" },
  optionSelected: { borderColor: "#D75A5D", backgroundColor: "#FFF0EF" },
  optionCopy: { flex: 1 },
  selected: { color: "#D75A5D", fontWeight: "900", fontSize: 16 },
  normal: { color: "#B6AAA5", fontSize: 16 },
  optionLabelSelected: { color: "#B74C50", fontWeight: "800" },
});
