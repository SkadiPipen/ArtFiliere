import { Text } from '@/components/Typography';
import { auth } from '@/firebase/config';
import type { User } from 'firebase/auth';
import { googleSignUp } from '@/services/googleSignUp';
import { pickSettingsImage } from '@/module/settings/settingsApi';
import { useRef, useState } from "react";
import { View, Pressable, ScrollView, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import API_URL from "@/services/api";
import { loginUser, registerUser } from "@/services/auth";
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

const TOTAL_STEPS = 5;

const STEP_META: Record<number, { subtitle: string; heading: string }> = {
  1: { subtitle: "Sign up to get more access", heading: "Create Your Account" },
  2: { subtitle: "Tell us about yourself", heading: "Profile Information" },
  3: { subtitle: "Enter your default address", heading: "Address" },
  4: { subtitle: "Apply for royalty access (optional)", heading: "" },
  5: { subtitle: "Add a profile photo or skip this step", heading: "Profile Photo (Optional)" },
};

function validateStep(step: number, formData: SignUpFormData, googleLinked = false): string | null {
  if (step === 1) {
    if (
      !formData.username ||
      !formData.email ||
      (!googleLinked && (!formData.password || !formData.confirmPassword))
    ) {
      return "Please fill in all fields.";
    }
    if (!googleLinked && formData.password !== formData.confirmPassword) {
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
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  const [formData, setFormData] = useState<SignUpFormData>(
    INITIAL_SIGN_UP_FORM_DATA,
  );

  const updateField: UpdateSignUpField = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  function handleBack() {
    if (busy) return;
    setError(''); setStep((prev) => Math.max(1, prev - 1));
  }

  function handleNext() {
    if (busy) return;
    const error = validateStep(step, formData, !!googleUser);
    if (error) {
      setError(error);
      return;
    }
    setError(''); setStep((prev) => prev + 1);
  }

  async function handleGoogleSignUp() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const user = await googleSignUp();
      if (!user) return;
      if (!user.email) throw Error('Google did not share an email address. Choose another account.');
      const existing = await fetch(`${API_URL}/auth/me/`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (existing.ok) throw Error('This Google account already has an ArtFiliere account. Please use Log In.');
      if (existing.status !== 404) throw Error('Unable to check your Google account. Please try again.');
      const names = (user.displayName || '').trim().split(/\s+/);
      setGoogleUser(user);
      setFormData(previous => ({ ...previous, email: user.email!, password: '', confirmPassword: '',
        username: previous.username || user.email!.split('@')[0].replace(/[^a-zA-Z0-9_]/g, ''),
        firstName: previous.firstName || names[0] || '',
        lastName: previous.lastName || names.slice(1).join(' ') }));
    } catch (e: any) {
      if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) {
        const messages: Record<string, string> = {
          'auth/configuration-not-found': 'Google sign-in is not configured yet. Enable Google in Firebase Authentication > Sign-in methods.',
          'auth/operation-not-allowed': 'Enable Google in Firebase Authentication → Sign-in methods.',
          'auth/unauthorized-domain': 'Add this website domain to Firebase Authentication → Authorized domains.',
          'auth/popup-blocked': 'Allow pop-ups for ArtFiliere and try Google sign-up again.',
        };
        setError(messages[e.code] || e.message || 'Unable to connect Google.');
      }
    } finally { setBusy(false); }
  }

  async function chooseProfilePhoto() {
    setBusy(true); setError('');
    try {
      const image = await pickSettingsImage(true);
      if (image) updateField('profileImage', image);
    } catch (e: any) { setError(e.message || 'Unable to select a profile photo.'); }
    finally { setBusy(false); }
  }

  async function handleCreateAccount(skipPhoto = false) {
    if (submitting.current || busy) return;
    for (const stage of [1, 2, 3, 4]) {
      const validationError = validateStep(stage, formData, !!googleUser);
      if (validationError) { setError(validationError); setStep(stage); return; }
    }
    submitting.current = true; setBusy(true); setError('');
    try {
      // If Firebase completed a prior attempt but the app profile did not save,
      // sign in and retry the profile registration instead of leaving the user stuck.
      let user = googleUser;
      if (user && auth.currentUser?.uid !== user.uid) throw Error('Your Google session changed. Connect your Google account again in step 1.');
      if (!user) {
        try {
          user = await registerUser(formData.email, formData.password);
        } catch (error: any) {
          if (error.code !== "auth/email-already-in-use") throw error;
          user = await loginUser(formData.email, formData.password);
        }
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
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 420,
            alignSelf: "center",
            backgroundColor: COLORS.white,
            borderRadius: 16,
            padding: 24,
          }}
        >
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

          {!!error && <Text accessibilityRole="alert" style={{ color: '#B42318', marginBottom: 14 }}>{error}</Text>}
          {busy && <ActivityIndicator color={COLORS.red} />}
          {step === 1 && (
            <CreateAccount formData={formData} updateField={updateField} onGoogleSignUp={handleGoogleSignUp} googleLinked={!!googleUser} busy={busy} />
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
            {!!formData.profileImage && <Image source={{ uri: formData.profileImage }} accessibilityLabel="Selected profile photo" style={{ width: 140, height: 140, borderRadius: 70 }} />}
            <Pressable accessibilityRole="button" disabled={busy} onPress={chooseProfilePhoto}><Text style={{ color: COLORS.red, padding: 12, fontWeight: '700' }}>{formData.profileImage ? 'Choose another photo' : 'Upload profile photo'}</Text></Pressable>
            {!!formData.profileImage && <Pressable disabled={busy} onPress={() => updateField('profileImage', '')}><Text>Remove photo</Text></Pressable>}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => handleCreateAccount(true)}><Text style={{ color: COLORS.textMuted, padding: 12 }}>Skip and create account</Text></Pressable>
          </View>}
          {step === 6 && <Success /> }

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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
