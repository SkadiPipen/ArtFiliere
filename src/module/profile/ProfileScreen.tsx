import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { useRouter } from "expo-router";
import { signOut, User } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import ProfileHeader from "@/module/profile/components/ProfileHeader";
import PurchaseGallery from "@/module/profile/components/PurchaseGallery";
import TransactionGrid from "@/module/profile/components/TransactionGrid";
import WalletCard from "@/module/profile/components/WalletCard";

export default function UserProfile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profileData, setProfileData] = useState<any>(null);
  const [defaultHourlyRate, setDefaultHourlyRate] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfileFromDjango();
  }, []);

  const fetchProfileFromDjango = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_URL}/auth/me/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProfileData(data);
        setDefaultHourlyRate(data.default_hourly_rate || "");
      }
    } catch (error) {
      console.log("Error fetching profile from Django:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await signOut(auth);
          router.replace("/login");
        },
      },
    ]);
  };

  const setCommissionAvailability = async (enabled: boolean) => {
    if (!auth.currentUser) return;
    const previous = Boolean(profileData?.is_accepting_commissions);
    setProfileData((current: any) => ({
      ...current,
      is_accepting_commissions: enabled,
    }));
    try {
      const response = await fetch(`${API_URL}/auth/me/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_accepting_commissions: enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    } catch (error: any) {
      setProfileData((current: any) => ({
        ...current,
        is_accepting_commissions: previous,
      }));
      Alert.alert(
        "Commission availability",
        error.message || "Could not update your availability.",
      );
    }
  };

  const saveDefaultHourlyRate = async () => {
    if (!auth.currentUser) return;
    const previous = profileData?.default_hourly_rate || "";
    const next = defaultHourlyRate.trim();
    if (next === previous) return;
    try {
      const response = await fetch(`${API_URL}/auth/me/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ default_hourly_rate: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProfileData((current: any) => ({
        ...current,
        default_hourly_rate: next,
      }));
    } catch (error: any) {
      setDefaultHourlyRate(previous);
      Alert.alert(
        "Default hourly rate",
        error.message || "Could not update your default rate.",
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#C15656" />
      </View>
    );
  }

  // Browsing the marketplace does not require an account. Account-only details
  // such as the wallet and purchase history should not be shown to a guest.
  if (!user) {
    return (
      <View style={styles.guestContainer}>
        <Text style={styles.guestTitle}>Welcome to ArtFiliere</Text>
        <Text style={styles.guestBody}>
          Browse artworks as a guest. Create an account or log in when you are
          ready to message an artist, purchase artwork, or view your wallet.
        </Text>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.push("/login")}
        >
          <Text style={styles.loginButtonText}>Log in</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signUpButton}
          onPress={() => router.push("/sign-up")}
        >
          <Text style={styles.signUpButtonText}>Create an account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace("/(home)")}>
          <Text style={styles.continueBrowsing}>Continue browsing</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ProfileHeader
          userRole={profileData?.role || "Buyer"}
          profileData={profileData}
          user={user}
          onLogout={handleLogout}
        />

        <View style={styles.contentBody}>
          <WalletCard />
          {profileData?.role === "artist" && (
            <>
              <View style={styles.availabilityCard}>
                <View style={styles.availabilityCopy}>
                  <Text style={styles.availabilityTitle}>
                    Accepting commissions
                  </Text>
                  <Text style={styles.availabilityText}>
                    {profileData?.is_accepting_commissions
                      ? "Buyers can find you and send a commission request."
                      : "You are hidden from the commission directory until you turn this on."}
                  </Text>
                </View>
                <Switch
                  value={Boolean(profileData?.is_accepting_commissions)}
                  onValueChange={setCommissionAvailability}
                  trackColor={{ false: "#D9D2CD", true: "#7EAD83" }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.defaultRateCard}>
                <Text style={styles.defaultRateTitle}>Default hourly rate</Text>
                <Text style={styles.defaultRateHelp}>
                  Used to prefill future Buy & Sell posts. You can change the
                  rate for any individual artwork.
                </Text>
                <TextInput
                  value={defaultHourlyRate}
                  onChangeText={setDefaultHourlyRate}
                  onBlur={saveDefaultHourlyRate}
                  placeholder="PHP per hour"
                  placeholderTextColor="#AA9A94"
                  keyboardType="decimal-pad"
                  style={styles.defaultRateInput}
                />
              </View>
              <TouchableOpacity
                style={styles.portfolioButton}
                onPress={() => router.push("/my-portfolio")}
              >
                <Text style={styles.portfolioButtonText}>
                  View my portfolio
                </Text>
              </TouchableOpacity>
            </>
          )}
          <TransactionGrid role={profileData?.role} />
          <PurchaseGallery />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  scrollContent: {
    alignItems: "center",
    paddingBottom: 120,
  },
  contentBody: {
    width: "100%",
    maxWidth: 1200,
    paddingHorizontal: 20,
  },
  availabilityCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8DCD4",
    borderRadius: 14,
    padding: 16,
    marginTop: 18,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  availabilityCopy: { flex: 1 },
  availabilityTitle: { color: "#3A2D2A", fontSize: 15, fontWeight: "800" },
  availabilityText: {
    color: "#7A6C66",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  defaultRateCard: {
    backgroundColor: "#FFF9F0",
    borderWidth: 1,
    borderColor: "#E8DCD4",
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
  },
  defaultRateTitle: { color: "#3A2D2A", fontSize: 15, fontWeight: "800" },
  defaultRateHelp: {
    color: "#75655F",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  defaultRateInput: {
    color: "#3A2D2A",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDCEC5",
    borderRadius: 10,
    fontSize: 13,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  portfolioButton: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF3F1",
    borderColor: "#C15656",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 10,
  },
  portfolioButtonText: { color: "#C15656", fontSize: 12, fontWeight: "800" },
  guestContainer: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  guestTitle: {
    color: "#3A2D2A",
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
  },
  guestBody: {
    color: "#75655F",
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 380,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 28,
  },
  loginButton: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#C15656",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 14,
  },
  loginButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  signUpButton: {
    width: "100%",
    maxWidth: 360,
    borderColor: "#C15656",
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 13,
    marginTop: 12,
  },
  signUpButtonText: { color: "#C15656", fontWeight: "800", fontSize: 15 },
  continueBrowsing: {
    color: "#75655F",
    fontWeight: "700",
    fontSize: 14,
    marginTop: 22,
  },
});
