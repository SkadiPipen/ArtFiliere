import { readApiResponse } from '@/module/chat-negotiations/contracts';
import ProfileCover from '@/components/ProfileCover';
import { pickProfileImage } from '@/services/profileImages';
import API_URL from '@/services/api';
import { auth } from '@/firebase/config';
import { useEffect, useState } from 'react';
import { Text } from '@/components/Typography';
import { useRouter } from "expo-router";
import { Bell, Camera, Edit3, FileText, Folder, Settings } from "lucide-react-native";
import { Alert, Image, Platform, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ProfileHeaderProps {
  userRole: string;
  profileData: any;
  user: any;
  onLogout: () => void;
  onCoverSaved: () => void | Promise<void>;
}

export default function ProfileHeader({
  userRole,
  profileData,
  user,
  onLogout,
  onCoverSaved,
}: ProfileHeaderProps) {
  const router = useRouter();
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [savedCover, setSavedCover] = useState<string>();
  useEffect(() => { setSavedCover(undefined); }, [profileData?.cover_image]);
  const [coverHovered, setCoverHovered] = useState(false);
  const [coverFocused, setCoverFocused] = useState(false);
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setCanHover(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const showCoverButton = !canHover || coverHovered || coverFocused || coverBusy;
  const changeCover = async () => {
    setCoverBusy(true); setCoverError('');
    try {
      const image = await pickProfileImage(true);
      if (!image) return;
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw Error('Please sign in again.');
      const response = await fetch(`${API_URL}/auth/me/`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ cover_image: image }) });
      const result = await readApiResponse(response);
      if (result.cover_image !== image) throw Error('The backend did not save the cover photo. Restart Django, refresh this page, and try again.');
      setSavedCover(result.cover_image);
      await onCoverSaved();
    } catch (error: any) { setCoverError(error.message); }
    finally { setCoverBusy(false); }
  };
  const normalizedRole = userRole.toLowerCase();
  const roleLabel = normalizedRole === "artist" ? "Artist" : userRole;

  const djangoFirstName =
    profileData?.first_name || profileData?.firstName || "";
  const djangoLastName = profileData?.last_name || profileData?.lastName || "";
  const djangoFullName = `${djangoFirstName} ${djangoLastName}`.trim();

  // Fall back to Firebase display name or username
  const fullName =
    djangoFullName.length > 0
      ? djangoFullName
      : user?.displayName ||
        profileData?.username ||
        user?.email?.split("@")[0] ||
        "Your Name";

  return (
    <Pressable accessible={false} onHoverIn={() => setCoverHovered(true)} onHoverOut={() => setCoverHovered(false)} style={styles.headerBackground}>
      <ProfileCover uri={savedCover ?? profileData?.cover_image} />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <View style={styles.innerContainer}>
          {!!coverError && <Text accessibilityRole="alert" style={{ color: '#B91C1C', backgroundColor: '#FFF', padding: 12, borderRadius: 10 }}>{coverError}</Text>}
          {/* TOP BAR */}
          <View style={styles.topRow}>
            <View style={styles.iconGroup}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => Alert.alert("Documents", "Opening Docs...")}
              >
                <FileText color="#70482F" size={20} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => Alert.alert("Folders", "Opening Folders...")}
              >
                <Folder color="#70482F" size={20} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => Alert.alert("Notifications", "No new alerts")}
              >
                <Bell color="#70482F" size={20} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => router.push("/(home)/settings")}
              >
                <Settings color="#70482F" size={20} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Profile and cover action share the same bottom alignment. */}
          <View style={styles.profileActions}>
          <View style={styles.profileContent}>
            <View style={styles.avatarContainer}>
              <Image
                source={{
                  uri:
                    profileData?.profile_image || profileData?.profileImage ||
                    user?.photoURL ||
                    "https://i.pravatar.cc/150?u=incognito",
                }}
                style={styles.avatar}
              />
            </View>

            <View style={styles.userDetails}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{roleLabel}</Text>
              </View>
              <View style={styles.nameRow}>
                <Text style={styles.userName} numberOfLines={1}>
                  {fullName}
                </Text>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => router.push("/(home)/edit-profile")}
                >
                  <Edit3 color="#A24F41" size={12} />
                  <Text style={styles.editBtnText}>Edit Profile</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.statsRow}>
                <Text style={styles.statText}>25 Reviews</Text>
                <Text style={styles.statDot}>•</Text>
                <Text style={styles.statText}>19 Followers</Text>
                <Text style={styles.statDot}>•</Text>
                <Text style={styles.statText}>3 Following</Text>
              </View>
            </View>

          </View>
      <TouchableOpacity accessibilityRole="button" disabled={coverBusy} onFocus={() => setCoverFocused(true)} onBlur={() => setCoverFocused(false)} onPress={changeCover} style={[styles.coverButton, { opacity: showCoverButton ? 1 : 0 }]}>
        <Camera size={16} color="#70482F" /><Text style={{ color: '#70482F', fontWeight: '700', fontSize: 12 }}>{coverBusy ? 'Saving cover...' : 'Change cover photo'}</Text>
      </TouchableOpacity>
          </View>
            {normalizedRole === "buyer" && (
              <TouchableOpacity
                style={styles.registerArtistBtn}
                onPress={() => router.push("/artist-registration")}
              >
                <Text style={styles.registerText}>Register as ARTIST</Text>
              </TouchableOpacity>
            )}
        </View>
      </SafeAreaView>

    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerBackground: {
    backgroundColor: "#FFF",
    width: "100%",
    paddingBottom: 50,
    alignItems: "center",
  },
  profileActions: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginTop: 40 },
  coverButton: { alignSelf: 'flex-end', marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: '#E5DAD3' },
  safeArea: {
    width: "100%",
    alignItems: "center",
  },
  innerContainer: {
    width: "100%",
    maxWidth: 1200,
    paddingHorizontal: 20,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingVertical: 10,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginBottom: 7,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    elevation: 3,
  },
  roleText: { color: "#C15656", fontWeight: "bold", fontSize: 12 },
  iconGroup: { flexDirection: "row", alignItems: "center" },
  iconBtn: { marginLeft: 8, padding: 9, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.82)' },
  profileContent: {
    flexShrink: 1,
    maxWidth: '100%',
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "nowrap",
    gap: 0,
  },
  avatarContainer: {
    zIndex: 2,
    width: 104,
    height: 104,
    borderRadius: 52,
    flexShrink: 0,
    marginRight: -24,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.8)",
    overflow: "hidden",
  },
  avatar: { width: "100%", height: "100%" },
  userDetails: { flexShrink: 1, flexGrow: 0, maxWidth: 620, minWidth: 0, paddingVertical: 12, paddingLeft: 38, paddingRight: 18, borderRadius: 14, backgroundColor: 'rgba(235,235,235,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)' },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  userName: { fontSize: 22, fontWeight: "bold", color: "#382C26", flexShrink: 1 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  editBtnText: {
    color: "#A24F41",
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 4,
  },
  statsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 6 },
  statText: { color: "#5B514B", fontSize: 12, opacity: 0.95, fontWeight: "500" },
  statDot: { color: "#5B514B", marginHorizontal: 6, opacity: 0.7 },
  registerArtistBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: "#2ECC71",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    elevation: 2,
  },
  registerText: { color: "#fff", fontWeight: "bold", fontSize: 11 },
});
