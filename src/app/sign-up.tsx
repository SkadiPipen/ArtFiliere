import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import API_URL from '@/services/api';
import { registerUser } from '@/services/auth';
import { COLORS } from '@/constants/colors';
import {
  INITIAL_SIGN_UP_FORM_DATA,
  SignUpFormData,
  UpdateSignUpField,
  toDjangoPayload,
} from '@/components/signup/types';
import CreateAccount from '@/components/signup/CreateAccount';
import ProfileInfo from '@/components/signup/ProfileInfo';
import Address from '@/components/signup/Address';
import RoyaltyInfo from '@/components/signup/RoyaltyInfo';
import Success from '@/components/signup/Success';

const TOTAL_STEPS = 4;

const STEP_META: Record<number, { subtitle: string; heading: string }> = {
  1: { subtitle: 'Sign up to get more access', heading: 'Create Your Account' },
  2: { subtitle: 'Tell us about yourself', heading: 'Profile Information' },
  3: { subtitle: 'Enter your default address', heading: 'Address' },
  4: { subtitle: 'And set default royalty (this is optional)', heading: '' },
};

function validateStep(step: number, formData: SignUpFormData): string | null {
  if (step === 1) {
    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
      return 'Please fill in all fields.';
    }
    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match.';
    }
  }

  if (step === 2) {
    if (!formData.firstName || !formData.lastName || !formData.dateOfBirth || !formData.contactNumber) {
      return 'Please fill in all required profile fields.';
    }
  }

  if (step === 3) {
    if (!formData.region || !formData.province || !formData.city || !formData.barangay || !formData.street) {
      return 'Please complete your address.';
    }
  }

  return null;
}

export default function SignUp() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<SignUpFormData>(INITIAL_SIGN_UP_FORM_DATA);

  const updateField: UpdateSignUpField = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  function handleBack() {
    setStep((prev) => Math.max(1, prev - 1));
  }

  function handleNext() {
    const error = validateStep(step, formData);
    if (error) {
      alert(error);
      return;
    }
    setStep((prev) => prev + 1);
  }

  async function handleCreateAccount() {
    try {
      // Register in Firebase
      const user = await registerUser(formData.email, formData.password);

      // Get Firebase ID Token
      const token = await user.getIdToken();

      // Send token + full profile to Django, mapped to the snake_case
      // fields the users.User / users.Address models expect
      const response = await fetch(`${API_URL}/auth/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(toDjangoPayload(formData)),
      });

      console.log('Status:', response.status);

      const text = await response.text();
      console.log(text);

      if (!response.ok) {
        throw new Error(`Server Error (${response.status})`);
      }

      setStep(5);
    } catch (error: any) {
      console.log(error);
      alert(error.message);
    }
  }

  const isSuccessStep = step === 5;
  const meta = STEP_META[step];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}>
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            alignSelf: 'center',
            backgroundColor: COLORS.white,
            borderRadius: 16,
            padding: 24,
          }}
        >
          {!isSuccessStep && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16 }}>
                {Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1).map((dotStep) => (
                  <View
                    key={dotStep}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      marginHorizontal: 4,
                      backgroundColor: dotStep <= step ? COLORS.activeDot : COLORS.inactiveDot,
                    }}
                  />
                ))}
              </View>

              <Text style={{ textAlign: 'center', color: COLORS.red, fontWeight: '700', fontSize: 13 }}>
                Step {step} of Registration
              </Text>
              <Text
                style={{
                  textAlign: 'center',
                  color: COLORS.textMuted,
                  fontSize: 12,
                  marginBottom: 12,
                }}
              >
                {meta.subtitle}
              </Text>

              {meta.heading ? (
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '800',
                    color: COLORS.red,
                    marginBottom: 18,
                  }}
                >
                  {meta.heading}
                </Text>
              ) : null}
            </>
          )}

          {step === 1 && <CreateAccount formData={formData} updateField={updateField} />}
          {step === 2 && <ProfileInfo formData={formData} updateField={updateField} />}
          {step === 3 && <Address formData={formData} updateField={updateField} />}
          {step === 4 && <RoyaltyInfo formData={formData} updateField={updateField} />}
          {step === 5 && <Success />}

          {!isSuccessStep && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: step === 1 ? 'flex-end' : 'space-between',
                alignItems: 'center',
                marginTop: 20,
              }}
            >
              {step > 1 && (
                <Pressable onPress={handleBack}>
                  <Text style={{ color: COLORS.textMuted, fontWeight: '600' }}>Back</Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => ({
                  backgroundColor: pressed ? COLORS.redDark : COLORS.red,
                  paddingHorizontal: 28,
                  paddingVertical: 12,
                  borderRadius: 8,
                })}
                onPress={step === 4 ? handleCreateAccount : handleNext}
              >
                <Text style={{ color: COLORS.white, fontWeight: '700' }}>
                  {step === 4 ? 'Create Account' : 'Next'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}