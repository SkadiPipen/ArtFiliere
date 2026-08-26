import { View, Text, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import type { SignUpFormData, UpdateSignUpField } from '@/module/auth/sign-up/types';

type ProfileInfoProps = {
  formData: SignUpFormData;
  updateField: UpdateSignUpField;
};

export default function ProfileInfo({ formData, updateField }: ProfileInfoProps) {
  return (
    <View>
      <TextInput
        style={inputStyle}
        placeholder="First Name"
        placeholderTextColor={COLORS.textMuted}
        value={formData.firstName}
        onChangeText={(text) => updateField('firstName', text)}
      />

      <TextInput
        style={inputStyle}
        placeholder="Middle Name"
        placeholderTextColor={COLORS.textMuted}
        value={formData.middleName}
        onChangeText={(text) => updateField('middleName', text)}
      />

      <TextInput
        style={inputStyle}
        placeholder="Last Name"
        placeholderTextColor={COLORS.textMuted}
        value={formData.lastName}
        onChangeText={(text) => updateField('lastName', text)}
      />

      <View style={{ position: 'relative', justifyContent: 'center' }}>
        <TextInput
          style={inputStyle}
          placeholder="Date of Birth (YYYY-MM-DD)"
          placeholderTextColor={COLORS.textMuted}
          value={formData.dateOfBirth}
          onChangeText={(text) => updateField('dateOfBirth', text)}
        />
        {/* TODO: swap this text input for @react-native-community/datetimepicker */}
        <Ionicons
          name="calendar-outline"
          size={18}
          color={COLORS.textMuted}
          style={{ position: 'absolute', right: 14 }}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', ...inputStyle, paddingVertical: 0 }}>
        <Text style={{ fontSize: 16, marginRight: 8 }}>🇵🇭</Text>
        <TextInput
          style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: COLORS.textDark }}
          placeholder="Contact Number"
          placeholderTextColor={COLORS.textMuted}
          value={formData.contactNumber}
          onChangeText={(text) => updateField('contactNumber', text)}
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
