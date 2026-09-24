import { View, Text, Pressable } from "react-native";
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
  function pickFile() {
    // TODO: wire an actual file/image picker, e.g. expo-document-picker
    // or expo-image-picker, and upload the real file as multipart/form-data
    // to match the backend's royalty_proof FileField.
    updateField("royaltyFileName", "id-sample.jpg");
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
        Do you want to apply for Royalty Percentage?
      </Text>
      <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
        Royalty mapping and information of royalty percentage.
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
            Upload a file or image of your ID within a proof to make your
            application for royalty approve.
          </Text>

          <Pressable
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
                : "or drag a file or image to upload and select"}
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
                Browse
              </Text>
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}
