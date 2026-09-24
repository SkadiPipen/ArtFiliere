import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { ArrowLeft, Camera } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export default function EditProfile() {
  const router = useRouter();
  const user = auth.currentUser;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 768;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    username: "",
    firstName: "",
    lastName: "",
    contact: "",
    street: "",
    profileImage: null as string | null,
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${API_URL}/auth/me/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          setForm({
            username: data.username || user.displayName?.split(" ")[0] || "",
            firstName: data.first_name || data.firstName || "",
            lastName: data.last_name || data.lastName || "",
            contact: data.contact_number || data.contact || "",
            street: data.address?.street || data.street || "",
            profileImage:
              data.profile_image || data.profileImage || user.photoURL || null,
          });
        } else {
          setForm((prev) => ({
            ...prev,
            username: user.email?.split("@")[0] || "",
            profileImage: user.photoURL || null,
          }));
        }
      } catch (e) {
        console.log("Failed to fetch profile:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const pickImage = async () => {
    if (Platform.OS === "web") {
      await openLibrary();
      return;
    }

    Alert.alert("Profile Photo", "Choose an option", [
      { text: "Camera", onPress: openCamera },
      { text: "Gallery", onPress: openLibrary },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Camera permission is needed.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      setForm((prev) => ({ ...prev, profileImage: result.assets[0].uri }));
    }
  };

  const openLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      setForm((prev) => ({ ...prev, profileImage: result.assets[0].uri }));
    }
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(home)/profile");
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.firstName.trim() || !form.lastName.trim()) {
      if (Platform.OS === "web") {
        alert("First and last name cannot be empty.");
      } else {
        Alert.alert("Required", "First and last name cannot be empty.");
      }
      return;
    }

    setSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${API_URL}/auth/me/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: form.username,
          first_name: form.firstName,
          last_name: form.lastName,
          contact_number: form.contact,
          street: form.street,
        }),
      });

      if (!response.ok) throw new Error("Save failed");

      if (Platform.OS === "web") {
        alert("Profile updated successfully!");
        handleGoBack();
      } else {
        Alert.alert("Success!", "Profile updated successfully!", [
          { text: "OK", onPress: handleGoBack },
        ]);
      }
    } catch (e) {
      if (Platform.OS === "web") {
        alert("Failed to save profile changes.");
      } else {
        Alert.alert("Error", "Failed to save profile changes.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#C15656" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.headerBtn} onPress={handleGoBack}>
            <ArrowLeft color="#fff" size={22} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile Settings</Text>
          <View style={{ width: 32 }} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={true}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 130 + insets.bottom },
        ]}
      >
        <View style={[styles.mainLayout, isDesktop && styles.desktopLayout]}>
          {/* LEFT SIDE (WEB) / TOP SIDE (MOBILE): COVER & AVATAR CARD */}
          <View
            style={[styles.avatarCard, isDesktop && styles.desktopAvatarCard]}
          >
            <View style={styles.coverBanner} />
            <View style={styles.avatarSection}>
              <TouchableOpacity
                style={styles.avatarWrap}
                onPress={pickImage}
                activeOpacity={0.8}
              >
                <Image
                  source={{
                    uri:
                      form.profileImage ||
                      "https://i.pravatar.cc/150?u=default",
                  }}
                  style={styles.avatar}
                />
                <View style={styles.cameraBadge}>
                  <Camera color="#fff" size={16} />
                </View>
              </TouchableOpacity>
              <Text style={styles.profileNameDisplay}>
                {form.firstName || form.lastName
                  ? `${form.firstName} ${form.lastName}`.trim()
                  : "Your Name"}
              </Text>
              <Text style={styles.profileHandleDisplay}>
                @{form.username || "username"}
              </Text>

              <TouchableOpacity
                style={styles.changePhotoBtn}
                onPress={pickImage}
              >
                <Camera color="#C15656" size={14} />
                <Text style={styles.changePhotoText}>Upload New Photo</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* RIGHT SIDE (WEB) / BOTTOM SIDE (MOBILE): EDIT FORM CARD */}
          <View style={[styles.formCard, isDesktop && styles.desktopFormCard]}>
            <Text style={styles.cardHeaderTitle}>Personal Information</Text>
            <Text style={styles.cardHeaderSub}>
              Update your account details and default delivery address.
            </Text>

            <View style={styles.formGrid}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={form.username}
                  onChangeText={(val) =>
                    setForm((prev) => ({ ...prev, username: val }))
                  }
                  placeholder="Enter username"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={[styles.rowGrid, isDesktop && styles.rowGridSplit]}>
                <View style={[styles.inputGroup, isDesktop && { flex: 1 }]}>
                  <Text style={styles.label}>First Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.firstName}
                    onChangeText={(val) =>
                      setForm((prev) => ({ ...prev, firstName: val }))
                    }
                    placeholder="Enter first name"
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={[styles.inputGroup, isDesktop && { flex: 1 }]}>
                  <Text style={styles.label}>Last Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.lastName}
                    onChangeText={(val) =>
                      setForm((prev) => ({ ...prev, lastName: val }))
                    }
                    placeholder="Enter last name"
                    placeholderTextColor="#999"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Contact Number</Text>
                <View style={styles.phoneRow}>
                  <Text style={styles.phonePrefix}>+63</Text>
                  <TextInput
                    style={styles.phoneInput}
                    value={form.contact}
                    onChangeText={(val) =>
                      setForm((prev) => ({ ...prev, contact: val }))
                    }
                    keyboardType="phone-pad"
                    maxLength={10}
                    placeholder="9XXXXXXXXX"
                    placeholderTextColor="#999"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Street / Barangay</Text>
                <TextInput
                  style={styles.input}
                  value={form.street}
                  onChangeText={(val) =>
                    setForm((prev) => ({ ...prev, street: val }))
                  }
                  placeholder="Enter street or barangay"
                  placeholderTextColor="#999"
                />
              </View>

              {/* SAVE BUTTON */}
              <TouchableOpacity
                style={[styles.saveButton, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.saveButtonText}>
                      Save Profile Changes
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F7" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  header: {
    backgroundColor: "#C15656",
    width: "100%",
    alignItems: "center",
    paddingVertical: 14,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  headerInner: {
    width: "100%",
    maxWidth: 1100,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBtn: { padding: 4 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  scrollContent: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  mainLayout: {
    width: "100%",
    maxWidth: 1100,
    gap: 20,
  },
  desktopLayout: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  avatarCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  desktopAvatarCard: {
    width: 340,
  },
  coverBanner: {
    height: 90,
    backgroundColor: "#D48C62",
  },
  avatarSection: {
    alignItems: "center",
    marginTop: -45,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  avatarWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    position: "relative",
    borderWidth: 4,
    borderColor: "#fff",
    backgroundColor: "#fff",
    elevation: 3,
  },
  avatar: { width: "100%", height: "100%", borderRadius: 45 },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#C15656",
    borderRadius: 12,
    width: 26,
    height: 26,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  profileNameDisplay: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1A202C",
    marginTop: 10,
    textAlign: "center",
  },
  profileHandleDisplay: {
    fontSize: 13,
    color: "#718096",
    marginTop: 2,
    marginBottom: 16,
  },
  changePhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "#FED7D7",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  changePhotoText: {
    color: "#C15656",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  formCard: {
    flex: 1,
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  desktopFormCard: {
    padding: 32,
  },
  cardHeaderTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1A202C",
  },
  cardHeaderSub: {
    fontSize: 13,
    color: "#718096",
    marginTop: 4,
    marginBottom: 20,
  },
  formGrid: {
    gap: 16,
  },
  rowGrid: {
    gap: 16,
  },
  rowGridSplit: {
    flexDirection: "row",
  },
  inputGroup: {},
  label: {
    color: "#2D3748",
    fontWeight: "600",
    marginBottom: 6,
    fontSize: 13,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 15,
    backgroundColor: "#FAFAFA",
    fontSize: 14,
    color: "#1A202C",
  },
  phoneRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 15,
    backgroundColor: "#FAFAFA",
  },
  phonePrefix: {
    color: "#4A5568",
    marginRight: 8,
    fontWeight: "bold",
    fontSize: 14,
  },
  phoneInput: { flex: 1, fontSize: 14, color: "#1A202C" },
  saveButton: {
    width: "100%",
    backgroundColor: "#C15656",
    height: 50,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    elevation: 2,
  },
  saveButtonText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
});
