import * as DocumentPicker from 'expo-document-picker';
import { FilePlus, HelpCircle } from 'lucide-react-native';
import React from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { DocumentFile } from './types';

interface Props {
  age: string;
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
}

export default function PersonalDocs({
  age,
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
}: Props) {
  const pickDocument = async (type: 'bir' | 'sworn') => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        const fileData = { name: file.name, uri: file.uri };
        if (type === 'bir') setBirDoc(fileData);
        if (type === 'sworn') setSwornDoc(fileData);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleTinChange = (text: string, index: number) => {
    const newTin = [...tinNum];
    newTin[index] = text;
    setTinNum(newTin);
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.titleRow}>
        <Text style={styles.mainTitleText}>Register as an Artist</Text>
        <TouchableOpacity>
          <HelpCircle size={22} color="#C15656" />
        </TouchableOpacity>
      </View>

      <Text style={styles.labelTitle}>Age:</Text>
      <Text style={styles.ageValueText}>{age}</Text>

      <Text style={styles.labelTitle}>Hourly Rate</Text>
      <View style={styles.inputBoxRow}>
        <Text style={styles.currencyPrefix}>Php.</Text>
        <TextInput
          style={styles.innerInputText}
          placeholder="ex. 120.00"
          placeholderTextColor="#aaa"
          keyboardType="numeric"
          value={hourlyRate}
          onChangeText={setHourlyRate}
        />
      </View>

      <Text style={styles.labelTitle}>BIR Certificate of Registration (BIR Form 2303) *</Text>
      <TouchableOpacity style={styles.uploadBoxDotted} onPress={() => pickDocument('bir')}>
        <FilePlus size={36} color="#C15656" />
        {birDoc && <Text style={styles.uploadedFileNameText} numberOfLines={1}>{birDoc.name}</Text>}
      </TouchableOpacity>

      <Text style={styles.labelTitle}>TIN Number</Text>
      <View style={styles.tinBoxRow}>
        {tinNum.map((val, idx) => (
          <React.Fragment key={idx}>
            <TextInput
              style={styles.tinBoxSquare}
              maxLength={1}
              keyboardType="number-pad"
              value={val}
              onChangeText={(t) => handleTinChange(t, idx)}
            />
            {(idx === 2 || idx === 5) && <Text style={styles.tinDashSeparator}>-</Text>}
          </React.Fragment>
        ))}
      </View>

      <Text style={styles.labelTitle}>Sworn Declaration (Sworn Statement) *</Text>
      <TouchableOpacity style={styles.uploadBoxDotted} onPress={() => pickDocument('sworn')}>
        <FilePlus size={36} color="#C15656" />
        {swornDoc && <Text style={styles.uploadedFileNameText} numberOfLines={1}>{swornDoc.name}</Text>}
      </TouchableOpacity>

      <Text style={styles.labelTitle}>Bio</Text>
      <TextInput
        style={styles.bioTextAreaInput}
        multiline
        numberOfLines={4}
        value={bio}
        onChangeText={setBio}
        placeholder="Briefly describe your artistic style and background..."
        placeholderTextColor="#aaa"
      />

      <TouchableOpacity style={styles.primaryRedButton} onPress={onNext}>
        <Text style={styles.primaryBtnLabel}>Next</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: { width: '100%' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  mainTitleText: { fontSize: 22, fontWeight: 'bold', color: '#C15656' },
  labelTitle: { fontSize: 13, fontWeight: 'bold', color: '#C15656', marginTop: 14, marginBottom: 6 },
  ageValueText: { fontSize: 14, color: '#A87C7C', marginBottom: 6 },
  inputBoxRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, height: 44, paddingHorizontal: 12 },
  currencyPrefix: { fontSize: 13, color: '#888', marginRight: 5 },
  innerInputText: { flex: 1, fontSize: 13, color: '#000' },
  uploadBoxDotted: { borderWidth: 1, borderColor: '#C15656', borderStyle: 'dashed', borderRadius: 10, height: 80, justifyContent: 'center', alignItems: 'center', marginVertical: 6 },
  uploadedFileNameText: { fontSize: 11, color: '#333', marginTop: 4, paddingHorizontal: 10 },
  tinBoxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 },
  tinBoxSquare: { width: 28, height: 36, borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 6, textAlign: 'center', fontSize: 14, color: '#000' },
  tinDashSeparator: { fontSize: 16, color: '#888', fontWeight: 'bold' },
  bioTextAreaInput: { borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, padding: 10, textAlignVertical: 'top', fontSize: 13, color: '#000', minHeight: 90 },
  primaryRedButton: { backgroundColor: '#C15656', borderRadius: 8, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 25 },
  primaryBtnLabel: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});