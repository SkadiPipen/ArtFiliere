import { Text, TextInput } from '@/components/Typography';
import CalendarDateField from '@/components/CalendarDateField';
import { View } from "react-native";
import { COLORS } from "@/constants/colors";
import type {
  SignUpFormData,
  UpdateSignUpField,
} from "@/module/auth/sign-up/types";

type ProfileInfoProps = {
  formData: SignUpFormData;
  updateField: UpdateSignUpField;
};

export default function ProfileInfo({
  formData,
  updateField,
}: ProfileInfoProps) {
  return (
    <View>
      <TextInput
        style={inputStyle}
        placeholder="First Name"
        placeholderTextColor={COLORS.textMuted}
        value={formData.firstName}
        onChangeText={(text) => updateField("firstName", text)}
      />

      <TextInput
        style={inputStyle}
        placeholder="Middle Name"
        placeholderTextColor={COLORS.textMuted}
        value={formData.middleName}
        onChangeText={(text) => updateField("middleName", text)}
      />

      <TextInput
        style={inputStyle}
        placeholder="Last Name"
        placeholderTextColor={COLORS.textMuted}
        value={formData.lastName}
        onChangeText={(text) => updateField("lastName", text)}
      />

      <View style={{ marginBottom: 14, gap: 6 }}>
        <CalendarDateField appearance="signup" label="Date of Birth" value={formData.dateOfBirth} onChange={value => updateField('dateOfBirth', value)} maximumDate={new Date()} />
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          ...inputStyle,
          paddingVertical: 0,
        }}
      >
        <Text style={{ fontSize: 16, marginRight: 8 }}>🇵🇭</Text>
        <TextInput
          style={{
            flex: 1,
            paddingVertical: 12,
            fontSize: 15,
            color: COLORS.textDark,
          }}
          placeholder="Contact Number"
          placeholderTextColor={COLORS.textMuted}
          value={formData.contactNumber}
          onChangeText={(text) => updateField("contactNumber", text)}
          keyboardType="phone-pad"
        />
      </View>
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
