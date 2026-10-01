import API_URL from "@/services/api";
import { useRouter } from "expo-router";
import { ArrowLeft, Star } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Artist = {
  id: number;
  name: string;
  username: string;
  bio: string;
  hourly_rate: string | null;
  average_rating: number | null;
  rating_count: number;
  completed_commissions: number;
};

const sorts = [
  ["recommended", "Recommended"],
  ["rating", "Highest rated"],
  ["completed", "Most completed"],
  ["new", "New artists"],
  ["price", "Lowest rate"],
] as const;

export default function ArtistDirectoryScreen() {
  const router = useRouter();
  const [sort, setSort] = useState<(typeof sorts)[number][0]>("recommended");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadArtists = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_URL}/api/users/artists/?sort=${sort}`,
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!cancelled) setArtists(data);
      } catch {
        if (!cancelled) setArtists([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadArtists();
    return () => {
      cancelled = true;
    };
  }, [sort]);

  return (
    <SafeAreaView style={styles.page} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.back}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(home)")
          }
        >
          <ArrowLeft color="#C15656" size={22} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Find an artist</Text>
          <Text style={styles.subtitle}>
            Artists currently accepting commissions
          </Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
        >
          {sorts.map(([value, title]) => (
            <TouchableOpacity
              key={value}
              onPress={() => setSort(value)}
              style={[styles.sortPill, sort === value && styles.sortPillActive]}
            >
              <Text
                style={[
                  styles.sortText,
                  sort === value && styles.sortTextActive,
                ]}
              >
                {title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {loading ? (
          <ActivityIndicator
            color="#C15656"
            size="large"
            style={styles.loader}
          />
        ) : artists.length ? (
          artists.map((artist) => (
            <TouchableOpacity
              key={artist.id}
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: "/artist-profile",
                  params: { artistId: String(artist.id) },
                })
              }
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {artist.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.info}>
                <View style={styles.nameLine}>
                  <Text style={styles.name}>{artist.name}</Text>
                  <View style={styles.openBadge}>
                    <Text style={styles.openBadgeText}>Open</Text>
                  </View>
                </View>
                <Text style={styles.bio} numberOfLines={2}>
                  {artist.bio || "Commission artist on ArtFiliere"}
                </Text>
                <View style={styles.stats}>
                  <View style={styles.rating}>
                    <Star size={14} color="#D48C62" fill="#D48C62" />
                    <Text style={styles.ratingText}>
                      {artist.average_rating?.toFixed(1) || "New"}
                    </Text>
                    <Text style={styles.muted}> ({artist.rating_count})</Text>
                  </View>
                  <Text style={styles.muted}>
                    {artist.completed_commissions} completed
                  </Text>
                </View>
              </View>
              <View style={styles.rate}>
                <Text style={styles.rateLabel}>Hourly rate</Text>
                <Text style={styles.rateValue}>
                  {artist.hourly_rate
                    ? `₱${Number(artist.hourly_rate).toLocaleString()}`
                    : "Ask artist"}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No artists are open right now</Text>
            <Text style={styles.emptyText}>
              Please check back later. Artists appear here only when they choose
              to accept commission requests.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFCF0" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderColor: "#EADDD4",
  },
  back: { padding: 5 },
  title: { color: "#3A2D2A", fontSize: 21, fontWeight: "800" },
  subtitle: { color: "#8A7A74", fontSize: 12, marginTop: 2 },
  content: {
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 50,
  },
  sortRow: { gap: 8, paddingBottom: 16 },
  sortPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#F4E7E1",
  },
  sortPillActive: { backgroundColor: "#C15656" },
  sortText: { color: "#9B635D", fontSize: 12, fontWeight: "800" },
  sortTextActive: { color: "#FFFFFF" },
  loader: { marginTop: 70 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9DDD6",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4D8CC",
  },
  avatarText: { color: "#B5514D", fontSize: 21, fontWeight: "800" },
  info: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { color: "#3A2D2A", fontSize: 15, fontWeight: "800", flexShrink: 1 },
  openBadge: {
    backgroundColor: "#E6F4E8",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  openBadgeText: { color: "#3C8048", fontWeight: "800", fontSize: 10 },
  bio: { color: "#75655F", fontSize: 12, lineHeight: 17, marginTop: 4 },
  stats: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 7 },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { color: "#8B5D25", fontWeight: "800", fontSize: 12 },
  muted: { color: "#8E7E78", fontSize: 11 },
  rate: { alignItems: "flex-end" },
  rateLabel: { color: "#9B8B84", fontSize: 10 },
  rateValue: {
    color: "#C15656",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  empty: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E9DDD6",
    padding: 30,
    marginTop: 20,
  },
  emptyTitle: { color: "#3A2D2A", fontSize: 16, fontWeight: "800" },
  emptyText: {
    color: "#75655F",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 360,
  },
});
