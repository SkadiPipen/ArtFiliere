import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import AgreementDocument from "@/module/messages/components/AgreementDocument";
import AgreementPaper from '@/module/messages/components/AgreementPaper';
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  CheckCircle2,
  LogOut,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Match = {
  id: number;
  reference_title: string;
  reference_artist_name: string;
  reference_image_data: string;
  confidence_score: number;
  edge_hash_distance: number;
  feature_match_score: number;
  color_similarity_score: number;
  review_status: "pending" | "confirmed_copy" | "not_a_copy";
};
type Artwork = {
  id: number;
  artist_name: string;
  title: string;
  description: string;
  category: string;
  price: string;
  image_data: string;
  additional_images?: string[];
  art_type?: string;
  sale_type?: string;
  bid_increment?: string;
  starting_time?: string;
  end_time?: string;
  hours?: string;
  hourly_rate?: string;
  material_cost?: string;
  tags?: string[];
  auction_request?: any;
  status: "pending" | "approved" | "declined";
  decline_reason?: string;
  similarity_matches: Match[];
};
const label = (value: string) => value.replace("_", " ");

export default function CreativeDashboardScreen() {
  const { artworkId } = useLocalSearchParams<{ artworkId?: string }>();
  const openedArtwork = useRef<string | undefined>(undefined);
  const [items, setItems] = useState<Artwork[]>([]);
  const [activeTab, setActiveTab] = useState<Artwork["status"]>("pending");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Artwork | null>(null);
  const [viewingAgreement, setViewingAgreement] = useState(false);
  useEffect(() => { setViewingAgreement(false); }, [selected?.id]);
  const [reason, setReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [saving, setSaving] = useState(false);
  const token = async () => {
    if (!auth.currentUser) throw new Error("Please log in again.");
    return auth.currentUser.getIdToken();
  };
  const pending = (artwork: Artwork) =>
    artwork.similarity_matches?.filter(
      (match) => match.review_status === "pending",
    ) ?? [];
  const replaceArtwork = (artwork: Artwork) => {
    setSelected(artwork);
    setItems((all) =>
      all.map((item) => (item.id === artwork.id ? artwork : item)),
    );
  };
  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/users/artworks/`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems(data);
    } catch (error: any) {
      Alert.alert(
        "Creative Portal",
        error.message || "Unable to load artwork.",
      );
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(useCallback(() => {
    load();
  }, []));
  useEffect(() => {
    if (loading || !artworkId || openedArtwork.current === artworkId) return;
    const artwork = items.find(item => item.id === Number(artworkId));
    openedArtwork.current = artworkId;
    if (!artwork) {
      Alert.alert("Artwork review", "This artwork is unavailable. Refresh the artwork list.");
      return;
    }
    setActiveTab(artwork.status); setSelected(artwork);
    setDeclining(false); setReason("");
  }, [loading, items, artworkId]);
  const visibleItems = items.filter((artwork) => artwork.status === activeTab);
  const pendingCount = items.filter(
    (artwork) => artwork.status === "pending",
  ).length;
  const approvedCount = items.filter(
    (artwork) => artwork.status === "approved",
  ).length;
  const reviewMatch = async (
    match: Match,
    review_status: "confirmed_copy" | "not_a_copy",
  ) => {
    if (!selected) return;
    try {
      setSaving(true);
      const response = await fetch(
        `${API_URL}/api/users/artwork-similarity/${match.id}/review/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${await token()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ review_status }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      replaceArtwork({
        ...selected,
        similarity_matches: selected.similarity_matches.map((item) =>
          item.id === match.id ? { ...item, review_status } : item,
        ),
      });
    } catch (error: any) {
      Alert.alert(
        "Similarity review",
        error.message || "Unable to save this decision.",
      );
    } finally {
      setSaving(false);
    }
  };
  const reviewArtwork = async (status: "approved" | "declined") => {
    if (!selected || (status === "declined" && !reason.trim())) return;
    try {
      setSaving(true);
      const response = await fetch(
        `${API_URL}/api/users/artworks/${selected.id}/review/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${await token()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status, decline_reason: reason.trim() }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems((all) =>
        all.map((item) =>
          item.id === selected.id ? data : item,
        ),
      );
      setSelected(null);
      setDeclining(false);
      setReason("");
      Alert.alert(
        status === "approved" ? "Artwork approved" : "Artwork declined",
        "The artist has been notified.",
      );
    } catch (error: any) {
      Alert.alert("Review failed", error.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.brand}>ArtFiliere</Text>
          <Text style={s.subtitle}>CREATIVE MODERATOR PORTAL</Text>
        </View>
        <TouchableOpacity
          onPress={async () => {
            await auth.signOut();
            router.replace("/login");
          }}
          style={s.logout}
        >
          <LogOut size={16} color="#5A4039" />
          <Text style={s.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Artwork moderation</Text>
        <Text style={s.lead}>
          Review pending work and reconsider declined artwork from artist appeals.
        </Text>
        <TouchableOpacity accessibilityRole="button" style={[s.tab, { alignSelf: "flex-start", marginBottom: 16 }]} onPress={() => router.push("/moderator-dashboard")}>
          <Text style={s.tabText}>Artist appeals and reports</Text>
        </TouchableOpacity>
        <View style={s.tabs}>
          <TouchableOpacity
            style={[s.tab, activeTab === "pending" && s.tabActive]}
            onPress={() => setActiveTab("pending")}
          >
            <Text
              style={[s.tabText, activeTab === "pending" && s.tabTextActive]}
            >
              Pending ({pendingCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === "approved" && s.tabActive]}
            onPress={() => setActiveTab("approved")}
          >
            <Text
              style={[s.tabText, activeTab === "approved" && s.tabTextActive]}
            >
              Approved ({approvedCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, activeTab === "declined" && s.tabActive]} onPress={() => setActiveTab("declined")}>
            <Text style={[s.tabText, activeTab === "declined" && s.tabTextActive]}>
              Declined ({items.filter(item => item.status === "declined").length})
            </Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator size="large" color="#C15656" style={s.loader} />
        ) : visibleItems.length ? (
          visibleItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={s.card}
              onPress={() => {
                setSelected(item);
                setDeclining(false);
                setReason("");
              }}
            >
              <Image source={{ uri: item.image_data }} style={s.thumb} />
              <View style={s.cardInfo}>
                <Text style={s.cardTitle}>{item.title}</Text>
                <Text style={s.artist}>
                  by {item.artist_name} · ₱ {item.price}
                </Text>
                <View style={s.badges}>
                  <Text
                    style={[
                      s.badge,
                      item.status === "approved" ? s.approved : item.status === "declined" ? s.alert : s.pending,
                    ]}
                  >
                    {label(item.status)}
                  </Text>
                  {!!pending(item).length && (
                    <Text style={[s.badge, s.alert]}>
                      {pending(item).length} match
                      {pending(item).length === 1 ? "" : "es"} to review
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={s.empty}>
            {activeTab === "pending"
              ? "No artwork is waiting for review."
              : `No ${activeTab} artwork yet.`}
          </Text>
        )}
      </ScrollView>
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={s.backdrop} onPress={() => setSelected(null)}>
          <Pressable
            style={s.modal}
            onPress={(event) => event.stopPropagation()}
          >
            {selected && (
              <>
                <View style={s.modalHeader}>
                  <View>
                    <Text style={s.overline}>ARTWORK REVIEW</Text>
                    <Text style={s.modalTitle} numberOfLines={1}>
                      {selected.title}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={s.close}
                    onPress={() => setSelected(null)}
                  >
                    <X size={20} color="#6D5C57" />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={s.modalContent}>
                  <Image source={{ uri: selected.image_data }} style={s.hero} />
                  <Text style={s.artist}>
                    by {selected.artist_name} · ₱ {selected.price}
                  </Text>
                  <Text style={s.category}>{selected.category}</Text>
                  <Text style={s.description}>{selected.description}</Text>
                  {selected.status === "declined" && !!selected.decline_reason && <Text style={s.copyResolved}>Rejection reason: {selected.decline_reason}</Text>}
                  <Text style={s.detailTitle}>Submitted details</Text>
                  <Text style={s.detailText}>Sale type: {selected.sale_type || "Direct Sell"}</Text>
                  <Text style={s.detailText}>Artwork type: {selected.art_type || "Not specified"}</Text>
                  <Text style={s.detailText}>Tags: {selected.tags?.join(", ") || "None"}</Text>
                  {!!selected.additional_images?.length && (
                    <ScrollView horizontal contentContainerStyle={s.gallery}>
                      {selected.additional_images.map((uri, index) => (
                        <Image key={`${uri}-${index}`} source={{ uri }} style={s.galleryImage} />
                      ))}
                    </ScrollView>
                  )}
                  {selected.auction_request && (
                    <View style={s.auctionDetails}>
                      <Text style={s.detailTitle}>Auction request</Text>
                      <Text style={s.detailText}>Starts: {new Date(selected.auction_request.start_time).toLocaleString()}</Text>
                      <Text style={s.detailText}>Ends: {new Date(selected.auction_request.end_time).toLocaleString()}</Text>
                      <Text style={s.detailText}>Starting bid: ₱{selected.auction_request.starting_bid} · Increment: ₱{selected.auction_request.bid_increment}</Text>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="View auction license agreement" style={s.agreementButton} onPress={() => setViewingAgreement(true)}>
                        <Text style={s.agreementButtonText}>View auction license agreement</Text>
                        <Text style={s.detailText}>Open the full terms and licensing details</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <View style={s.sectionHeader}>
                    <ShieldAlert size={18} color="#A86868" />
                    <View>
                      <Text style={s.sectionTitle}>Similarity check</Text>
                      <Text style={s.sectionHint}>
                        Structure is primary evidence; colour supports the
                        decision.
                      </Text>
                    </View>
                  </View>
                  {selected.similarity_matches.length === 0 ? (
                    <View style={s.safe}>
                      <CheckCircle2 size={18} color="#5D8A63" />
                      <Text style={s.safeText}>
                        No internal similarity matches require review.
                      </Text>
                    </View>
                  ) : (
                    selected.similarity_matches.map((match) => (
                      <View key={match.id} style={s.match}>
                        <View style={s.matchTop}>
                          <Text style={s.matchTitle}>Possible match · {label(match.review_status)}</Text>
                          <Text style={s.confidence}>
                            {Math.round(match.confidence_score * 100)}% visual
                            confidence
                          </Text>
                        </View>
                        <View style={s.matchBody}>
                          <Image
                            source={{ uri: match.reference_image_data }}
                            style={s.matchImage}
                          />
                          <View style={s.matchInfo}>
                            <Text style={s.referenceTitle} numberOfLines={1}>
                              {match.reference_title}
                            </Text>
                            <Text style={s.artist} numberOfLines={1}>
                              by {match.reference_artist_name}
                            </Text>
                            <Text style={s.metric}>
                              Edge {match.edge_hash_distance} · Features{" "}
                              {Math.round(match.feature_match_score * 100)}%
                            </Text>
                            <Text style={s.metric}>
                              Palette{" "}
                              {Math.round(match.color_similarity_score * 100)}%
                            </Text>
                          </View>
                        </View>
                        {match.review_status === "pending" || selected.status === "declined" ? (
                          <View style={s.matchActions}>
                            <TouchableOpacity
                              disabled={saving}
                              style={s.notCopy}
                              onPress={() => reviewMatch(match, "not_a_copy")}
                            >
                              <Text style={s.notCopyText}>Not a copy</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              disabled={saving}
                              style={s.copy}
                              onPress={() =>
                                reviewMatch(match, "confirmed_copy")
                              }
                            >
                              <Text style={s.buttonText}>Confirm copy</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Text
                            style={[
                              s.resolved,
                              match.review_status === "confirmed_copy" &&
                                s.copyResolved,
                            ]}
                          >
                            {label(match.review_status)}
                          </Text>
                        )}
                      </View>
                    ))
                  )}
                  {(selected.status === "pending" || selected.status === "declined") && (
                    <View style={s.decision}>
                      <Text style={s.sectionTitle}>{selected.status === "declined" ? "Reconsider artwork" : "Artwork decision"}</Text>
                      {declining && (
                        <>
                          <Text style={s.reasonLabel}>
                            Reason for declining
                          </Text>
                          <TextInput
                            style={s.reason}
                            value={reason}
                            onChangeText={setReason}
                            multiline
                            placeholder="Explain what the artist needs to change..."
                            placeholderTextColor="#9A8D88"
                          />
                        </>
                      )}
                      <View style={s.actions}>
                        {declining ? (
                          <>
                            <TouchableOpacity
                              disabled={saving}
                              style={s.cancel}
                              onPress={() => setDeclining(false)}
                            >
                              <Text style={s.buttonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              disabled={saving || !reason.trim()}
                              style={[
                                s.decline,
                                (!reason.trim() || saving) && s.disabled,
                              ]}
                              onPress={() => reviewArtwork("declined")}
                            >
                              <XCircle color="#fff" size={16} />
                              <Text style={s.buttonText}>
                                {saving ? "Saving..." : "Confirm decline"}
                              </Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <TouchableOpacity
                              disabled={saving}
                              style={s.decline}
                              onPress={() => setDeclining(true)}
                            >
                              <XCircle color="#fff" size={16} />
                              <Text style={s.buttonText}>Decline</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              disabled={saving}
                              style={s.approve}
                              onPress={() => reviewArtwork("approved")}
                            >
                              <CheckCircle2 color="#fff" size={16} />
                              <Text style={s.buttonText}>
                                {saving ? "Saving..." : "Approve artwork"}
                              </Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  )}
                </ScrollView>
                <Modal visible={viewingAgreement} animationType="slide" onRequestClose={() => setViewingAgreement(false)}>
                  <View style={s.agreementPage}>
                    <View style={s.agreementHeader}>
                      <View style={{ flex: 1 }}><Text style={s.modalTitle}>Auction license agreement</Text><Text style={s.detailText}>{selected.title} · {selected.artist_name}</Text></View>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close auction license agreement" style={s.close} onPress={() => setViewingAgreement(false)}><X size={22} color="#6D5C57" /></TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={s.agreementContent}>
                      <Text style={s.detailText}>Artist-submitted auction terms · Moderator review</Text>
                      {selected.auction_request?.signed_document ? <>
                        <AgreementPaper document={selected.auction_request.signed_document} />
                        <Text style={s.detailText}>Artist: {selected.auction_request.artist_signature} · Signed {new Date(selected.auction_request.artist_signed_at).toLocaleString()}</Text>
                        {!!selected.auction_request.artist_signature_image && <Image source={{ uri: selected.auction_request.artist_signature_image }} style={{ width: '100%', height: 100 }} resizeMode="contain" />}
                        <Text selectable style={s.detailText}>Document reference: {selected.auction_request.signed_document_hash}</Text>
                        <Text style={s.detailText}>Buyer: winning bidder—to be determined. Buyer signs after the auction ends.</Text>
                      </> : selected.auction_request && <AgreementDocument terms={{
                        terms: selected.auction_request.terms || 'No agreement terms were provided.',
                        licenseType: selected.auction_request.license_type || 'not_specified',
                        exclusivity: selected.auction_request.exclusivity || 'not_specified',
                        deliveryType: selected.auction_request.delivery_type || 'not_specified',
                        compensationType: 'one_time',
                      }} />}
                      <TouchableOpacity accessibilityRole="button" style={s.agreementButton} onPress={() => setViewingAgreement(false)}><Text style={s.agreementButtonText}>Back to artwork review</Text></TouchableOpacity>
                    </ScrollView>
                  </View>
                </Modal>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  agreementButton: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#D8A39A', backgroundColor: '#FFF4EE', gap: 4, marginTop: 10 },
  agreementButtonText: { color: '#A34E45', fontWeight: '700', fontSize: 14 },
  agreementPage: { flex: 1, backgroundColor: '#FFFDF8', paddingTop: 40 },
  agreementHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: '#E8DCD7' },
  agreementContent: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 20, paddingBottom: 50, gap: 14 },
  detailTitle: { color: "#7A4B43", fontWeight: "900", fontSize: 15, marginTop: 14 },
  detailText: { color: "#5F514C", fontSize: 13, lineHeight: 20 },
  auctionDetails: { marginTop: 8, gap: 4 },
  gallery: { gap: 8, marginTop: 10 },
  galleryImage: { width: 110, height: 90, borderRadius: 8, backgroundColor: "#EEE" },
  page: { flex: 1, backgroundColor: "#FFFDF5" },
  header: {
    height: 86,
    backgroundColor: "#FFF8D6",
    borderBottomWidth: 2,
    borderColor: "#D87964",
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { color: "#D45C5C", fontSize: 25, fontWeight: "800" },
  subtitle: {
    color: "#8B6E49",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  logout: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 18,
  },
  logoutText: { color: "#5A4039", fontWeight: "700", fontSize: 12 },
  content: { width: "100%", maxWidth: 850, alignSelf: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "800", color: "#322B29" },
  lead: { fontSize: 13, color: "#746865", marginTop: 5, marginBottom: 18 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  tab: {
    borderWidth: 1,
    borderColor: "#E3D8CC",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  tabActive: { backgroundColor: "#C15656", borderColor: "#C15656" },
  tabText: { color: "#7C6A64", fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: "#FFFFFF" },
  loader: { marginTop: 60 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E3D8CC",
    padding: 10,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  thumb: { width: 70, height: 70, borderRadius: 8, backgroundColor: "#eee" },
  cardInfo: { flex: 1, justifyContent: "center" },
  cardTitle: { color: "#3A2D2A", fontWeight: "800", fontSize: 15 },
  artist: { color: "#7C6A64", fontSize: 12, marginTop: 3 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  badge: {
    borderRadius: 10,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  pending: { backgroundColor: "#FFF1CE", color: "#9A6813" },
  approved: { backgroundColor: "#E5F2E6", color: "#407648" },
  alert: { backgroundColor: "#FCE8E6", color: "#A84A44" },
  empty: { color: "#7C6A64", textAlign: "center", marginTop: 60 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(35,28,25,.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modal: {
    width: "100%",
    maxWidth: 580,
    maxHeight: "92%",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "#EFE5DC",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  overline: {
    color: "#C15656",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  modalTitle: {
    color: "#332925",
    fontSize: 21,
    fontWeight: "800",
    marginTop: 3,
    maxWidth: 450,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F5EFEB",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: { padding: 20, paddingBottom: 28 },
  hero: {
    width: "100%",
    height: 240,
    borderRadius: 10,
    backgroundColor: "#eee",
  },
  category: { color: "#A86868", fontSize: 11, fontWeight: "800", marginTop: 5 },
  description: {
    color: "#514541",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 15,
  },
  sectionHeader: {
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTitle: { color: "#433633", fontSize: 15, fontWeight: "800" },
  sectionHint: { color: "#857671", fontSize: 11, marginTop: 2 },
  safe: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: "#EEF7EE",
    padding: 12,
    borderRadius: 8,
  },
  safeText: { color: "#426F48", fontSize: 12, fontWeight: "700", flex: 1 },
  match: {
    borderWidth: 1,
    borderColor: "#E8D8D1",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#FFFDFC",
  },
  matchTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  matchTitle: { color: "#7D4D45", fontSize: 13, fontWeight: "800" },
  confidence: { color: "#A84A44", fontSize: 11, fontWeight: "800" },
  matchBody: { flexDirection: "row", gap: 10, marginTop: 10 },
  matchImage: {
    width: 96,
    height: 78,
    borderRadius: 7,
    backgroundColor: "#eee",
  },
  matchInfo: { flex: 1, justifyContent: "center" },
  referenceTitle: { color: "#433633", fontSize: 13, fontWeight: "800" },
  metric: { color: "#857671", fontSize: 11, marginTop: 4 },
  matchActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  notCopy: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#CDBDB4",
  },
  notCopyText: { color: "#685851", fontSize: 11, fontWeight: "800" },
  copy: {
    backgroundColor: "#A86868",
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 7,
  },
  resolved: {
    color: "#4F8757",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize",
    marginTop: 11,
  },
  copyResolved: { color: "#A84A44" },
  decision: {
    borderTopWidth: 1,
    borderColor: "#EFE5DC",
    marginTop: 14,
    paddingTop: 18,
  },
  reasonLabel: {
    color: "#C15656",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 5,
  },
  reason: {
    borderWidth: 1,
    borderColor: "#DCCFC7",
    borderRadius: 8,
    minHeight: 90,
    padding: 10,
    textAlignVertical: "top",
    color: "#514541",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 9,
    marginTop: 16,
  },
  approve: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#5D8A63",
    borderRadius: 7,
    padding: 11,
  },
  decline: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#A86868",
    borderRadius: 7,
    padding: 11,
  },
  cancel: { backgroundColor: "#8A7C76", borderRadius: 7, padding: 11 },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.5 },
});
