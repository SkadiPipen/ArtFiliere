import { useCart } from "@/context/CartContext";
import { auth } from "@/firebase/config";
import { Watermark } from "@/module/artwork/components/Watermark";
import AppDialog, { AppDialogProps } from "@/components/AppDialog";
import AppToast from "@/components/AppToast";
import API_URL from "@/services/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Gavel,
  ShieldCheck,
  ShoppingCart,
  Star,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ViewPostPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { addToCart } = useCart();

  const params = useLocalSearchParams();
  const artworkId = (params.artworkId as string) || "";

  const [artworkData, setArtworkData] = useState<any>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  const [loadingArtwork, setLoadingArtwork] = useState(true);
  const [isOwnArtwork, setIsOwnArtwork] = useState(false);
  const [checkingOwner, setCheckingOwner] = useState(true);
  const [proof, setProof] = useState<any>(null);
  const [showProof, setShowProof] = useState(false);
  const [reviews, setReviews] = useState<{
    average_rating: number | null;
    review_count: number;
    reviews: Array<{
      rating: number;
      comment: string;
      reviewer: string;
      created_at: string;
    }>;
  }>({ average_rating: null, review_count: 0, reviews: [] });
  const [dialog, setDialog] = useState<Omit<
    AppDialogProps,
    "visible" | "onClose"
  > | null>(null);
  const [toast, setToast] = useState("");

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (targetDate: any) => {
    if (!targetDate) return "Active Ended";
    const target = new Date(targetDate).getTime();
    if (isNaN(target)) return "Auction Ended";

    const diff = target - now;
    if (diff <= 0) return "Auction Ended";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}s`;
  };

  useEffect(() => {
    if (!artworkId) {
      setLoadingArtwork(false);
      return;
    }

    const fetchArtwork = async () => {
      try {
        let res = await fetch(`${API_URL}/api/users/artworks/${artworkId}/`);
        if (!res.ok) {
          res = await fetch(`${API_URL}/api/artworks/${artworkId}/`);
        }
        if (res.ok) {
          const json = await res.json();
          setArtworkData(json);
        }
      } catch (err) {
        console.warn("Failed to fetch artwork info:", err);
      } finally {
        setLoadingArtwork(false);
      }
    };

    fetchArtwork();
  }, [artworkId]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [artworkId]);

  useEffect(() => {
    if (!artworkId) return;
    fetch(`${API_URL}/api/users/artworks/${artworkId}/reviews/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setReviews(data);
      })
      .catch(() => undefined);
  }, [artworkId]);

  useEffect(() => {
    if (!artworkId) return;
    const loadProof = async () => {
      try {
        const token = auth.currentUser
          ? await auth.currentUser.getIdToken()
          : "";
        const response = await fetch(
          `${API_URL}/api/blockchain/artworks/${artworkId}/proof/`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        if (response.ok) setProof(await response.json());
      } catch {
        /* The marketplace remains usable if proof data is temporarily unavailable. */
      }
    };
    loadProof();
  }, [artworkId]);

  const title = artworkData?.title || params.title;
  const price = artworkData?.price || params.price;
  const image = artworkData?.image || artworkData?.image_data || params.image;
  const galleryImages = [
    image,
    ...(Array.isArray(artworkData?.additional_images)
      ? artworkData.additional_images
      : []),
  ].filter(Boolean);
  const displayedImage = galleryImages[activeImageIndex] || image;
  const medium = artworkData?.category || params.medium;
  const artistName =
    artworkData?.artist_name || artworkData?.artist?.username || params.artist;
  const resolvedArtistId = String(
    artworkData?.artist?.id ||
      artworkData?.artist_id ||
      artworkData?.artist ||
      params.artistId ||
      "",
  );

  const backendSaleType = String(artworkData?.sale_type || "")
    .trim()
    .toLowerCase();
  const paramSaleType = String(params.sale_type || "")
    .trim()
    .toLowerCase();
  const paramType = String(params.type || "")
    .trim()
    .toLowerCase();

  const isAuction =
    backendSaleType === "auction" ||
    paramSaleType === "auction" ||
    paramType === "auction";

  const displayedBidIncrement = isAuction
    ? artworkData?.bid_increment || params.bidIncrement || "100.00"
    : "0";
  const displayedStartingtTime = isAuction
    ? artworkData?.starting_time ||
      artworkData?.start_time ||
      params.startingTime ||
      ""
    : "";

  const rawEnd = artworkData?.end_time || params.endTime;
  const fallbackEnd = artworkData?.created_at
    ? new Date(
        new Date(artworkData.created_at).getTime() + 24 * 60 * 60 * 1000,
      ).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const effectiveEndTime = isAuction
    ? rawEnd
      ? String(rawEnd)
      : fallbackEnd
    : "";

  const isDigital = String(
    artworkData?.art_type || artworkData?.category || params.medium || "",
  )
    .toLowerCase()
    .includes("digital");
  const isSold = Boolean(artworkData?.is_sold);

  useEffect(() => {
    const checkOwnership = async () => {
      if (!auth.currentUser || !resolvedArtistId) {
        setCheckingOwner(false);
        return;
      }
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch(`${API_URL}/auth/me/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const profile = response.ok ? await response.json() : null;
        setIsOwnArtwork(String(profile?.id) === String(resolvedArtistId));
      } finally {
        setCheckingOwner(false);
      }
    };
    checkOwnership().catch(() => setCheckingOwner(false));
  }, [resolvedArtistId]);

  const handleAddToCart = async () => {
    if (isOwnArtwork) {
      setDialog({
        title: "This is your artwork",
        message: "You cannot add your own artwork to the cart.",
        tone: "info",
      });
      return;
    }
    const user = auth.currentUser;

    if (!user) {
      setDialog({
        title: "Account required",
        message:
          "Create an account or log in before adding artwork to your cart.",
        tone: "info",
        primaryLabel: "Log in",
        onPrimary: () => router.push("/login"),
        secondaryLabel: "Continue browsing",
      });
      return;
    }

    try {
      await addToCart({
        artworkId: String(artworkId || ""),
        title: String(title),
        price: String(price),
        type: isAuction ? "Auction" : "Direct Sell",
        image: String(image),
        artistName: String(artistName),
      });

      setToast("Added to cart");
    } catch (error: any) {
      setDialog({
        title: "Unable to add to cart",
        message: error.message || "Please try again.",
        tone: "error",
      });
    }
  };

  const formatDate = (dateStr?: any) => {
    if (!dateStr) return "Active Now";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return String(dateStr);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(home)");
    }
  };

  return (
    <SafeAreaView style={styles.mainContainer} edges={["top", "left", "right"]}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.cardWrapper, isDesktop && styles.desktopWrapper]}>
          {/* Left side for web & top for mobile android/iOS */}
          <View
            style={[styles.imageHeader, isDesktop && styles.desktopImageHeader]}
          >
            <TouchableOpacity
              activeOpacity={0.96}
              onPress={() => setShowGallery(true)}
            >
              <Watermark
                uri={
                  (displayedImage as string) ||
                  "https://picsum.photos/seed/view/800/1200"
                }
                height={isDesktop ? 550 : 350}
              />
              <View style={styles.expandHint} pointerEvents="none">
                <Text style={styles.expandHintText}>Tap to view larger</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <ArrowLeft color="white" size={22} />
            </TouchableOpacity>
            {galleryImages.length > 1 && (
              <View style={styles.galleryStrip}>
                {galleryImages.map((galleryImage, index) => (
                  <TouchableOpacity
                    key={`${index}-${String(galleryImage).slice(-20)}`}
                    onPress={() => setActiveImageIndex(index)}
                    style={[
                      styles.galleryThumbnail,
                      activeImageIndex === index &&
                        styles.galleryThumbnailActive,
                    ]}
                  >
                    <Image
                      source={{ uri: galleryImage }}
                      style={styles.galleryThumbnailImage}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Right side for web & bottom side for mobile android/iOS */}
          <View
            style={[styles.contentCard, isDesktop && styles.desktopContentCard]}
          >
            <Text style={styles.date}>Posted Artwork</Text>
            <Text style={styles.title}>{title}</Text>

            {/* Artist Profile */}
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/artist-profile" as any,
                  params: { artistId: resolvedArtistId },
                })
              }
            >
              <Text style={styles.artistLink}>
                View artist profile ({artistName})
              </Text>
            </TouchableOpacity>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {isAuction ? "Auction" : isDigital ? "Digital" : "Physical"}
              </Text>
            </View>

            {proof?.status === "confirmed" && (
              <TouchableOpacity
                style={styles.verifiedBadge}
                onPress={() => setShowProof(true)}
              >
                <ShieldCheck color="#357A47" size={17} />
                <View>
                  <Text style={styles.verifiedTitle}>
                    Verified registration
                  </Text>
                  <Text style={styles.verifiedHint}>
                    Registered by ArtFiliere · View proof
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.detailsSection}>
              <Text style={styles.detailsHeader}>About the Art</Text>
              <Text style={styles.detailsText}>
                {artworkData?.description || "Original artwork on ArtFiliere."}
                {"\n"}
                Medium/Material:{" "}
                {isDigital ? "Digital" : (medium as string) || "Oil on Canvas"}
                {"\n"}
                {Array.isArray(artworkData?.tags) && artworkData.tags.length
                  ? `Tags: ${artworkData.tags.join(" · ").replace(/_/g, " ")}\n`
                  : ""}
                License: Standard Personal License{"\n"}
                Dimensions: 2000 x 3000 px
              </Text>
            </View>

            {/* Auction deets */}
            {isAuction && (
              <View style={styles.auctionDetailsBox}>
                <Text style={styles.auctionHeader}> Auction Parameters</Text>
                <Text style={styles.auctionText}>
                  Bid Increment: Php
                  {Number(displayedBidIncrement).toLocaleString()}
                </Text>
                <Text
                  style={[
                    styles.auctionText,
                    { fontWeight: "700", color: "#059d19", marginTop: 4 },
                  ]}
                >
                  Starts:{" "}
                  {displayedStartingtTime
                    ? new Date(displayedStartingtTime).toLocaleString()
                    : "Active Now"}
                </Text>
                <Text
                  style={[
                    styles.auctionText,
                    { fontWeight: "700", color: "#C15656", marginTop: 4 },
                  ]}
                >
                  Ends in: {formatTimer(effectiveEndTime)}
                </Text>
              </View>
            )}

            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>
                {isAuction ? "Starting / Current Bid:" : "Price:"}
              </Text>
              <Text style={styles.priceValue}>
                Php {Number(price || 0).toLocaleString()}
              </Text>
            </View>

            {/* If auction, Go to Auction / Place Bid is provided */}
            {isAuction ? (
              <TouchableOpacity
                style={[
                  styles.auctionBtn,
                  (isOwnArtwork || checkingOwner) && styles.cartBtnDisabled,
                ]}
                onPress={() => {
                  if (artworkId) {
                    router.push({
                      pathname: "/auction-dashboard",
                      params: { id: String(artworkId) },
                    } as any);
                  } else {
                    router.push("/auction-post" as any);
                  }
                }}
                disabled={isOwnArtwork || checkingOwner}
              >
                <Gavel color="#fff" size={18} style={{ marginRight: 8 }} />
                <Text style={styles.cardText}>
                  {isOwnArtwork ? "This is your auction" : "Enter Auction Room"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.cartBtn,
                  (isOwnArtwork || checkingOwner || isSold) &&
                    styles.cartBtnDisabled,
                ]}
                onPress={handleAddToCart}
                disabled={isOwnArtwork || checkingOwner || isSold}
              >
                <ShoppingCart
                  color="#fff"
                  size={18}
                  style={{ marginRight: 8 }}
                />
                {checkingOwner ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.cartText}>
                    {isOwnArtwork
                      ? "This is your artwork"
                      : isSold
                        ? "No longer available"
                        : "Add to Cart"}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.reviewsSection}>
          <View style={styles.reviewsHeader}>
            <View>
              <Text style={styles.reviewsTitle}>Reviews & Feedback</Text>
              <Text style={styles.reviewsSubtext}>
                {reviews.review_count
                  ? `${reviews.review_count} verified buyer ${reviews.review_count === 1 ? "review" : "reviews"}`
                  : "Feedback from verified buyers"}
              </Text>
            </View>
            {reviews.average_rating !== null && (
              <View style={styles.ratingSummary}>
                <Star size={18} color="#D48C62" fill="#D48C62" />
                <Text style={styles.ratingValue}>
                  {reviews.average_rating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
          {!reviews.review_count ? (
            <Text style={styles.emptyReviews}>
              No verified buyer reviews yet. Feedback becomes available after a
              completed purchase.
            </Text>
          ) : (
            reviews.reviews.map((review, index) => (
              <View
                key={`${review.reviewer}-${index}`}
                style={styles.reviewCard}
              >
                <View style={styles.reviewTop}>
                  <Text style={styles.reviewer}>{review.reviewer}</Text>
                  <View style={styles.reviewRating}>
                    <Star size={14} color="#D48C62" fill="#D48C62" />
                    <Text style={styles.reviewRatingText}>
                      {review.rating}.0
                    </Text>
                  </View>
                </View>
                <Text style={styles.verifiedBuyer}>✓ Verified purchase</Text>
                {review.comment ? (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                ) : (
                  <Text style={styles.reviewCommentMuted}>
                    Buyer left a rating without a written comment.
                  </Text>
                )}
                <Text style={styles.reviewDate}>
                  {new Date(review.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <Modal
        visible={showGallery}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGallery(false)}
      >
        <View style={styles.galleryModal}>
          <View style={styles.galleryModalHeader}>
            <Text style={styles.galleryCounter}>
              {activeImageIndex + 1} of {galleryImages.length}
            </Text>
            <TouchableOpacity
              style={styles.galleryClose}
              onPress={() => setShowGallery(false)}
            >
              <X color="#FFFFFF" size={23} />
            </TouchableOpacity>
          </View>
          <View style={styles.galleryViewer}>
            <Watermark
              uri={
                (displayedImage as string) ||
                "https://picsum.photos/seed/view/800/1200"
              }
              height={isDesktop ? 680 : 500}
            />
            {galleryImages.length > 1 && (
              <>
                <TouchableOpacity
                  style={[styles.galleryArrow, styles.galleryArrowLeft]}
                  onPress={() =>
                    setActiveImageIndex(
                      (index) =>
                        (index - 1 + galleryImages.length) %
                        galleryImages.length,
                    )
                  }
                >
                  <ChevronLeft color="#FFFFFF" size={30} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.galleryArrow, styles.galleryArrowRight]}
                  onPress={() =>
                    setActiveImageIndex(
                      (index) => (index + 1) % galleryImages.length,
                    )
                  }
                >
                  <ChevronRight color="#FFFFFF" size={30} />
                </TouchableOpacity>
              </>
            )}
          </View>
          {galleryImages.length > 1 && (
            <View style={styles.galleryModalStrip}>
              {galleryImages.map((galleryImage, index) => (
                <TouchableOpacity
                  key={`full-${index}-${String(galleryImage).slice(-20)}`}
                  onPress={() => setActiveImageIndex(index)}
                  style={[
                    styles.galleryThumbnail,
                    activeImageIndex === index && styles.galleryThumbnailActive,
                  ]}
                >
                  <Image
                    source={{ uri: galleryImage }}
                    style={styles.galleryThumbnailImage}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </Modal>
      {showProof && proof && (
        <View style={styles.proofOverlay}>
          <View style={styles.proofCard}>
            <View style={styles.proofIcon}>
              <CheckCircle2 color="#357A47" size={30} />
            </View>
            <Text style={styles.proofTitle}>Verified by ArtFiliere</Text>
            <Text style={styles.proofText}>
              This artwork was approved by ArtFiliere and its file was securely
              registered. This helps confirm that the artwork listing has not
              been changed after approval.
            </Text>
            <View style={styles.proofStatus}>
              <Text style={styles.proofStatusText}>
                ✓ Registration confirmed
              </Text>
            </View>
            <Text style={styles.proofDate}>
              Registration proof is securely recorded by ArtFiliere.
            </Text>
            <TouchableOpacity
              style={styles.closeProof}
              onPress={() => setShowProof(false)}
            >
              <Text style={styles.closeProofText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {dialog && (
        <AppDialog
          visible
          title={dialog.title}
          message={dialog.message}
          tone={dialog.tone}
          primaryLabel={dialog.primaryLabel}
          onPrimary={dialog.onPrimary}
          secondaryLabel={dialog.secondaryLabel}
          onSecondary={dialog.onSecondary}
          onClose={() => setDialog(null)}
        />
      )}
      <AppToast
        visible={Boolean(toast)}
        message={toast}
        onDismiss={() => setToast("")}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#F4F5F7" },
  scrollContent: { alignItems: "center", paddingBottom: 100 },
  cardWrapper: { width: "100%", maxWidth: 800, backgroundColor: "#fff" },
  desktopWrapper: {
    maxWidth: 1000,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 16,
    marginTop: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  imageHeader: { position: "relative", width: "100%" },
  desktopImageHeader: {
    flex: 1.1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  backButton: {
    position: "absolute",
    top: 16,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 8,
    zIndex: 10,
  },
  galleryStrip: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
    zIndex: 10,
  },
  galleryThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 7,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
    backgroundColor: "#FFFFFF",
  },
  galleryThumbnailActive: { borderColor: "#D75B5C" },
  galleryThumbnailImage: { width: "100%", height: "100%" },
  expandHint: {
    position: "absolute",
    right: 12,
    bottom: 12,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  expandHintText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  galleryModal: {
    flex: 1,
    backgroundColor: "rgba(12,12,12,0.97)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  galleryModalHeader: {
    width: "100%",
    maxWidth: 1000,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  galleryCounter: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  galleryClose: {
    padding: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  galleryViewer: {
    width: "100%",
    maxWidth: 1000,
    position: "relative",
    backgroundColor: "#000000",
  },
  galleryArrow: {
    position: "absolute",
    top: "48%",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.54)",
  },
  galleryArrowLeft: { left: 12 },
  galleryArrowRight: { right: 12 },
  galleryModalStrip: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    maxWidth: "100%",
  },
  contentCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    marginTop: -20,
  },
  desktopContentCard: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: 0,
    padding: 36,
    justifyContent: "center",
  },
  date: { color: "#C15656", fontSize: 11, fontWeight: "bold" },
  title: { fontSize: 24, fontWeight: "bold", color: "#C15656", marginTop: 4 },
  artistLink: {
    color: "#8B6E49",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
    textDecorationLine: "underline",
  },
  badge: {
    borderWidth: 1,
    borderColor: "#C15656",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  badgeText: { color: "#C15656", fontSize: 10, fontWeight: "bold" },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECF8EF",
    borderWidth: 1,
    borderColor: "#B7DFC0",
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  verifiedTitle: { color: "#276438", fontSize: 12, fontWeight: "800" },
  verifiedHint: { color: "#5B8063", fontSize: 10, marginTop: 1 },
  proofOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(32,29,28,.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  proofCard: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: "#FFFDF5",
    borderRadius: 16,
    padding: 22,
    alignItems: "center",
  },
  proofIcon: { backgroundColor: "#E7F5E9", padding: 11, borderRadius: 28 },
  proofTitle: {
    color: "#2E4934",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 10,
  },
  proofText: {
    color: "#685E59",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
  },
  proofStatus: {
    backgroundColor: "#E7F5E9",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 14,
  },
  proofStatusText: { color: "#357A47", fontSize: 11, fontWeight: "800" },
  proofDate: {
    color: "#7B6A65",
    fontSize: 11,
    textAlign: "center",
    marginTop: 16,
  },
  closeProof: {
    backgroundColor: "#C15656",
    paddingHorizontal: 25,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 20,
  },
  closeProofText: { color: "#fff", fontWeight: "800" },
  detailsSection: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#EDF2F7",
    paddingTop: 14,
  },
  detailsHeader: { fontWeight: "bold", color: "#C15656", fontSize: 14 },
  detailsText: { color: "#4A5568", fontSize: 13, marginTop: 4, lineHeight: 20 },
  reviewsSection: {
    width: "100%",
    maxWidth: 1000,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  reviewsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  reviewsTitle: { color: "#3A2D2A", fontSize: 20, fontWeight: "800" },
  reviewsSubtext: { color: "#8A7C76", fontSize: 12, marginTop: 3 },
  ratingSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF5E8",
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  ratingValue: { color: "#8B5D25", fontSize: 15, fontWeight: "800" },
  emptyReviews: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E9DDD6",
    padding: 18,
    color: "#75655F",
    fontSize: 13,
    lineHeight: 19,
  },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E9DDD6",
    padding: 16,
    marginBottom: 10,
  },
  reviewTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reviewer: { color: "#3A2D2A", fontSize: 14, fontWeight: "800" },
  reviewRating: { flexDirection: "row", alignItems: "center", gap: 4 },
  reviewRatingText: { color: "#8B5D25", fontSize: 13, fontWeight: "800" },
  verifiedBuyer: {
    color: "#4F8657",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5,
  },
  reviewComment: {
    color: "#5D514D",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  reviewCommentMuted: {
    color: "#8A7C76",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 10,
  },
  reviewDate: { color: "#9A8B84", fontSize: 11, marginTop: 10 },
  priceContainer: { marginTop: "auto", paddingTop: 16 },
  priceLabel: { fontWeight: "bold", color: "#C15656", marginTop: 10 },
  priceValue: { fontSize: 32, fontWeight: "bold", color: "#C15656" },
  cartBtn: {
    flexDirection: "row",
    backgroundColor: "#C15656",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  cartBtnDisabled: { backgroundColor: "#A99B96" },
  cartText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  // Added for auction
  auctionDetailsBox: {
    backgroundColor: "#FFF5F5",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F5C6CB",
    marginBottom: 16,
    top: 20,
  },
  auctionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#D75B5C",
    marginBottom: 6,
  },
  auctionText: { fontSize: 12, color: "#555", marginBottom: 3 },
  auctionBtn: {
    flexDirection: "row",
    backgroundColor: "#7B241C",
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    top: 10,
  },
  cardText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
