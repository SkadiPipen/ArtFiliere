import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import Toast from "@/components/Toast";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { ArrowLeft, ImagePlus, Plus, Sparkles } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ART_TYPES = ["Physical", "Digital"];

type ToastState = {
  visible: boolean;
  message: string;
  type: "success" | "error";
};

export default function ArtistPostScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [imageData, setImageData] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Painting");
  const [price, setPrice] = useState("");
  const [artType, setArtType] = useState("Physical");
  const [tags, setTags] = useState<string[]>([]);
  const [generatingTags, setGeneratingTags] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: "",
    type: "success",
  });

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => setToast((prev) => ({ ...prev, visible: false }));

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setImageData(
        `data:${result.assets[0].mimeType || "image/jpeg"};base64,${result.assets[0].base64}`,
      );
    }
  };

  const generateTags = async () => {
    if (description.trim().length < 20 || generatingTags) return;
    try {
      setGeneratingTags(true);
      const user = auth.currentUser;
      if (!user) return;
      const response = await fetch(
        `${API_URL}/api/users/artworks/suggest-tags/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ description }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTags(data.tags || []);
    } catch (error: any) {
      showToast(error.message || "Unable to generate tags right now.", "error");
    } finally {
      setGeneratingTags(false);
    }
  };

  const submit = async () => {
    if (!imageData || !title.trim() || !description.trim() || !price.trim()) {
      return showToast(
        "Add an image, artwork name, description, and price.",
        "error",
      );
    }
    try {
      setSaving(true);
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in again.");
      const token = await user.getIdToken();
      const response = await fetch(`${API_URL}/api/users/artworks/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_data: imageData,
          title,
          description,
          category: `${category} · ${artType}${tags.length ? ` · ${tags.join(", ")}` : ""}`,
          price,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showToast(
        data.similarity_review_required
          ? "Submitted and held for similarity review before approval."
          : "Sent to the Creative Moderator for review.",
        "success",
      );
      setTimeout(() => router.replace("/(home)"), 500);
    } catch (error: any) {
      showToast(error.message || "Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color="#D75B5C" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create a post</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, width < 700 && styles.cardMobile]}>
          <View style={[styles.assetsPanel, width < 700 && styles.panelMobile]}>
            <Text style={styles.panelTitle}>ASSET PHOTOS</Text>
            <Text style={styles.label}>Upload Asset Images:</Text>
            <View style={styles.photoRow}>
              <TouchableOpacity style={styles.primaryPhoto} onPress={pickImage}>
                {imageData ? (
                  <Image
                    source={{ uri: imageData }}
                    style={styles.selectedImage}
                  />
                ) : (
                  <Plus size={38} color="#D75B5C" />
                )}
              </TouchableOpacity>
              {[1, 2, 3].map((slot) => (
                <TouchableOpacity
                  key={slot}
                  style={styles.emptyPhoto}
                  onPress={pickImage}
                >
                  <ImagePlus size={18} color="#D8C9A9" />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.helper}>
              Your first image is used as the artwork cover.
            </Text>
            <View style={styles.rule} />
            <Text style={styles.soldTitle}>SOLD VIA</Text>
            <View style={styles.saleRow}>
              <View style={styles.saleSelected}>
                <Text style={styles.saleSelectedText}>Auction</Text>
              </View>
              <View style={styles.saleOption}>
                <Text style={styles.saleOptionText}>Sell & Buy</Text>
              </View>
            </View>
          </View>

          <View
            style={[styles.detailsPanel, width < 700 && styles.panelMobile]}
          >
            <Text style={styles.panelTitle}>ASSET DETAILS</Text>
            <Text style={styles.label}>Art Piece Name:</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Name your artwork"
            />
            <Text style={styles.label}>Type of Art:</Text>
            <View style={styles.pillRow}>
              {ART_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setArtType(type)}
                  style={[
                    styles.typePill,
                    artType === type && styles.typePillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeText,
                      artType === type && styles.typeTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.tagHeader}>
              <Text style={styles.label}>AI-generated tags:</Text>
              {generatingTags && (
                <ActivityIndicator size="small" color="#D75B5C" />
              )}
            </View>
            <View style={styles.tagRow}>
              {tags.length ? (
                tags.map((tag) => (
                  <View key={tag} style={[styles.tag, styles.tagActive]}>
                    <Text style={[styles.tagText, styles.tagTextActive]}>
                      {tag.replace(/_/g, " ")}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.tagHint}>
                  Write a description to generate tags automatically.
                </Text>
              )}
            </View>
            <Text style={styles.label}>Description:</Text>
            <TextInput
              style={[styles.input, styles.description]}
              value={description}
              onChangeText={setDescription}
              onEndEditing={generateTags}
              multiline
              placeholder="Tell buyers about this piece..."
            />
            <TouchableOpacity
              style={styles.generateButton}
              onPress={generateTags}
              disabled={generatingTags || description.trim().length < 20}
            >
              <Sparkles size={14} color="#D75B5C" />
              <Text style={styles.generateText}>
                {generatingTags ? "Generating tags..." : "Generate tags"}
              </Text>
            </TouchableOpacity>
            <View style={styles.rule} />
            <Text style={styles.pricingTitle}>PRICING</Text>
            <Text style={styles.label}>Category:</Text>
            <TextInput
              style={styles.input}
              value={category}
              onChangeText={setCategory}
              placeholder="Painting, Photography..."
            />
            <Text style={styles.label}>Price (PHP):</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            <Text style={styles.pricePreview}>
              Price: Php. {price || "0000.00"}
            </Text>
            <TouchableOpacity
              style={styles.submit}
              disabled={saving}
              onPress={submit}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Submit for review</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFCF0" },
  header: {
    height: 58,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#E7D8D0",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#382D29" },
  scroll: { padding: 18, alignItems: "center" },
  card: {
    width: "100%",
    maxWidth: 940,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    shadowColor: "#5A4438",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  cardMobile: { flexDirection: "column" },
  assetsPanel: {
    width: "43%",
    minWidth: 280,
    backgroundColor: "#FFF7C7",
    padding: 28,
  },
  detailsPanel: { flex: 1, padding: 28, minWidth: 310 },
  panelMobile: { width: "100%", minWidth: 0 },
  panelTitle: {
    color: "#D75B5C",
    fontWeight: "900",
    fontSize: 18,
    marginBottom: 13,
  },
  label: {
    color: "#E97878",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 8,
  },
  photoRow: { flexDirection: "row", gap: 9, alignItems: "center" },
  primaryPhoto: {
    width: 72,
    height: 72,
    backgroundColor: "#FFF",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#DCCFB4",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  emptyPhoto: {
    width: 50,
    height: 50,
    backgroundColor: "#FFF",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#DCCFB4",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedImage: { width: "100%", height: "100%" },
  helper: { color: "#8D7D70", fontSize: 11, marginTop: 9 },
  rule: {
    height: 1,
    backgroundColor: "#E77171",
    marginTop: 24,
    marginBottom: 10,
  },
  soldTitle: { color: "#D75B5C", fontWeight: "900", fontSize: 17 },
  saleRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  saleSelected: {
    backgroundColor: "#D75B5C",
    borderRadius: 16,
    paddingHorizontal: 25,
    paddingVertical: 6,
  },
  saleOption: {
    borderColor: "#E0D5D1",
    borderWidth: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingHorizontal: 25,
    paddingVertical: 6,
  },
  saleSelectedText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  saleOptionText: { color: "#D75B5C", fontSize: 12, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#DDD4CF",
    borderRadius: 6,
    paddingHorizontal: 10,
    minHeight: 35,
    color: "#3D302D",
    backgroundColor: "#FFF",
  },
  pillRow: { flexDirection: "row", gap: 8 },
  typePill: {
    borderWidth: 1,
    borderColor: "#D8CFCA",
    borderRadius: 18,
    paddingVertical: 5,
    paddingHorizontal: 22,
  },
  typePillActive: { backgroundColor: "#FFF3F1", borderColor: "#D75B5C" },
  typeText: { color: "#A98F89", fontSize: 12 },
  typeTextActive: { color: "#D75B5C", fontWeight: "800" },
  tagHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  tagRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tag: {
    backgroundColor: "#F5E5E1",
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  tagActive: { backgroundColor: "#D75B5C" },
  tagText: { color: "#B46A65", fontSize: 12, fontWeight: "700" },
  tagTextActive: { color: "#FFF" },
  tagHint: { color: "#A8958E", fontSize: 11, marginTop: 4 },
  generateButton: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 8,
    paddingVertical: 5,
  },
  generateText: { color: "#D75B5C", fontSize: 12, fontWeight: "800" },
  description: { minHeight: 72, textAlignVertical: "top" },
  pricingTitle: { color: "#D75B5C", fontSize: 17, fontWeight: "900" },
  pricePreview: {
    color: "#D75B5C",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
  },
  submit: {
    alignSelf: "flex-end",
    backgroundColor: "#D75B5C",
    borderRadius: 7,
    paddingVertical: 10,
    paddingHorizontal: 25,
    marginTop: 12,
  },
  submitText: { color: "#FFF", fontWeight: "800" },
});
