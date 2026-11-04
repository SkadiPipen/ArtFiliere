import { Text, TextInput } from '@/components/Typography';
import * as DocumentPicker from "expo-document-picker";
import { FilePlus, Square, SquareCheck } from "lucide-react-native";
import React from "react";
import { Alert, Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { DocumentDetails, DocumentFile } from "@/module/artist-registration/types";

interface Props {
  details: DocumentDetails;
  setDetails: (value: DocumentDetails) => void;
  hourlyRate: string;
  setHourlyRate: (val: string) => void;
  tinNum: string[];
  setTinNum: (val: string[]) => void;
  bio: string;
  setBio: (val: string) => void;
  birDoc: DocumentFile | null;
  setBirDoc: (doc: DocumentFile | null) => void;
  swornDoc: DocumentFile | null;
  setSwornDoc: (doc: DocumentFile | null) => void;
  onNext: () => void;
  errorMessage?: string;
}

export default function PersonalDocs({
  details, setDetails,
  hourlyRate,
  setHourlyRate,
  tinNum,
  setTinNum,
  bio,
  setBio,
  birDoc,
  setBirDoc,
  swornDoc,
  setSwornDoc,
  onNext,
  errorMessage,
}: Props) {

  const readDocumentAsDataUri = async (
    uri: string,
    mimeType?: string | null,
  ) => {
    const contentType = mimeType || "application/octet-stream";
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Unable to read the selected document."));
        reader.readAsDataURL(blob);
      });
    }
    const FileSystem = await import("expo-file-system/legacy");
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:${contentType};base64,${base64}`;
  };

  const pickDocument = async (type: "bir" | "sworn") => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        if (file.size && file.size > 5 * 1024 * 1024) {
          Alert.alert(
            "File too large",
            "Please choose a document that is 5 MB or smaller.",
          );
          return;
        }
        const fileData = {
          name: file.name,
          uri: file.uri,
          dataUri: await readDocumentAsDataUri(file.uri, file.mimeType),
          mimeType: file.mimeType || undefined,
        };
        if (type === "bir") setBirDoc(fileData);
        if (type === "sworn") setSwornDoc(fileData);
      }
    } catch (err) {
      Alert.alert("Error", "Failed to pick document");
    }
  };

  const field = (key: keyof DocumentDetails, label: string, placeholder: string) => (
    <View style={styles.field} key={key}>
      <Text style={styles.label}>{label} *</Text>
      <TextInput accessibilityLabel={label} style={styles.input} value={String(details[key] || '')} onChangeText={value => setDetails({ ...details, [key]: value })} placeholder={placeholder} placeholderTextColor="#A39690" />
    </View>
  );
  const upload = (type: 'bir' | 'sworn', doc: DocumentFile | null) => (
    <TouchableOpacity accessibilityRole="button" style={styles.upload} onPress={() => pickDocument(type)}>
      <FilePlus size={23} color="#BF5555" />
      <View style={{ flex: 1 }}><Text style={styles.uploadTitle}>{doc?.name || 'Choose a PDF or image *'}</Text><Text style={styles.hint}>{doc ? 'Tap to replace document' : 'Maximum 5 MB per document'}</Text></View>
    </TouchableOpacity>
  );
  return (
    <View style={{ gap: 20 }}>
      <View><Text style={styles.heading}>Artist details</Text><Text style={styles.hint}>Enter the details shown on your documents. All marked fields are required and will be reviewed by HR.</Text></View>
      <View style={styles.card}>
        <Text style={styles.section}>Artist profile</Text>
        <View style={styles.row}>
          <View style={styles.field}><Text style={styles.label}>Default hourly rate (PHP) *</Text><TextInput accessibilityLabel="Default hourly rate" style={styles.input} keyboardType="decimal-pad" value={hourlyRate} onChangeText={setHourlyRate} placeholder="120.00" /><Text style={styles.hint}>Prefills your future artwork pricing; you can adjust it per post.</Text></View>
          <View style={styles.field}><Text style={styles.label}>TIN (9 digits) *</Text><TextInput accessibilityLabel="TIN" style={styles.input} keyboardType="number-pad" maxLength={11} value={tinNum.join('')} onChangeText={value => setTinNum(value.replace(/\D/g, '').slice(0, 9).padEnd(9, ' ').split('').map(v => v.trim()))} placeholder="123456789" /></View>
        </View>
        <Text style={styles.label}>Artist bio</Text><TextInput accessibilityLabel="Artist bio" style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline value={bio} onChangeText={setBio} placeholder="Tell us about your work and artistic style" />
      </View>
      <View style={styles.card}>
        <Text style={styles.section}>BIR Certificate of Registration</Text><Text style={styles.hint}>Form 2303 ? Upload your current registration record. No expiry date is requested for this certificate.</Text>
        {upload('bir', birDoc)}
        {field('registered_name', 'BIR registered name', 'Name exactly as registered')}
        <View style={styles.row}>{field('rdo_code', 'RDO code', 'e.g. 039')}{field('registration_date', 'Registration date', 'YYYY-MM-DD')}</View>
      </View>
      <View style={styles.card}>
        <Text style={styles.section}>Sworn declaration of gross remittances</Text><Text style={styles.hint}>RMC 8-2024 Annex A ? Upload the notarized, BIR-received declaration for the current taxable year. Declare remittances across all marketplaces and payment providers.</Text>
        {upload('sworn', swornDoc)}
        <View style={styles.row}>{field('taxable_year', 'Taxable year', String(new Date().getFullYear()))}{field('notarized_date', 'Notarization date', 'YYYY-MM-DD')}{field('bir_received_date', 'BIR received date', 'YYYY-MM-DD')}</View>
        <Text style={styles.label}>Annual gross remittances stated in the declaration *</Text>
        <View style={styles.row}>{([['not_exceed_500000', 'Do not exceed PHP 500,000'], ['exceed_500000', 'Exceed PHP 500,000']] as const).map(([value, label]) => <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: details.remittance_status === value }} key={value} style={[styles.choice, details.remittance_status === value && styles.selected]} onPress={() => setDetails({ ...details, remittance_status: value })}>{details.remittance_status === value ? <SquareCheck size={21} color="#B74F4B" /> : <Square size={21} color="#A78C80" />}<Text style={[styles.choiceText, { flexShrink: 1 }]}>{label}</Text></TouchableOpacity>)}</View>
        <Text style={styles.hint}>Use the declaration for the applicable year. HR will review the uploaded document.</Text>
      </View>
      <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: details.confirmed }} style={styles.confirm} onPress={() => setDetails({ ...details, confirmed: !details.confirmed })}>{details.confirmed ? <SquareCheck size={21} color="#B74F4B" /> : <Square size={21} color="#A78C80" />}<Text style={[styles.choiceText, { flex: 1 }]}>I confirm these details match my uploaded documents and are accurate.</Text></TouchableOpacity>
      {!!errorMessage && <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>}
      <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={onNext}><Text style={styles.primaryText}>Continue to portfolio</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: 'LoraSemiBold', fontSize: 26, color: '#3A2D2A', marginBottom: 8 },
  section: { fontFamily: 'LoraSemiBold', fontSize: 20, color: '#3A2D2A', marginBottom: 4 },
  hint: { fontSize: 14, lineHeight: 21, color: '#786862' },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8D8D0', borderRadius: 16, padding: 20, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  field: { flexGrow: 1, minWidth: 220, gap: 7 },
  label: { color: '#674B40', fontSize: 14, fontWeight: '600' },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4D3CB', borderRadius: 12, minHeight: 46, padding: 12, fontSize: 15, color: '#3A2D2A' },
  upload: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FAF5F1', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D5B6AA', borderRadius: 12, padding: 16 },
  uploadTitle: { color: '#B74F4B', fontSize: 14, fontWeight: '600' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, flexGrow: 1, padding: 14, borderWidth: 1, borderColor: '#E8D8D0', borderRadius: 12, backgroundColor: '#FFF' },
  selected: { backgroundColor: '#F5E8E3', borderColor: '#DCA99A' },
  choiceText: { color: '#674B40', fontSize: 14, lineHeight: 21 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#F5E8E3', borderRadius: 12 },
  error: { color: '#AD3D3D', fontSize: 14, lineHeight: 21 },
  primary: { backgroundColor: '#C15656', alignSelf: 'flex-end', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 22 },
  primaryText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
