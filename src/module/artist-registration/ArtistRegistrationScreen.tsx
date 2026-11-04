import { goBackOr } from '@/services/navigation';
import { Text } from '@/components/Typography';
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PersonalDocs from "@/module/artist-registration/components/PersonalDocs";
import Portfolio from "@/module/artist-registration/components/Portfolio";
import SuccessModal from "@/module/artist-registration/components/SuccessModal";
import {
  DocumentFile,
  DocumentDetails,
  PortfolioItem,
} from "@/module/artist-registration/types";
import { auth } from "@/firebase/config";

export default function RegisterArtistScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [step, setStep] = useState<1 | 2>(1);
  const [details, setDetails] = useState<DocumentDetails>({ registered_name: '', rdo_code: '', registration_date: '', taxable_year: String(new Date().getFullYear()), notarized_date: '', bir_received_date: '', remittance_status: '', confirmed: false });
  const [stepError, setStepError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Form State
  const [hourlyRate, setHourlyRate] = useState("");
  const [tinNum, setTinNum] = useState(["", "", "", "", "", "", "", "", ""]);
  const [bio, setBio] = useState("");
  const [birDoc, setBirDoc] = useState<DocumentFile | null>(null);
  const [swornDoc, setSwornDoc] = useState<DocumentFile | null>(null);
  const [portfolioList, setPortfolioList] = useState<PortfolioItem[]>([]);

  const handleNextStep = () => {
    const missingFields = [
      !hourlyRate.trim() && "default hourly rate",
      tinNum.some((digit) => !digit) && "9-digit TIN",
      !birDoc && "BIR Form 2303",
      !swornDoc && "sworn declaration",
    ].filter(Boolean);
    if (missingFields.length) {
      setStepError(
        `Complete the following before continuing: ${missingFields.join(", ")}.`,
      );
      return;
    }
    if (!Number.isFinite(Number(hourlyRate)) || Number(hourlyRate) <= 0) {
      setStepError("Enter a valid default hourly rate greater than zero.");
      return;
    }
    const dates = [details.registration_date, details.notarized_date, details.bir_received_date];
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    if (!details.registered_name.trim() || !/^\d{3,4}$/.test(details.rdo_code) || dates.some(value => !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value > today) || details.bir_received_date < details.notarized_date || details.taxable_year !== String(new Date().getFullYear()) || !details.remittance_status || !details.confirmed) {
      setStepError('Complete all document details, use valid dates (YYYY-MM-DD), select the declared remittance status, and confirm accuracy. Dates cannot be in the future; BIR receipt must follow notarization.');
      return;
    }
    setStepError('');
    setStep(2);
  };

  const handleFinalRegister = async () => {
    if (!user) return;
    if (portfolioList.length === 0) {
      Alert.alert(
        "Portfolio Empty",
        "Please add at least one artwork to your portfolio.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        firebase_uid: user.uid,
        hourly_rate: hourlyRate,
        tinNum: tinNum.join(""),
        bio: bio,
        birCertificate: birDoc
          ? { name: birDoc.name, data_uri: birDoc.dataUri }
          : null,
        swornDeclaration: swornDoc
          ? { name: swornDoc.name, data_uri: swornDoc.dataUri }
          : null,
        portfolio: portfolioList,
        documentDetails: details,
      };

      // Change url when testing sa expo go
      const API_URL =
        process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

      const response = await fetch(
        `${API_URL}/api/users/artist-applications/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();

      if (response.ok) {
        setSubmitting(false);
        setShowSuccessModal(true);
      } else {
        console.error("Django Error:", result);
        Alert.alert(
          "Submission Failed",
          result.error ||
            "There was an error submitting your application. Please try again later.",
        );
        setSubmitting(false);
      }
    } catch (err) {
      console.error("Network Error:", err);
      Alert.alert(
        "Connection Error",
        "Unable to reach backend server. Please check your connection and try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Top Header */}
      <View style={styles.topHeaderBar}>
        <View style={styles.headerInner}>
          <TouchableOpacity
            onPress={() => {
              if (step === 2) {
                setStep(1);
              } else {
                goBackOr('/(home)/profile');
              }
            }}
          >
            <ArrowLeft color="#A74C45" size={24} />
          </TouchableOpacity>
          <Text style={{ fontFamily: "LoraSemiBold", fontSize: 26, color: "#3A2D2A" }}>Become an artist</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: 1100, flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          {["1  Artist details", "2  Portfolio"].map((label, index) => <View key={label} style={{ flex: 1, padding: 12, borderBottomWidth: 2, borderColor: step === index + 1 ? '#BF5555' : '#E8D8D0' }}><Text style={{ color: step === index + 1 ? '#B74F4B' : '#897A73', fontSize: 14, fontWeight: '600' }}>{label}</Text></View>)}
        </View>
        <View style={styles.formCard}>
          {step === 1 ? (
            <PersonalDocs
              details={details}
              setDetails={setDetails}
              hourlyRate={hourlyRate}
              setHourlyRate={setHourlyRate}
              tinNum={tinNum}
              setTinNum={setTinNum}
              bio={bio}
              setBio={setBio}
              birDoc={birDoc}
              setBirDoc={setBirDoc}
              swornDoc={swornDoc}
              setSwornDoc={setSwornDoc}
              onNext={handleNextStep}
              errorMessage={stepError}
            />
          ) : (
            <Portfolio
              portfolioList={portfolioList}
              setPortfolioList={setPortfolioList}
              onSubmit={handleFinalRegister}
              submitting={submitting}
            />
          )}

          <Text style={styles.footerTermsDisclaimerText}>
            By registering, I accept the{" "}
            <Text style={styles.redUnderlineText}>Terms of Use</Text>
            {"\n"}
            and <Text style={styles.redUnderlineText}>Privacy Policy</Text>
          </Text>
        </View>
      </ScrollView>

      <SuccessModal
        visible={showSuccessModal}
        onConfirm={() => {
          setShowSuccessModal(false);
          router.replace("/(home)");
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF7F3" },
  topHeaderBar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1, borderBottomColor: "#E8D8D0",
    height: 76,
    justifyContent: "center",
    alignItems: "center",
  },
  headerInner: { width: "100%", maxWidth: 1140, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 18 },
  scrollContent: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  formCard: {
    width: "100%",
    maxWidth: 1100,
    backgroundColor: "transparent",
  },
  footerTermsDisclaimerText: {
    textAlign: "center",
    fontSize: 12,
    color: "#786862",
    marginTop: 25,
    lineHeight: 20,
  },
  redUnderlineText: {
    color: "#C15656",
    textDecorationLine: "underline",
    fontWeight: "bold",
  },
});
