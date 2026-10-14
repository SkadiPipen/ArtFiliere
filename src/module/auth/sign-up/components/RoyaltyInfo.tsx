import { useState } from 'react';
import { View, Text, Pressable, Image } from "react-native";
import CalendarDateField from '@/components/CalendarDateField';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import type {
  SignUpFormData,
  UpdateSignUpField,
} from "@/module/auth/sign-up/types";

type RoyaltyInfoProps = {
  formData: SignUpFormData;
  updateField: UpdateSignUpField;
};

export default function RoyaltyInfo({
  formData,
  updateField,
}: RoyaltyInfoProps) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function pickFile() {
    setError(''); setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw Error('Unable to read this image. Please choose another image.');
      if (asset.base64.length > Math.ceil(5 * 1024 * 1024 / 3) * 4) throw Error('Please choose a business permit image smaller than 5 MB.');
      const mime = asset.base64.startsWith('iVBORw0KGgo') ? 'image/png' : asset.base64.startsWith('UklGR') ? 'image/webp' : 'image/jpeg';
      updateField('businessPermitImage', `data:${mime};base64,${asset.base64}`);
      updateField('royaltyFileName', asset.fileName || 'business-permit.jpg');
    } catch (e: any) { setError(e.message || 'Unable to open the image picker.'); }
    finally { setBusy(false); }
  }

  return (
    <View>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "700",
          color: COLORS.textDark,
          marginBottom: 6,
        }}
      >
        Apply for royalty access?
      </Text>
      <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
        You can use your account immediately. Royalty-based and hybrid commercial agreements require admin approval of your business permit. Access ends when the permit expires.
      </Text>

      <View style={{ flexDirection: "row", marginBottom: 20 }}>
        <Pressable
          onPress={() => updateField("wantsRoyalty", "yes")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginRight: 24,
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              borderWidth: 1.5,
              borderColor: COLORS.red,
              marginRight: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                formData.wantsRoyalty === "yes" ? COLORS.red : "transparent",
            }}
          >
            {formData.wantsRoyalty === "yes" && (
              <Ionicons name="checkmark" size={13} color={COLORS.white} />
            )}
          </View>
          <Text style={{ color: COLORS.textDark }}>Yes</Text>
        </Pressable>

        <Pressable
          onPress={() => updateField("wantsRoyalty", "no")}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              borderWidth: 1.5,
              borderColor: COLORS.red,
              marginRight: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                formData.wantsRoyalty === "no" ? COLORS.red : "transparent",
            }}
          >
            {formData.wantsRoyalty === "no" && (
              <Ionicons name="checkmark" size={13} color={COLORS.white} />
            )}
          </View>
          <Text style={{ color: COLORS.textDark }}>No</Text>
        </Pressable>
      </View>

      {formData.wantsRoyalty === "yes" && (
        <View>
          <Text
            style={{ fontSize: 13, color: COLORS.textDark, marginBottom: 8 }}
          >
            Business permit image (required). Upload a clear JPEG, PNG, or WebP image up to 5 MB. The reviewing admin can view your permit.
          </Text>

          <Pressable
            disabled={busy}
            onPress={pickFile}
            style={{
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: COLORS.border,
              borderRadius: 8,
              paddingVertical: 28,
              alignItems: "center",
              backgroundColor: COLORS.creamLight,
            }}
          >
            <Ionicons
              name="cloud-upload-outline"
              size={26}
              color={COLORS.textMuted}
            />
            <Text
              style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 8 }}
            >
              {formData.royaltyFileName
                ? formData.royaltyFileName
                : "Choose an image of your business permit"}
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 6,
                paddingHorizontal: 14,
                paddingVertical: 6,
                marginTop: 10,
                backgroundColor: COLORS.white,
              }}
            >
              <Text
                style={{
                  color: COLORS.textDark,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {busy ? 'Opening…' : 'Browse images'}
              </Text>
            </View>
          </Pressable>
          {!!formData.businessPermitImage && <Image source={{ uri: formData.businessPermitImage }} resizeMode="contain" accessibilityLabel="Selected business permit" style={{ width: '100%', height: 180, marginTop: 12 }} />}
          {!!error && <Text accessibilityRole="alert" style={{ color: COLORS.red }}>{error}</Text>}
          <Text style={{ marginTop: 14, marginBottom: 8, color: COLORS.textDark }}>Permit expiration date (required)</Text>
          <CalendarDateField label="Business permit expiration date" value={formData.permitExpiresOn} onChange={value => updateField('permitExpiresOn', value)} minimumDate={new Date(new Date().setHours(0, 0, 0, 0))} />
        </View>
      )}
    </View>
  );
}
