import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, MessageCircle, Paintbrush, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const isWeb = Platform.OS === "web" || width > 768;

export default function ArtistProfileScreen() {
  const { artistId } = useLocalSearchParams<{ artistId: string }>();
  const router = useRouter();

  const [artist, setArtist] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Commission Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("2500");
  const [isRush, setIsRush] = useState<"EXCLUSIVE" | "NON_EXCLUSIVE" | "SOLE">(
    "NON_EXCLUSIVE",
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/users/artists/${artistId}/`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setArtist(d);
      } catch (e: any) {
        Alert.alert(
          "Artist profile",
          e.message || "Unable to load this artist.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [artistId]);

  const handleCreateCommission = async () => {
    if (!title.trim()) {
      Alert.alert("Required", "Please enter a title for your commission.");
      return;
    }

    try {
      setSubmitting(true);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_URL}/api/commissions/request/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          artist_id: Number(artistId),
          user_email: auth.currentUser?.email,
          title,
          description,
          time_duration: parseFloat(budget) || 1000,
          is_rush_job: isRush,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        Alert.alert(
          "Success",
          "Your commission request has been sent to the artist!",
        );
        setModalVisible(false);
        setTitle("");
        setDescription("");
      } else {
        Alert.alert("Error", data.error || "Failed to submit commission.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  const getImageUri = (item: any) => {
    const raw = item?.image_data || item?.image || item?.image_url;
    if (!raw) return "https://via.placeholder.com/300";
    if (
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("data:")
    ) {
      return raw;
    }
    return `${API_URL}${raw}`;
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#E67E22" size="large" />
      </View>
    );
  }

  if (!artist) {
    return (
      <View style={s.center}>
        <Text style={{ color: "#666" }}>Artist not found.</Text>
      </View>
    );
  }

  const avatarUri =
    artist.avatar ||
    artist.profile_image ||
    "https://api.dicebear.com/7.x/identicon/png?seed=artist&backgroundColor=ffffff";

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)" as any);
    }
  };

  return (
    <SafeAreaView style={s.page}>
      {/* 1. Header Navigation Bar */}
      <View style={s.topNav}>
        <TouchableOpacity style={s.navLeft} onPress={handleBack}>
          <ArrowLeft color="#fff" size={24} />
          <Text style={s.navTitle}>{artist.name || artist.username}</Text>
        </TouchableOpacity>

        <View style={s.navRight}>
          {artist.is_accepting_commissions ? (
            <TouchableOpacity
              style={s.commissionBtn}
              onPress={() =>
                router.push({
                  pathname: "/commission-request",
                  params: {
                    artistId: String(artist.id),
                    artistName: artist.name || artist.username,
                  },
                } as any)
              }
            >
              <Paintbrush color="#fff" size={15} />
              <Text style={s.commissionBtnText}>Request Commission</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.closedCommission}>
              <Text style={s.closedCommissionText}>Commissions closed</Text>
            </View>
          )}

          {/* Message Button */}
          <TouchableOpacity
            style={s.messageBtn}
            onPress={() =>
              router.push({
                pathname: "/messages",
                params: {
                  artistId: String(artist.id),
                  artistName: artist.name,
                },
              })
            }
          >
            <MessageCircle color="#fff" size={16} />
            <Text style={s.messageText}>Message</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Artist Profile Hero Card (Identical to Artist POV Header) */}
        <View style={s.heroCard}>
          <View style={s.artistBadgePill}>
            <Text style={s.artistBadgeText}>Artist</Text>
          </View>

          <View style={s.heroMain}>
            <Image source={{ uri: avatarUri }} style={s.avatar} />

            <View style={s.heroDetails}>
              <Text style={s.artistNameText}>
                {artist.name || artist.username}
              </Text>
              <Text style={s.statsText}>
                {artist.reviews_count ?? 25} Reviews •{" "}
                {artist.followers_count ?? 19} Followers •{" "}
                {artist.following_count ?? 3} Following
              </Text>
              <Text style={s.handleText}>@{artist.username}</Text>
              <Text style={s.bioText}>
                {artist.bio ||
                  "Passionate digital & physical painter on ArtFiliere."}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Artwork Showcase Section */}
        <View style={s.worksContainer}>
          <Text style={s.sectionHeading}>Artwork for sale</Text>

          {!artist.artworks || artist.artworks.length === 0 ? (
            <Text style={s.noArtText}>No artworks published yet.</Text>
          ) : (
            <View style={s.grid}>
              {artist.artworks.map((item: any) => (
                <TouchableOpacity
                  key={item.id}
                  style={s.card}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      // Reuse the marketplace detail screen; the previous
                      // route did not exist in this Expo router project.
                      pathname: "/(home)/view-post" as any,
                      params: {
                        artworkId: String(item.id),
                        title: item.title || "",
                        price: String(item.price || ""),
                        image:
                          item.image_data || item.image || item.image_url || "",
                        artist: artist.name || artist.username || "",
                        artistId: String(item.artist_id || artist.id),
                        medium: item.category || "",
                        sale_type: item.sale_type || "Direct Sell",
                        type:
                          item.sale_type === "auction"
                            ? "Auction"
                            : "Direct Sell",
                        bidIncrement: String(item.bid_increment || ""),
                        startingTime: item.starting_time || "",
                        endTime: item.end_time || "",
                      },
                    })
                  }
                >
                  <Image
                    source={{ uri: getImageUri(item) }}
                    style={s.image}
                    resizeMode="cover"
                  />
                  <View style={s.cardMeta}>
                    <Text style={s.title} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={s.price}>
                      ₱ {Number(item.price || 0).toLocaleString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 4. Commission Request Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalHeading}>Request Commission</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X color="#666" size={22} />
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>Commission Title *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Custom Portrait Painting"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={s.fieldLabel}>Description & Instructions</Text>
            <TextInput
              style={[s.input, { height: 75, textAlignVertical: "top" }]}
              multiline
              placeholder="Mention size, colors, reference details..."
              value={description}
              onChangeText={setDescription}
            />

            <Text style={s.fieldLabel}>Agreed Total Budget (₱) *</Text>
            <TextInput
              style={s.input}
              keyboardType="numeric"
              placeholder="2500"
              value={budget}
              onChangeText={setBudget}
            />

            <Text style={s.fieldLabel}>Exclusivity Type</Text>
            <View style={s.pillRow}>
              {(["NON_EXCLUSIVE", "EXCLUSIVE", "SOLE"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.pill, isRush === t && s.pillActive]}
                  onPress={() => setIsRush(t)}
                >
                  <Text style={[s.pillText, isRush === t && s.pillTextActive]}>
                    {t.replace("_", " ")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: "#666" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.submitBtn}
                onPress={handleCreateCommission}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={s.submitBtnText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FAF6EF" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAF6EF",
  },

  // Top Nav
  topNav: {
    backgroundColor: "#E67E22",
    minHeight: 65,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  navTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  navRight: { flexDirection: "row", alignItems: "center", gap: 8 },

  commissionBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#27AE60",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  commissionBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  closedCommission: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  closedCommissionText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  messageBtn: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
  },
  messageText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  content: { paddingBottom: 30 },

  // Hero Card matching POV 2
  heroCard: {
    backgroundColor: "#E67E22",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  artistBadgePill: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 14,
  },
  artistBadgeText: { color: "#E67E22", fontSize: 12, fontWeight: "800" },
  heroMain: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3.5,
    borderColor: "#FFFFFF",
    marginRight: 16,
    backgroundColor: "#FFF",
  },
  heroDetails: { flex: 1 },
  artistNameText: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    marginBottom: 2,
  },
  statsText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  handleText: { color: "#FFEAA7", fontSize: 12, fontWeight: "700" },
  bioText: { color: "#FFFFFF", fontSize: 12, marginTop: 3, lineHeight: 16 },

  // Gallery Showcase
  worksContainer: {
    paddingHorizontal: 18,
    paddingTop: 20,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
  },
  sectionHeading: {
    color: "#2B2320",
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 14,
  },
  noArtText: { color: "#888", fontStyle: "italic", marginTop: 10 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  card: {
    width: isWeb ? 170 : (width - 50) / 2,
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EFE3D5",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  image: { width: "100%", height: 150 },
  cardMeta: { padding: 9 },
  title: { color: "#3A2D2A", fontSize: 13, fontWeight: "800" },
  price: { color: "#C15656", fontSize: 13, fontWeight: "800", marginTop: 4 },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 440,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalHeading: { fontSize: 18, fontWeight: "800", color: "#2C3E50" },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#555",
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#FAFAFA",
  },
  pillRow: { flexDirection: "row", gap: 6, marginTop: 6, marginBottom: 14 },
  pill: {
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillActive: { borderColor: "#E67E22", backgroundColor: "#FEF5EC" },
  pillText: { fontSize: 11, color: "#666", fontWeight: "600" },
  pillTextActive: { color: "#E67E22", fontWeight: "800" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: { paddingVertical: 9, paddingHorizontal: 14 },
  submitBtn: {
    backgroundColor: "#27AE60",
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  submitBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
});
