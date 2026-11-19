import { Text, TextInput } from '@/components/Typography';
import { COLORS } from "@/constants/colors";
import { getSignupPasswordError } from "@/services/signupPassword";
import type {
  SignUpFormData,
  UpdateSignUpField,
} from "@/module/auth/sign-up/types";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";

type CreateAccountProps = {
  busy?: boolean;
  formData: SignUpFormData;
  updateField: UpdateSignUpField;
};

export default function CreateAccount({
  formData,
  updateField,
  busy = false,
}: CreateAccountProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const passwordHint = formData.password ? getSignupPasswordError(formData.password) : null;
  const passwordsMismatch = !!formData.confirmPassword && formData.password !== formData.confirmPassword;

  return (
    <View>
      <TextInput
        style={inputStyle}
        placeholder="Username"
        placeholderTextColor={COLORS.textMuted}
        value={formData.username}
        onChangeText={(text) => updateField("username", text)}
        autoCapitalize="none"
      />

      <TextInput
        style={inputStyle}
        placeholder="Email"
        placeholderTextColor={COLORS.textMuted}
        value={formData.email}
        onChangeText={(text) => updateField("email", text)}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!busy}
      />

      {(passwordHint || passwordsMismatch) && (
        <Text accessibilityLiveRegion="polite" style={{ color: COLORS.red, fontSize: 12, marginBottom: 6 }}>
          {passwordHint || "Passwords do not match."}
        </Text>
      )}
      <View style={{ position: "relative", justifyContent: "center" }}>
        <TextInput
          style={passwordInputStyle}
          placeholder="Password"
          placeholderTextColor={COLORS.textMuted}
          value={formData.password}
          onChangeText={(text) => updateField("password", text)}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          secureTextEntry={!showPassword}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          onPress={() => setShowPassword((visible) => !visible)}
          style={visibilityButtonStyle}
        >
          <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.textDark} />
        </Pressable>
      </View>

      <View style={{ position: "relative", justifyContent: "center" }}>
        <TextInput
          style={passwordInputStyle}
          placeholder="Confirm password"
          placeholderTextColor={COLORS.textMuted}
          value={formData.confirmPassword}
          onChangeText={(text) => updateField("confirmPassword", text)}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!showConfirmPassword}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}
          onPress={() => setShowConfirmPassword((visible) => !visible)}
          style={visibilityButtonStyle}
        >
          <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.textDark} />
        </Pressable>
      </View>
      <Text
        style={{ marginTop: 8, fontSize: 11, color: COLORS.textMuted, textAlign: "center" }}
      >
        By signing up, you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: COLORS.red,
  backgroundColor: COLORS.white,
  borderRadius: 8,
  paddingHorizontal: 14,
  paddingVertical: 12,
  marginBottom: 14,
  fontSize: 15,
  color: COLORS.textDark,
};

const passwordInputStyle = { ...inputStyle, paddingRight: 48 };

const visibilityButtonStyle = {
  position: "absolute",
  right: 0,
  top: 0,
  bottom: inputStyle.marginBottom,
  width: 44,
  alignItems: "center",
  justifyContent: "center",
} as const;
