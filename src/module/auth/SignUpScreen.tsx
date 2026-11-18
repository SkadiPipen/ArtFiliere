import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { captureProfilePhoto } from '@/services/captureProfilePhoto';
import { pickSettingsImage } from '@/module/settings/settingsApi';
import { useRef, useState } from "react";
import { View, Pressable, ScrollView, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import API_URL from "@/services/api";
import { loginUser, registerUser } from "@/services/auth";
import { getSignupPasswordError } from "@/services/signupPassword";
import { COLORS } from "@/constants/colors";
import {
  INITIAL_SIGN_UP_FORM_DATA,
  SignUpFormData,
  UpdateSignUpField,
  toDjangoPayload,
} from "@/module/auth/sign-up/types";
import CreateAccount from "@/module/auth/sign-up/components/CreateAccount";
import ProfileInfo from "@/module/auth/sign-up/components/ProfileInfo";
import Address from "@/module/auth/sign-up/components/Address";
import RoyaltyInfo from "@/module/auth/sign-up/components/RoyaltyInfo";
import Success from "@/module/auth/sign-up/components/Success";

import SignupMotion, { SignupBackdrop } from './sign-up/components/SignupMotion';

const TOTAL_STEPS = 5;

const STEP_META: Record<number, { subtitle: string; heading: string }> = {
  1: { subtitle: "Sign up to get more access", heading: "Create Your Account" },
  2: { subtitle: "Tell us about yourself", heading: "Profile Information" },
  3: { subtitle: "Enter your default address", heading: "Address" },
  4: { subtitle: "Apply for royalty access (optional)", heading: "" },
  5: { subtitle: "Add a profile photo or skip this step", heading: "Profile Photo (Optional)" },
};

function validateStep(step: number, formData: SignUpFormData): string | null {
  if (step === 1) {
    if (
      !formData.username ||
      !formData.email ||
      !formData.password ||
      !formData.confirmPassword
    ) {
      return "Please fill in all fields.";
    }
    const passwordError = getSignupPasswordError(formData.password);
    if (passwordError) return passwordError;
    if (formData.password !== formData.confirmPassword) {
      return "Passwords do not match.";
    }
  }

  if (step === 2) {
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.dateOfBirth ||
      !formData.contactNumber
    ) {
      return "Please fill in all required profile fields.";
    }
  }

  if (step === 3) {
    if (
      !formData.region ||
      !formData.province ||
      !formData.city ||
      !formData.postalCode ||
      !formData.barangay ||
      !formData.street
    ) {
      return "Please complete your address.";
    }
  }

  if (step === 4 && formData.wantsRoyalty === 'yes') {
    if (!formData.businessPermitImage) return 'Please upload an image of your business permit.';
    const date = new Date(`${formData.permitExpiresOn}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.permitExpiresOn) || !Number.isFinite(date.getTime()) || date < today || `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` !== formData.permitExpiresOn) return 'Enter an unexpired permit date in YYYY-MM-DD format.';
  }
  return null;
}

export default function SignUp() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  const [formData, setFormData] = useState<SignUpFormData>(
    INITIAL_SIGN_UP_FORM_DATA,
  );

  const updateField: UpdateSignUpField = (key, value) => {
    if (key === "password" || key === "confirmPassword") setError("");
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  function handleBack() {
    if (busy) return;
    setError(''); setStep((prev) => Math.max(1, prev - 1));
  }

  function handleNext() {
    if (busy) return;
    const error = validateStep(step, formData);
    if (error) {
      setError(error);
      return;
    }
    setError(''); setStep((prev) => prev + 1);
  }

  async function chooseProfilePhoto() {
    setBusy(true); setError('');
    try {
      const image = await pickSettingsImage(true);
      if (image) updateField('profileImage', image);
    } catch (e: any) { setError(e.message || 'Unable to select a profile photo.'); }
    finally { setBusy(false); }
  }

  async function takeProfilePhoto() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const image = await captureProfilePhoto();
      if (image) updateField('profileImage', image);
    } catch (e: any) { setError(e.message || 'Unable to take a profile photo.'); }
    finally { setBusy(false); }
  }

  async function handleCreateAccount(skipPhoto = false) {
    if (submitting.current || busy) return;
    for (const stage of [1, 2, 3, 4]) {
      const validationError = validateStep(stage, formData);
      if (validationError) { setError(validationError); setStep(stage); return; }
    }
    submitting.current = true; setBusy(true); setError('');
    try {
      // If Firebase completed a prior attempt but the app profile did not save,
      // sign in and retry the profile registration instead of leaving the user stuck.
      let user;
      try {
        user = await registerUser(formData.email, formData.password);
      } catch (error: any) {
        if (error.code !== "auth/email-already-in-use") throw error;
        user = await loginUser(formData.email, formData.password);
      }

      // Get Firebase ID Token
      const token = await user.getIdToken();

      // Send token + full profile to Django, mapped to the snake_case
      // fields the users.User / users.Address models expect
      const payload = JSON.stringify(toDjangoPayload({ ...formData, profileImage: skipPhoto ? '' : formData.profileImage }));
      if (payload.length > 7.5 * 1024 * 1024) throw Error('The permit and profile photo are too large together. Choose a smaller profile photo or skip it.');
      const response = await fetch(`${API_URL}/auth/register/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      });


      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || `Unable to create your account (${response.status}).`,
        );
      }

      setStep(6);
    } catch (error: any) {
      setError(error.message || 'Unable to create your account.');
    } finally { submitting.current = false; setBusy(false); }
  }

  const isSuccessStep = step === 6;
  const meta = STEP_META[step];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.red }}>
      <SignupBackdrop />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 20,
        }}
      >
        <SignupMotion step={step}>
          {!isSuccessStep && (
            <>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                {Array.from(
                  { length: TOTAL_STEPS },
                  (_, index) => index + 1,
                ).map((dotStep) => (
                  <View
                    key={dotStep}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      marginHorizontal: 4,
                      backgroundColor:
                        dotStep <= step ? COLORS.activeDot : COLORS.inactiveDot,
                    }}
                  />
                ))}
              </View>

              <Text
                style={{
                  textAlign: "center",
                  color: COLORS.red,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                Step {step} of Registration
              </Text>
              <Text
                style={{
                  textAlign: "center",
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
                    fontWeight: "800",
                    color: COLORS.red,
                    marginBottom: 18,
                  }}
                >
                  {meta.heading}
                </Text>
              ) : null}
            </>
          )}

          {!!error && <Text accessibilityRole="alert" style={{ color: '#FFFFFF', backgroundColor: '#84302C', padding: 12, borderRadius: 8, marginBottom: 14 }}>{error}</Text>}
          {busy && <ActivityIndicator color={COLORS.red} />}
          {step === 1 && (
            <CreateAccount formData={formData} updateField={updateField} busy={busy} />
          )}
          {step === 2 && (
            <ProfileInfo formData={formData} updateField={updateField} />
          )}
          {step === 3 && (
            <Address formData={formData} updateField={updateField} />
          )}
          {step === 4 && (
            <RoyaltyInfo formData={formData} updateField={updateField} />
          )}
          {step === 5 && <View style={{ gap: 14, alignItems: 'center' }}>
            <Text style={{ color: COLORS.textMuted }}>You can add or change your photo later in Account Settings.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Take profile photo with camera" disabled={busy} onPress={takeProfilePhoto} style={{ width: 124, height: 124, borderRadius: 62, borderWidth: 1.5, borderColor: COLORS.red, backgroundColor: '#FFF5F3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', opacity: busy ? 0.6 : 1 }}>
              {formData.profileImage ? <><Image source={{ uri: formData.profileImage }} accessibilityLabel="Selected profile photo" style={{ width: '100%', height: '100%' }} /><View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingVertical: 6, backgroundColor: COLORS.red }}><Ionicons name="camera-outline" size={22} color={COLORS.white} /></View></> : <Ionicons name="camera-outline" size={40} color={COLORS.red} />}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={chooseProfilePhoto}><Text style={{ color: COLORS.red, padding: 12, fontWeight: '700' }}>{formData.profileImage ? 'Choose another photo' : 'Upload profile photo'}</Text></Pressable>
            {!!formData.profileImage && <Pressable disabled={busy} onPress={() => updateField('profileImage', '')}><Text style={{ color: COLORS.red }}>Remove photo</Text></Pressable>}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => handleCreateAccount(true)}><Text style={{ color: COLORS.textMuted, padding: 12 }}>Skip and create account</Text></Pressable>
          </View>}
          {step === 6 && <Success /> }

          {step === 1 && (
            <Text style={{ color: COLORS.textDark, fontSize: 13, marginTop: 16, textAlign: "center" }}>
              Already have an account?{" "}
              <Link href="/login" style={{ color: COLORS.red, fontSize: 13, fontWeight: "700", textDecorationLine: "underline" }}>
                Log In
              </Link>
            </Text>
          )}

          {!isSuccessStep && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: step === 1 ? "flex-end" : "space-between",
                alignItems: "center",
                marginTop: 20,
              }}
            >
              {step > 1 && (
                <Pressable disabled={busy} onPress={handleBack}>
                  <Text style={{ color: COLORS.textMuted, fontWeight: "600" }}>
                    Back
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => ({
                  backgroundColor: pressed ? COLORS.redDark : COLORS.red,
                  paddingHorizontal: 28,
                  paddingVertical: 12,
                  borderRadius: 8,
                })}
                disabled={busy}
                onPress={step === 5 ? () => handleCreateAccount() : handleNext}
              >
                <Text style={{ color: COLORS.white, fontWeight: "700" }}>
                  {busy ? "Please wait…" : step >= 4 ? "Create Account" : "Next"}
                </Text>
              </Pressable>
            </View>
          )}
        </SignupMotion>
      </ScrollView>
    </SafeAreaView>
  );
}
