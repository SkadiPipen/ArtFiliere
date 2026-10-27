import { Text } from '@/components/Typography';
import UnreadMessageBadge from "@/module/chat-negotiations/UnreadMessageBadge";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { MessageSquare } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { auth } from "@/firebase/config";
import { ChatModal } from "@/module/chat-negotiations/chatModal";
import ArtistCommission from "@/module/home/components/ArtistCommission";
import AuctionSection from "@/module/home/components/AuctionSection";
import ForYouGrid from "@/module/home/components/ForYouGrid";
import Header from "@/module/home/components/Header";
import HeroCarousel from "@/module/home/components/HeroCarousel";
import PromoArtwork from '@/module/home/components/PromoArtwork';
import { categoryLabel, matchesArtworkCategory } from '@/services/artworkCategories';
import { marketplaceHeading } from '@/constants/marketplaceTypography';
import LatestSection from "@/module/home/components/LatestSection";
import { ArtItem } from "@/module/home/types";
import API_URL from "@/services/api";

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState("All");
  const [approvedArtworks, setApprovedArtworks] = useState<ArtItem[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [chatVisible, setChatVisible] = useState(false);
  const { paymentReturn } = useLocalSearchParams<{ paymentReturn?: string }>();
  useEffect(() => { if (paymentReturn) setChatVisible(false); }, [paymentReturn]);
  const isDesktop = width >= 768;
  const hasSidebar = Platform.OS === 'web' && isDesktop;

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        setChatVisible(false);
      }),
    [],
  );

  // Firebase keeps a signed-in user between browser refreshes. Check the
  // server-side role here so staff cannot land in the buyer marketplace just
  // because they reopened the app while already signed in.
  useEffect(() => {
    let cancelled = false;
    const routeStaffUser = async () => {
      if (!currentUser) return;
      try {
        const response = await fetch(`${API_URL}/auth/me/`, {
          headers: {
            Authorization: `Bearer ${await currentUser.getIdToken()}`,
          },
        });
        if (!response.ok || cancelled) return;
        const profile = await response.json();
        if (profile.role === "customer_support")
          router.replace("/customer-service-dashboard");
        if (profile.role === "creative_moderator")
          router.replace("/creative-dashboard");
        if (profile.role === "platform_admin")
          router.replace("/admin-dashboard");
        if (profile.role === "hr") router.replace("/hr-dashboard");
      } catch {
        // Browse mode remains available if the profile check is temporarily unavailable.
      }
    };
    routeStaffUser();
    return () => {
      cancelled = true;
    };
  }, [currentUser, router]);

  const handleOpenChat = () => {
    if (!currentUser) {
      Alert.alert("Messages", "Please sign in to open your messages.");
      return;
    }
    setChatVisible(true);
  };

  const handleViewPost = (item: any, type: string) => {
    const saleTypeStr = String(item.sale_type || "").toUpperCase();
    const isAuctionItem = saleTypeStr === "AUCTION";
    router.push({
      pathname: "/(home)/view-post",
      params: {
        artworkId: String(item.id || item.artworkId || ""),
        type: isAuctionItem ? "Auction" : type || "Direct Sell",
        sale_type: isAuctionItem ? "Auction" : "Direct Sell",
        title: item.title,
        price: String(item.price),
        image: item.image_data || item.image || item.img || item.image_url,
        artist: item.artistName || item.artist?.username || item.artist,
        artistId: String(
          item.artistId || item.artist_id || item.artist?.id || "",
        ),
        medium: item.category || item.medium || "Painting",
        bidIncrement: isAuctionItem ? String(item.bid_increment) : "",
        startingTime:
          isAuctionItem && item.starting_time ? String(item.starting_time) : "",
        endTime: isAuctionItem && item.end_time ? String(item.end_time) : "",
      },
    });
  };

  useFocusEffect(useCallback(() => {
    fetch(`${API_URL}/api/users/artworks/`)
      .then((response) => (response.ok ? response.json() : []))
      .then((artworks) =>
        setApprovedArtworks(
          artworks.map((artwork: any) => ({
            ...artwork,
            id: String(artwork.id),
            artist: artwork.title,
            artistName: artwork.artist_name,
            artistId: String(artwork.artist_id),
            price: artwork.price,
            type: artwork.category,
            artType: artwork.art_type,
            image: artwork.image_data,
            category: artwork.category,
            sale_type: artwork.sale_type,
            bid_increment: artwork.bid_increment,
            starting_time: artwork.starting_time,
            end_time: artwork.end_time,
          })),
        ),
      )
      .catch(() => undefined);
  }, []));

  const webItems = approvedArtworks.filter(item => {
    const data = item as ArtItem & { description?: string; tags?: string[]; category?: string };
    const words = [item.artist, item.artistName, data.description, data.category, ...(item.categories || []).map(categoryLabel), ...(data.tags || [])].join(' ').toLowerCase();
    if (!searchQuery.trim().toLowerCase().split(/\s+/).every(word => words.includes(word))) return false;
    return matchesArtworkCategory(item, activeCategory);
  });
  // The API has no popularity metric; show the newest available artwork for Trending.
  if (activeCategory === 'Trending') webItems.sort((a, b) => Number(b.id) - Number(a.id));

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <Header
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: (hasSidebar ? 32 : 120) + insets.bottom },
        ]}
      >
        {isDesktop ? (
          <View style={styles.desktopContainer}>
            <HeroCarousel onSelect={handleViewPost} />

            <View style={styles.desktopPromoRow}>
              <View style={[styles.promoCard, styles.latestPromo]}>
                <PromoArtwork variant="paint" />
                <Text style={styles.promoEyebrow}>LATEST</Text>
                <Text style={[styles.promoTitle, { fontSize: width >= 1100 ? 34 : 28, lineHeight: width >= 1100 ? 39 : 33 }]}>{'Discover\noriginal work'}</Text>
                <Text style={styles.promoBody}>
                  Fresh art from independent creators.
                </Text>
              </View>
              <View style={[styles.promoCard, styles.commissionPromo]}>
                <PromoArtwork variant="botanical" />
                <Text style={styles.promoEyebrow}>OPEN COMMISSION</Text>
                <Text style={[styles.promoTitle, { fontSize: width >= 1100 ? 34 : 28, lineHeight: width >= 1100 ? 39 : 33 }]}>{'Bring your\nidea to life'}</Text>
                <TouchableOpacity onPress={() => router.push("/artists")}>
                  <Text style={styles.promoLink}>Find an artist →</Text>
                </TouchableOpacity>
              </View>
            </View>

            <AuctionSection onSelect={handleViewPost} items={webItems} />
            <View style={styles.catalogueLayout}>
              <View style={styles.catalogueContent}>
                <Text style={styles.catalogueTitle}>
                  {searchQuery.trim()
                    ? `Search results for ${searchQuery.trim()}`
                    : activeCategory === "All"
                    ? "Artworks For You"
                    : activeCategory}
                </Text>
                {activeCategory === "Trending" && <Text>Newest artwork</Text>}
                <ForYouGrid
                  showHeading={false}
                  activeCategory={hasSidebar ? "All" : activeCategory}
                  onSelect={handleViewPost}
                  items={webItems}
                  webFiltered
                />
              </View>
            </View>

            <View style={styles.desktopFooter}>
              <Text style={styles.footerBrand}>ArtFiliere</Text>
              <Text style={styles.footerText}>
                ArtFiliere is a start-up project registered in the Philippines.
              </Text>
              <Text style={styles.footerText}>© 2026 ArtFiliere</Text>
            </View>
          </View>
        ) : (
          <View style={styles.centerContainer}>
            <HeroCarousel onSelect={handleViewPost} />
            <LatestSection
              items={webItems}
              activeCategory={activeCategory}
              onSelect={handleViewPost}
            />
            <ArtistCommission />
            <AuctionSection onSelect={handleViewPost} items={webItems} />
            <ForYouGrid
              activeCategory={activeCategory}
              onSelect={handleViewPost}
              items={webItems}
              webFiltered
            />
          </View>
        )}
      </ScrollView>

      {/* Floating chat button */}
      <TouchableOpacity
        style={[styles.msgFab, width < 480 && { width: 44, height: 44, borderRadius: 22, right: 12 }, { bottom: (hasSidebar ? 24 : 85) + insets.bottom }]}
        onPress={handleOpenChat}
        accessibilityRole="button"
        accessibilityLabel="Open messages"
      >
        <MessageSquare color="#fff" size={26} fill="#fff" />
        <UnreadMessageBadge uid={currentUser?.uid} />
      </TouchableOpacity>
      {chatVisible && currentUser && (
        <ChatModal
          visible={chatVisible}
          onClose={() => setChatVisible(false)}
          currentUser={currentUser}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  scrollContent: { alignItems: "center" },
  centerContainer: { width: "100%", maxWidth: 1200 },
  desktopContainer: {
    width: "100%",
    maxWidth: 1160,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  desktopPromoRow: { flexDirection: "row", gap: 20, marginTop: -53, marginHorizontal: 24, marginBottom: 26, zIndex: 2 },
  promoCard: {
    flex: 1,
    minHeight: 212,
    borderRadius: 18,
    padding: 24,
    justifyContent: "center",
    overflow: "hidden",
  },
  latestPromo: { backgroundColor: "#F7E9BD" },
  commissionPromo: { backgroundColor: "#E3E1DF" },
  promoEyebrow: {
    color: "#1F2933",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  promoTitle: { color: "#382C26", fontSize: 34, fontWeight: "700" },
  promoBody: { color: "#5F554E", fontSize: 13, lineHeight: 19, marginTop: 9 },
  promoLink: {
    color: "#100f0f",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 9,
  },
  catalogueLayout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 24,
    marginTop: 4,
  },
  filterPanel: {
    width: 210,
    backgroundColor: "#FFF8D9",
    borderRadius: 10,
    padding: 20,
  },
  filterHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 22,
  },
  filterTitle: { color: "#C15656", fontSize: 16, fontWeight: "800" },
  filterLabel: {
    color: "#C15656",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 9,
  },
  filterLabelSpaced: { marginTop: 22 },
  filterOption: { color: "#7B6A65", fontSize: 12, marginBottom: 9 },
  catalogueContent: { flex: 1, minWidth: 0 },
  catalogueTitle: {
    ...marketplaceHeading,
    marginLeft: 15,
    marginBottom: -8,
  },
  desktopFooter: {
    borderTopWidth: 1,
    borderTopColor: "#E9DDD6",
    marginTop: 32,
    paddingVertical: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  footerBrand: { color: "#C15656", fontSize: 18, fontWeight: "800" },
  footerText: { color: "#8A7C76", fontSize: 11, flex: 1 },
  msgFab: {
    position: "absolute",
    right: 20,
    backgroundColor: "#9B5B44",
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  navBar: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 75,
    backgroundColor: "#D48C62",
    alignItems: "center",
  },
  navInner: {
    width: "100%",
    maxWidth: 600,
    height: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: { alignItems: "center", justifyContent: "center" },
  activeIcon: { transform: [{ scale: 1.1 }] },
  navText: { color: "#fff", fontSize: 11, fontWeight: "500", marginTop: 2 },
  auctionContainer: { alignItems: "center", position: "relative" },
  auctionCircle: {
    position: "absolute",
    top: -45,
    backgroundColor: "#C15656",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#fff",
    elevation: 4,
  },
});
