import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import PersonalDocs from '@/module/artist-registration/components/PersonalDocs';
import Portfolio from '@/module/artist-registration/components/Portfolio';
import SuccessModal from '@/module/artist-registration/components/SuccessModal';
import { DocumentFile, PortfolioItem } from '@/module/artist-registration/types';
import { auth } from '@/firebase/config';

export default function RegisterArtistScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Form State
  const [hourlyRate, setHourlyRate] = useState('');
  const [tinNum, setTinNum] = useState(['', '', '', '', '', '', '', '', '']);
  const [bio, setBio] = useState('');
  const [birDoc, setBirDoc] = useState<DocumentFile | null>(null);
  const [swornDoc, setSwornDoc] = useState<DocumentFile | null>(null);
  const [portfolioList, setPortfolioList] = useState<PortfolioItem[]>([]);
  
  const handleNextStep = () => {
    if (!hourlyRate || tinNum.some((digit) => !digit) || !birDoc || !swornDoc) {
      Alert.alert('Required Fields', 'Please enter your hourly rate and TIN, then upload all required documents.');
      return;
    }
    setStep(2);
  };

  const handleFinalRegister = async () => {
    if (!user) return;
    if (portfolioList.length === 0) {
      Alert.alert('Portfolio Empty', 'Please add at least one artwork to your portfolio.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        firebase_uid: user.uid,
        hourly_rate: hourlyRate,
        tinNum: tinNum.join(''),
        bio: bio,
        birCertificate: birDoc ? birDoc.name : '',
        swornDeclaration: swornDoc ? swornDoc.name : '',
        portfolio: portfolioList,
      }

      // Change url when testing sa expo go
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

      const response = await fetch(`${API_URL}/api/users/artist-applications/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        setSubmitting(false);
        setShowSuccessModal(true);
      } else {
        console.error('Django Error:', result);
        Alert.alert('Submission Failed', result.error || 'There was an error submitting your application. Please try again later.');
        setSubmitting(false);
      }
    } catch (err) {
      console.error('Network Error:', err);
      Alert.alert('Connection Error', 'Unable to reach backend server. Please check your connection and try again.');
      setSubmitting(false);
    }
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.topHeaderBar}>
        <View style={styles.headerInner}>
          <TouchableOpacity 
          onPress={() => {
            if (step === 2) {
                setStep(1);
            } else if (router.canGoBack()){
                router.back();
            } else {
                router.replace('/(home)');
            }
          }}>
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.formCard}>
          {step === 1 ? (
            <PersonalDocs
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
            By registering, I accept the <Text style={styles.redUnderlineText}>Terms of Use</Text>{'\n'}
            and <Text style={styles.redUnderlineText}>Privacy Policy</Text>
          </Text>
        </View>
      </ScrollView>

      <SuccessModal
        visible={showSuccessModal}
        onConfirm={() => {
          setShowSuccessModal(false);
          router.replace('/(home)');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  topHeaderBar: { backgroundColor: '#C15656', height: 56, justifyContent: 'center', alignItems: 'center' },
  headerInner: { width: '100%', maxWidth: 800, paddingHorizontal: 16 },
  scrollContent: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  formCard: { width: '100%', maxWidth: 800, backgroundColor: '#fff', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#E2E8F0', elevation: 2 },
  footerTermsDisclaimerText: { textAlign: 'center', fontSize: 11, color: '#666', marginTop: 25, lineHeight: 16 },
  redUnderlineText: { color: '#C15656', textDecorationLine: 'underline', fontWeight: 'bold' },
});
