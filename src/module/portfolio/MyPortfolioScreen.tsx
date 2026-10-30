import { goBackOr } from '@/services/navigation';
import ProductImage from '@/components/ProductImage';
import { Text } from '@/components/Typography';
import CategoryPicker from '@/module/artwork/components/CategoryPicker';
import { artworkCategoryIds } from '@/services/artworkCategories';
import { readApiResponse } from '@/module/chat-negotiations/contracts';
import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Plus } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Artwork = {
  categories?: string[];
  category_labels?: string[];
  id: number | string;
  source?: string;
  commission_id?: number;
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
  const [editing, setEditing] = useState<Artwork | null>(null);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [savingCategories, setSavingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const saveCategories = async () => {
    if (!editing) return;
    setSavingCategories(true); setCategoryError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw Error('Please sign in again.');
      const result = await readApiResponse(await fetch(`${API_URL}/api/users/artworks/${editing.id}/`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ categories: draftCategories }),
      }));
      setArtworks(current => current.map(work => work.id === editing.id ? { ...work, ...result } : work));
      setEditing(null);
    } catch (error: any) { setCategoryError(error.message); }
    finally { setSavingCategories(false); }
  };
  const visibleArtworks = useMemo(
    () =>
      artworks.filter(
        (artwork) => filter === "all" || artwork.status === filter,
      ),
    [artworks, filter],
  );

  useFocusEffect(useCallback(() => {
    const load = async () => {
      try {
        if (!auth.currentUser) return;
        const response = await fetch(`${API_URL}/api/users/portfolio/`, {
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
  }, []));

  return (
    <SafeAreaView style={s.page} edges={["top", "left", "right"]}>
      {editing && <Modal visible animationType="slide" onRequestClose={() => { if (!savingCategories) setEditing(null); }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFCFA' }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ width: '100%', maxWidth: 700, alignSelf: 'center', padding: 24, gap: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#A84B46' }}>Categories for {editing.title}</Text>
          <CategoryPicker value={draftCategories} onChange={setDraftCategories} />
          {!!categoryError && <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{categoryError}</Text>}
          <TouchableOpacity disabled={savingCategories || !draftCategories.length} onPress={saveCategories} style={[s.post, { alignSelf: 'flex-start', opacity: savingCategories || !draftCategories.length ? 0.5 : 1 }]}><Text style={s.postText}>{savingCategories ? 'Saving...' : 'Save categories'}</Text></TouchableOpacity>
          <TouchableOpacity disabled={savingCategories} onPress={() => setEditing(null)}><Text style={{ color: '#A24F41', paddingVertical: 12 }}>Cancel</Text></TouchableOpacity>
        </ScrollView></SafeAreaView>
      </Modal>}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() =>
            goBackOr("/(home)/profile")
          }
          style={s.back}
        >
          <ArrowLeft size={23} color="#BC5555" />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>My portfolio</Text>
          <Text style={s.subtitle}>Your artwork posts and completed commissions</Text>
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
          <Text style={s.summaryText}>portfolio works</Text>
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
          <ActivityIndicator color="#BC5555" size="large" style={s.loader} />
        ) : visibleArtworks.length ? (
          <View style={s.grid}>
            {visibleArtworks.map((artwork) => (
              <View key={artwork.id} style={s.card}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() =>
                  artwork.source === "commission" ? router.push({ pathname: "/commission-detail", params: { id: String(artwork.commission_id) } }) : router.push({
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
                {artwork.image_data ? <ProductImage source={{ uri: artwork.image_data }} style={s.image} /> : <View style={[s.image, { justifyContent: "center", alignItems: "center" }]}><Text>Completed commission</Text></View>}
                <View style={s.cardBody}>
                  <View style={s.cardTop}>
                    <Text style={s.artTitle} numberOfLines={1}>
                      {artwork.title}
                    </Text>
                    <Text style={[s.status, s[`status_${artwork.status}`]]}>
                      {artwork.source === "commission" ? "Completed" : artwork.status}
                    </Text>
                  </View>
                  <Text style={s.price}>
                    {artwork.source === "commission" ? "Completed commission" : `₱ ${Number(artwork.price).toLocaleString()}`}
                  </Text>
                  {artwork.source !== 'commission' && <Text style={{ color: '#75655F', fontSize: 12 }}>{artwork.category_labels?.length ? artwork.category_labels.join(' · ') : 'Choose artwork categories'}</Text>}
                  {artwork.status === "declined" && artwork.decline_reason ? (
                    <Text style={s.reason} numberOfLines={2}>
                      {artwork.decline_reason}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
              {artwork.source !== 'commission' && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit categories for ${artwork.title}`} onPress={() => { setDraftCategories(artworkCategoryIds(artwork)); setCategoryError(''); setEditing(artwork); }} style={{ padding: 14 }}><Text style={{ color: '#BC5555', fontWeight: '700' }}>Edit categories</Text></TouchableOpacity>}
              {artwork.status === "declined" && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Appeal rejection of ${artwork.title}`}
                  style={s.appeal}
                  onPress={() => router.push({ pathname: "/support", params: { artworkId: String(artwork.id) } })}
                >
                  <Text style={s.postText}>Appeal rejection</Text>
                </TouchableOpacity>
              )}
              </View>
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
  page: { flex: 1, backgroundColor: "#F7F8FA" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderColor: "#EFE1DC",
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
    backgroundColor: "#BC5555",
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
  summary: { backgroundColor: "#F5E8E3", borderRadius: 14, padding: 18 },
  summaryCount: { color: "#BC5555", fontSize: 28, fontWeight: "900" },
  summaryText: { color: "#5A4944", fontSize: 13, fontWeight: "800" },
  summaryDetail: { color: "#806E65", fontSize: 12, marginTop: 5 },
  filters: { gap: 8, paddingVertical: 16 },
  filter: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#EBDAD4",
  },
  filterActive: { backgroundColor: "#BC5555" },
  filterText: { color: "#A84B46", fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: "#FFFFFF" },
  loader: { marginTop: 70 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EFE1DC",
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
  status_pending: { color: "#964B48", backgroundColor: "#F5E8E3" },
  status_approved: { color: "#407648", backgroundColor: "#E5F2E6" },
  status_declined: { color: "#A34C46", backgroundColor: "#FCE7E4" },
  price: { color: "#BC5555", fontSize: 14, fontWeight: "800", marginTop: 7 },
  appeal: { backgroundColor: "#BC5555", margin: 12, marginTop: 0, borderRadius: 8, padding: 10, alignItems: "center" },
  reason: { color: "#96625C", fontSize: 11, lineHeight: 16, marginTop: 7 },
  empty: {
    marginTop: 25,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EFE1DC",
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
    backgroundColor: "#BC5555",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  emptyButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
});
