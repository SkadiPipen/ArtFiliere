import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import type {
  SignUpFormData,
  UpdateSignUpField,
} from "@/module/auth/sign-up/types";

type CreateAccountProps = {
  formData: SignUpFormData;
  updateField: UpdateSignUpField;
};

export default function CreateAccount({
  formData,
  updateField,
}: CreateAccountProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      />

      <View style={{ position: "relative", justifyContent: "center" }}>
        <TextInput
          style={inputStyle}
          placeholder="Password"
          placeholderTextColor={COLORS.textMuted}
          value={formData.password}
          onChangeText={(text) => updateField("password", text)}
          secureTextEntry={!showPassword}
        />
        <Pressable
          onPress={() => setShowPassword((prev) => !prev)}
          style={{ position: "absolute", right: 14 }}
        >
          <Ionicons
            name={showPassword ? "eye-off" : "eye"}
            size={18}
            color={COLORS.textMuted}
          />
        </Pressable>
      </View>

      <View style={{ position: "relative", justifyContent: "center" }}>
        <TextInput
          style={inputStyle}
          placeholder="Confirm password"
          placeholderTextColor={COLORS.textMuted}
          value={formData.confirmPassword}
          onChangeText={(text) => updateField("confirmPassword", text)}
          secureTextEntry={!showConfirmPassword}
        />
        <Pressable
          onPress={() => setShowConfirmPassword((prev) => !prev)}
          style={{ position: "absolute", right: 14 }}
        >
          <Ionicons
            name={showConfirmPassword ? "eye-off" : "eye"}
            size={18}
            color={COLORS.textMuted}
          />
        </Pressable>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginVertical: 16,
        }}
      >
        <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
        <Text
          style={{
            marginHorizontal: 10,
            color: COLORS.textMuted,
            fontSize: 12,
          }}
        >
          or sign up with
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
      </View>

      <Pressable
        style={{
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 8,
          paddingVertical: 12,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 14,
        }}
        onPress={() => {
          // TODO: wire signInWithPopup(GoogleAuthProvider) from @/services/auth
        }}
      >
        <Ionicons
          name="logo-google"
          size={18}
          color={COLORS.textDark}
          style={{ marginRight: 8 }}
        />
        <Text style={{ color: COLORS.textDark, fontWeight: "600" }}>
          Sign Up with Google
        </Text>
      </Pressable>

      <Text
        style={{ fontSize: 11, color: COLORS.textMuted, textAlign: "center" }}
      >
        By signing up, you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: COLORS.border,
  backgroundColor: COLORS.creamLight,
  borderRadius: 8,
  paddingHorizontal: 14,
  paddingVertical: 12,
  marginBottom: 14,
  fontSize: 15,
  color: COLORS.textDark,
};
