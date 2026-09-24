import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { useRouter } from "expo-router";
import { signOut, User } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#C15656" />
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
});
