import * as DocumentPicker from "expo-document-picker";
import { FilePlus, HelpCircle } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { DocumentFile } from "@/module/artist-registration/types";

interface Props {
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
  const tinInputRefs = useRef<Array<TextInput | null>>([]);
  const [showHelp, setShowHelp] = useState(false);
  const pickDocument = async (type: "bir" | "sworn") => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        const fileData = { name: file.name, uri: file.uri };
        if (type === "bir") setBirDoc(fileData);
        if (type === "sworn") setSwornDoc(fileData);
      }
    } catch (err) {
      Alert.alert("Error", "Failed to pick document");
    }
  };

  const handleTinChange = (text: string, index: number) => {
    const digits = text.replace(/\D/g, "");
    const newTin = [...tinNum];
    if (!digits) {
      newTin[index] = "";
      setTinNum(newTin);
      return;
    }

    digits
      .slice(0, tinNum.length - index)
      .split("")
      .forEach((digit, offset) => {
        newTin[index + offset] = digit;
      });
    setTinNum(newTin);

    const nextIndex = Math.min(index + digits.length, tinNum.length - 1);
    if (index + digits.length < tinNum.length) {
      tinInputRefs.current[nextIndex]?.focus();
    }
  };

  const handleTinKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !tinNum[index] && index > 0) {
      tinInputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.titleRow}>
        <Text style={styles.mainTitleText}>Register as an Artist</Text>
        <TouchableOpacity
          onPress={() => setShowHelp((visible) => !visible)}
          accessibilityLabel="Artist registration requirements"
        >
          <HelpCircle size={22} color="#C15656" />
        </TouchableOpacity>
      </View>

      {showHelp && (
        <View style={styles.helpPanel}>
          <Text style={styles.helpTitle}>Before you apply</Text>
          <Text style={styles.helpText}>
            Upload your BIR Form 2303 and sworn declaration, enter your TIN and
            hourly rate, then add at least one original artwork to your
            portfolio. Applications are reviewed before artist access is
            approved.
          </Text>
        </View>
      )}

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

      <Text style={styles.labelTitle}>
        BIR Certificate of Registration (BIR Form 2303) *
      </Text>
      <TouchableOpacity
        style={styles.uploadBoxDotted}
        onPress={() => pickDocument("bir")}
      >
        <FilePlus size={36} color="#C15656" />
        {birDoc && (
          <Text style={styles.uploadedFileNameText} numberOfLines={1}>
            {birDoc.name}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.labelTitle}>TIN Number</Text>
      <Text style={styles.fieldHint}>
        Enter your 9-digit TIN. Each number moves you to the next field
        automatically.
      </Text>
      <View style={styles.tinBoxRow}>
        {tinNum.map((val, idx) => (
          <React.Fragment key={idx}>
            <TextInput
              ref={(input) => {
                tinInputRefs.current[idx] = input;
              }}
              style={styles.tinBoxSquare}
              maxLength={tinNum.length}
              keyboardType="number-pad"
              value={val}
              onChangeText={(t) => handleTinChange(t, idx)}
              onKeyPress={({ nativeEvent }) =>
                handleTinKeyPress(nativeEvent.key, idx)
              }
              returnKeyType={idx === tinNum.length - 1 ? "done" : "next"}
            />
            {(idx === 2 || idx === 5) && (
              <Text style={styles.tinDashSeparator}>-</Text>
            )}
          </React.Fragment>
        ))}
      </View>

      <Text style={styles.labelTitle}>
        Sworn Declaration (Sworn Statement) *
      </Text>
      <TouchableOpacity
        style={styles.uploadBoxDotted}
        onPress={() => pickDocument("sworn")}
      >
        <FilePlus size={36} color="#C15656" />
        {swornDoc && (
          <Text style={styles.uploadedFileNameText} numberOfLines={1}>
            {swornDoc.name}
          </Text>
        )}
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
  stepContainer: { width: "100%" },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  mainTitleText: { fontSize: 22, fontWeight: "bold", color: "#C15656" },
  labelTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#C15656",
    marginTop: 14,
    marginBottom: 6,
  },
  fieldHint: {
    color: "#7B6A65",
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 3,
  },
  helpPanel: {
    backgroundColor: "#FFF6E8",
    borderLeftWidth: 3,
    borderLeftColor: "#C15656",
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  helpTitle: {
    color: "#C15656",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  helpText: { color: "#6F625D", fontSize: 12, lineHeight: 18 },
  inputBoxRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D0D0D0",
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 12,
  },
  currencyPrefix: { fontSize: 13, color: "#888", marginRight: 5 },
  innerInputText: { flex: 1, fontSize: 13, color: "#000" },
  uploadBoxDotted: {
    borderWidth: 1,
    borderColor: "#C15656",
    borderStyle: "dashed",
    borderRadius: 10,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 6,
  },
  uploadedFileNameText: {
    fontSize: 11,
    color: "#333",
    marginTop: 4,
    paddingHorizontal: 10,
  },
  tinBoxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 6,
  },
  tinBoxSquare: {
    width: 28,
    height: 36,
    borderWidth: 1,
    borderColor: "#D0D0D0",
    borderRadius: 6,
    textAlign: "center",
    fontSize: 14,
    color: "#000",
  },
  tinDashSeparator: { fontSize: 16, color: "#888", fontWeight: "bold" },
  bioTextAreaInput: {
    borderWidth: 1,
    borderColor: "#D0D0D0",
    borderRadius: 8,
    padding: 10,
    textAlignVertical: "top",
    fontSize: 13,
    color: "#000",
    minHeight: 90,
  },
  primaryRedButton: {
    backgroundColor: "#C15656",
    borderRadius: 8,
    height: 46,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
  },
  primaryBtnLabel: { color: "#fff", fontSize: 15, fontWeight: "bold" },
});
