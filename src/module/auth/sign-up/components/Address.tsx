import {
  AddressOption,
  getBarangaysByCity,
  getCitiesByProvince,
  getProvincesByRegion,
  getRegions,
  isEligibleForDelivery,
} from '@/constants/addresses';
import { COLORS } from '@/constants/colors';
import type { SignUpFormData, UpdateSignUpField } from '@/module/auth/sign-up/types';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import Dropdown from './Dropdown';

type AddressProps = {
  formData: SignUpFormData;
  updateField: UpdateSignUpField;
};

export default function Address({ formData, updateField }: AddressProps) {
  // Option lists
  const [regions, setRegions] = useState<AddressOption[]>([]);
  const [provinces, setProvinces] = useState<AddressOption[]>([]);
  const [cities, setCities] = useState<AddressOption[]>([]);
  const [barangays, setBarangays] = useState<AddressOption[]>([]);

  // Selected codes for fetching children
  const [selectedRegionCode, setSelectedRegionCode] = useState<string>('');
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<string>('');
  const [selectedCityCode, setSelectedCityCode] = useState<string>('');

  // Loading indicators
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  // Load Regions on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingRegions(true);
    getRegions()
      .then((data) => {
        if (isMounted) setRegions(data);
      })
      .finally(() => {
        if (isMounted) setLoadingRegions(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Load Provinces when region changes
  const handleSelectRegion = async (regionName: string) => {
    updateField('region', regionName);
    updateField('province', '');
    updateField('city', '');
    updateField('barangay', '');
    setProvinces([]);
    setCities([]);
    setBarangays([]);

    const found = regions.find((r) => r.name === regionName);
    if (!found) return;

    setSelectedRegionCode(found.code);
    setLoadingProvinces(true);
    const data = await getProvincesByRegion(found.code);
    setProvinces(data);
    setLoadingProvinces(false);
  };

  // Load Cities when province changes
  const handleSelectProvince = async (provName: string) => {
    updateField('province', provName);
    updateField('city', '');
    updateField('barangay', '');
    setCities([]);
    setBarangays([]);

    const found = provinces.find((p) => p.name === provName);
    if (!found) return;

    setSelectedProvinceCode(found.code);
    setLoadingCities(true);
    const data = await getCitiesByProvince(found.code, selectedRegionCode);
    setCities(data);
    setLoadingCities(false);
  };

  // Load Barangays when city changes
  const handleSelectCity = async (cityName: string) => {
    updateField('city', cityName);
    updateField('barangay', '');
    setBarangays([]);

    const found = cities.find((c) => c.name === cityName);
    if (!found) return;

    setSelectedCityCode(found.code);
    setLoadingBarangays(true);
    const data = await getBarangaysByCity(found.code);
    setBarangays(data);
    setLoadingBarangays(false);
  };

  const deliveryEligible = isEligibleForDelivery(formData.province, formData.city);

  return (
    <View>
      {/* Delivery Notice Badge */}
      {formData.province ? (
        <View
          style={{
            padding: 10,
            borderRadius: 8,
            marginBottom: 14,
            backgroundColor: deliveryEligible ? '#E8F5E9' : '#FFF3E0',
            borderWidth: 1,
            borderColor: deliveryEligible ? '#C8E6C9' : '#FFE0B2',
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: deliveryEligible ? '#2E7D32' : '#E65100',
            }}
          >
            {deliveryEligible
              ? '✓ Physical Delivery Available in your area (Cebu Courier Zone)'
              : 'ℹ Digital Access Only — ArtFiliere physical delivery is currently exclusive to Cebu residents.'}
          </Text>
        </View>
      ) : null}

      {/* Region */}
      {loadingRegions ? (
        <ActivityIndicator color={COLORS.red || '#BC5454'} style={{ marginBottom: 14 }} />
      ) : (
        <Dropdown
          placeholder="Region"
          value={formData.region}
          options={regions}
          onSelect={handleSelectRegion}
        />
      )}

      {/* Province */}
      {loadingProvinces ? (
        <ActivityIndicator color={COLORS.red || '#BC5454'} style={{ marginBottom: 14 }} />
      ) : (
        <Dropdown
          placeholder="Province"
          value={formData.province}
          options={provinces}
          disabled={!formData.region}
          onSelect={handleSelectProvince}
        />
      )}

      {/* City / Municipality */}
      {loadingCities ? (
        <ActivityIndicator color={COLORS.red || '#BC5454'} style={{ marginBottom: 14 }} />
      ) : (
        <Dropdown
          placeholder="City / Municipality"
          value={formData.city}
          options={cities}
          disabled={!formData.province}
          onSelect={handleSelectCity}
        />
      )}

      <TextInput
        style={inputStyle}
        placeholder="Postal Code"
        placeholderTextColor={COLORS.textMuted}
        value={formData.postalCode}
        onChangeText={(text) => updateField("postalCode", text)}
        keyboardType="number-pad"
      />

      {/* Barangay */}
      {loadingBarangays ? (
        <ActivityIndicator color={COLORS.red || '#BC5454'} style={{ marginBottom: 14 }} />
      ) : (
        <Dropdown
          placeholder="Barangay"
          value={formData.barangay}
          options={barangays}
          disabled={!formData.city}
          onSelect={(name) => updateField('barangay', name)}
        />
      )}

      <TextInput
        style={inputStyle}
        placeholder="Street / Unit / Building"
        placeholderTextColor={COLORS.textMuted}
        value={formData.street}
        onChangeText={(text) => updateField("street", text)}
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