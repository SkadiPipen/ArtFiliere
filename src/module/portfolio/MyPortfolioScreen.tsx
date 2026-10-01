import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Artwork = {
  id: number;
  title: string;
  price: string;
  image_data: string;
  category: string;
  status: "pending" | "approved" | "declined";
  decline_reason?: string;
  sale_type?: string;
  artist_id?: number;
};
type Filter = "all" | Artwork["status"];

export default function MyPortfolioScreen() {
  const router = useRouter();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const visibleArtworks = useMemo(
    () =>
      artworks.filter(
        (artwork) => filter === "all" || artwork.status === filter,
      ),
    [artworks, filter],
  );

  useEffect(() => {
    const load = async () => {
      try {
        if (!auth.currentUser) return;
        const response = await fetch(`${API_URL}/api/users/artworks/?mine=1`, {
          headers: {
            Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
          },
        });
        const data = await response.json();
        if (response.ok) setArtworks(data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <SafeAreaView style={s.page} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/(home)/profile")
          }
          style={s.back}
        >
          <ArrowLeft size={23} color="#C15656" />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>My portfolio</Text>
          <Text style={s.subtitle}>Manage and review your posted artwork</Text>
        </View>
        <TouchableOpacity
          style={s.post}
          onPress={() => router.push("/artist-post")}
        >
          <Plus size={17} color="#FFFFFF" />
          <Text style={s.postText}>Post</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.summary}>
          <Text style={s.summaryCount}>{artworks.length}</Text>
          <Text style={s.summaryText}>artwork posts</Text>
          <Text style={s.summaryDetail}>
            {artworks.filter((item) => item.status === "approved").length}{" "}
            approved ·{" "}
            {artworks.filter((item) => item.status === "pending").length} in
            review
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filters}
        >
          {(["all", "pending", "approved", "declined"] as Filter[]).map(
            (value) => (
              <TouchableOpacity
                key={value}
                style={[s.filter, filter === value && s.filterActive]}
                onPress={() => setFilter(value)}
              >
                <Text
                  style={[s.filterText, filter === value && s.filterTextActive]}
                >
                  {value === "all"
                    ? "All"
                    : value.charAt(0).toUpperCase() + value.slice(1)}
                </Text>
              </TouchableOpacity>
            ),
          )}
        </ScrollView>
        {loading ? (
          <ActivityIndicator color="#C15656" size="large" style={s.loader} />
        ) : visibleArtworks.length ? (
          <View style={s.grid}>
            {visibleArtworks.map((artwork) => (
              <TouchableOpacity
                key={artwork.id}
                style={s.card}
                onPress={() =>
                  router.push({
                    pathname: "/(home)/view-post",
                    params: {
                      artworkId: String(artwork.id),
                      title: artwork.title,
                      price: artwork.price,
                      image: artwork.image_data,
                      medium: artwork.category,
                      sale_type: artwork.sale_type || "Direct Sell",
                    },
                  })
                }
              >
                <Image source={{ uri: artwork.image_data }} style={s.image} />
                <View style={s.cardBody}>
                  <View style={s.cardTop}>
                    <Text style={s.artTitle} numberOfLines={1}>
                      {artwork.title}
                    </Text>
                    <Text style={[s.status, s[`status_${artwork.status}`]]}>
                      {artwork.status}
                    </Text>
                  </View>
                  <Text style={s.price}>
                    ₱ {Number(artwork.price).toLocaleString()}
                  </Text>
                  {artwork.status === "declined" && artwork.decline_reason ? (
                    <Text style={s.reason} numberOfLines={2}>
                      {artwork.decline_reason}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>
              {filter === "all"
                ? "Your portfolio is empty"
                : `No ${filter} artwork`}
            </Text>
            <Text style={s.emptyText}>
              Start by posting artwork for the Creative Moderator to review.
            </Text>
            <TouchableOpacity
              style={s.emptyButton}
              onPress={() => router.push("/artist-post")}
            >
              <Text style={s.emptyButtonText}>Create a post</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFCF0" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderColor: "#E9DDD6",
    gap: 12,
  },
  back: { padding: 5 },
  headerText: { flex: 1 },
  title: { color: "#3A2D2A", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "#877771", fontSize: 11, marginTop: 2 },
  post: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#C15656",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  postText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  content: {
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 60,
  },
  summary: { backgroundColor: "#FFF3CF", borderRadius: 14, padding: 18 },
  summaryCount: { color: "#C15656", fontSize: 28, fontWeight: "900" },
  summaryText: { color: "#5A4944", fontSize: 13, fontWeight: "800" },
  summaryDetail: { color: "#806E65", fontSize: 12, marginTop: 5 },
  filters: { gap: 8, paddingVertical: 16 },
  filter: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#F2E7E2",
  },
  filterActive: { backgroundColor: "#C15656" },
  filterText: { color: "#9B655E", fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: "#FFFFFF" },
  loader: { marginTop: 70 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E9DDD6",
    overflow: "hidden",
    width: "48%",
    minWidth: 200,
    flexGrow: 1,
    maxWidth: 310,
  },
  image: { width: "100%", height: 180, backgroundColor: "#EEE7E2" },
  cardBody: { padding: 12 },
  cardTop: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  artTitle: { color: "#3A2D2A", fontSize: 14, fontWeight: "800", flex: 1 },
  status: {
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
    textTransform: "capitalize",
  },
  status_pending: { color: "#946315", backgroundColor: "#FFF0C8" },
  status_approved: { color: "#407648", backgroundColor: "#E5F2E6" },
  status_declined: { color: "#A34C46", backgroundColor: "#FCE7E4" },
  price: { color: "#C15656", fontSize: 14, fontWeight: "800", marginTop: 7 },
  reason: { color: "#96625C", fontSize: 11, lineHeight: 16, marginTop: 7 },
  empty: {
    marginTop: 25,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9DDD6",
    borderRadius: 14,
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: { color: "#3A2D2A", fontSize: 17, fontWeight: "800" },
  emptyText: {
    color: "#786862",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 340,
  },
  emptyButton: {
    backgroundColor: "#C15656",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  emptyButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
});
