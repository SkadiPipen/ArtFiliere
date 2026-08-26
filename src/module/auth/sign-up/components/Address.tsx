import { View, TextInput } from 'react-native';
import { COLORS } from '@/constants/colors';
import Dropdown from './Dropdown';
import type { SignUpFormData, UpdateSignUpField } from '@/module/auth/sign-up/types';
import {
  REGIONS,
  PROVINCES_BY_REGION,
  CITIES_BY_PROVINCE,
  BARANGAYS_BY_CITY,
  DEFAULT_BARANGAYS,
  AddressOption,
} from '@/constants/addresses';

type AddressProps = {
  formData: SignUpFormData;
  updateField: UpdateSignUpField;
};

function findCodeByName(options: AddressOption[], name: string): string | undefined {
  return options.find((option) => option.name === name)?.code;
}

export default function Address({ formData, updateField }: AddressProps) {
  const regionCode = findCodeByName(REGIONS, formData.region);
  const provinces = regionCode ? PROVINCES_BY_REGION[regionCode] ?? [] : [];

  const provinceCode = provinces.length
    ? findCodeByName(provinces, formData.province)
    : undefined;
  const cities = provinceCode ? CITIES_BY_PROVINCE[provinceCode] ?? [] : [];

  const cityCode = cities.length ? findCodeByName(cities, formData.city) : undefined;
  const barangays = cityCode
    ? BARANGAYS_BY_CITY[cityCode] ?? DEFAULT_BARANGAYS
    : DEFAULT_BARANGAYS;

  return (
    <View>
      <Dropdown
        placeholder="Region"
        value={formData.region}
        options={REGIONS}
        onSelect={(name) => {
          updateField('region', name);
          updateField('province', '');
          updateField('city', '');
          updateField('barangay', '');
        }}
      />

      <Dropdown
        placeholder="Province"
        value={formData.province}
        options={provinces}
        disabled={!formData.region}
        onSelect={(name) => {
          updateField('province', name);
          updateField('city', '');
          updateField('barangay', '');
        }}
      />

      <Dropdown
        placeholder="City / Municipality"
        value={formData.city}
        options={cities}
        disabled={!formData.province}
        onSelect={(name) => {
          updateField('city', name);
          updateField('barangay', '');
        }}
      />

      <TextInput
        style={inputStyle}
        placeholder="Postal Code"
        placeholderTextColor={COLORS.textMuted}
        value={formData.postalCode}
        onChangeText={(text) => updateField('postalCode', text)}
        keyboardType="number-pad"
      />

      <Dropdown
        placeholder="Barangay"
        value={formData.barangay}
        options={barangays}
        disabled={!formData.city}
        onSelect={(name) => updateField('barangay', name)}
      />

      <TextInput
        style={inputStyle}
        placeholder="Street"
        placeholderTextColor={COLORS.textMuted}
        value={formData.street}
        onChangeText={(text) => updateField('street', text)}
      />
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
