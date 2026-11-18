import { Text, TextInput } from '@/components/Typography';
import ReviewTransition from './ReviewTransition';
import SimilarityAssessment, { type SimilarityMatch } from './SimilarityAssessment';
import ZoomableArtwork from '@/module/artwork/components/ZoomableArtwork';
import ArtistRecordReviews from './ArtistRecordReviews';
import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import ArtworkHistoryPanel from '@/module/blockchain/ArtworkHistoryPanel';
import { screeningScoreLabel, type ScreeningScore } from '@/services/artworkScreening';
import AgreementDocument from "@/module/messages/components/AgreementDocument";
import AgreementPaper from '@/module/messages/components/AgreementPaper';
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  CheckCircle2,
  LogOut,
  ShieldAlert,
  ZoomIn,
  X,
  XCircle,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from "react-native";

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
  automated_block_reason?: string;
  ai_screening?: ScreeningScore & { threshold: number; review_status: string; review_note?: string; images?: (ScreeningScore & { image_index: number })[] } | null;
  similarity_matches: SimilarityMatch[];
};
const label = (value: string) => value.replace("_", " ");

export default function CreativeDashboardScreen({ embedded = false }: { embedded?: boolean }) {
  const { width, height } = useWindowDimensions();
  const reviewLandscape = width >= 1000;
  const [viewingImage, setViewingImage] = useState<{ uri: string; label: string } | null>(null);
  const { artworkId } = useLocalSearchParams<{ artworkId?: string }>();
  const openedArtwork = useRef<string | undefined>(undefined);
  const [items, setItems] = useState<Artwork[]>([]);
  const [activeTab, setActiveTab] = useState<Artwork["status"] | 'auto_blocked'>("pending");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Artwork | null>(null);
  const [viewingAgreement, setViewingAgreement] = useState(false);
  useEffect(() => { setViewingImage(null); setViewingAgreement(false); }, [selected?.id]);
  useEffect(() => { setViewingAgreement(false); }, [selected?.id]);
  const [reason, setReason] = useState("");
  const [reviewNote, setReviewNote] = useState('');
  useEffect(() => { setReviewNote(''); }, [selected?.id]);
  const readOnlyBlock = !!selected?.automated_block_reason && selected.automated_block_reason !== 'high_similarity';
  const needsSimilarityReason = !!selected?.similarity_matches.length;
  const [aiNote, setAiNote] = useState('');
  useEffect(() => { setAiNote(''); }, [selected?.id]);
  const [declining, setDeclining] = useState(false);
  const [saving, setSaving] = useState(false);
  const approvalDisabled = saving || (selected?.ai_screening?.status === 'review_required' && selected.ai_screening.review_status !== 'cleared') || (needsSimilarityReason && reviewNote.trim().length < 20);
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
    setActiveTab(artwork.automated_block_reason ? 'auto_blocked' : artwork.status); setSelected(artwork);
    setDeclining(false); setReason("");
  }, [loading, items, artworkId]);
  const visibleItems = items.filter((artwork) => activeTab === 'auto_blocked' ? !!artwork.automated_block_reason : artwork.status === activeTab && !artwork.automated_block_reason);
  const pendingCount = items.filter(
    (artwork) => artwork.status === "pending",
  ).length;
  const approvedCount = items.filter(
    (artwork) => artwork.status === "approved",
  ).length;
  const clearAIFlag = async () => {
    if (!selected || aiNote.trim().length < 20 || saving) return;
    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/api/users/artworks/${selected.id}/ai-review/`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: aiNote.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      replaceArtwork(data);
    } catch (error: any) { Alert.alert('AI screening review', error.message || 'Unable to record review.'); }
    finally { setSaving(false); }
  };
  const reviewArtwork = async (status: "approved" | "declined") => {
    if (!selected || saving || (status === "approved" && approvalDisabled) || (status === "declined" && !reason.trim())) return;
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
          body: JSON.stringify({ status, decline_reason: reason.trim(), review_note: reviewNote.trim() }),
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
      {!embedded && <View style={s.header}>
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
      </View>}
      <ScrollView contentContainerStyle={[s.content, embedded && { maxWidth: 1360, padding: 28, paddingBottom: 60 }]}>
        {!embedded && <ArtistRecordReviews />}
        <Text style={s.title}>Artwork moderation</Text>
        {!embedded && <>
        <TouchableOpacity onPress={() => router.push('/attribution-reviews' as any)}><Text style={{ color: '#B74F50', fontWeight: '700', paddingVertical: 12 }}>Attribution & ownership reviews</Text></TouchableOpacity>
        </>}
        <Text style={s.lead}>
          Review automatic similarity assessments and make the final artwork decision. Exact-file publication blocks remain read-only evidence.
        </Text>
        {!embedded && <>
        <TouchableOpacity accessibilityRole="button" style={[s.tab, { alignSelf: "flex-start", marginBottom: 16 }]} onPress={() => router.push("/moderator-dashboard")}>
          <Text style={s.tabText}>Artist appeals and reports</Text>
        </TouchableOpacity>
        </>}
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
              Declined ({items.filter(item => item.status === "declined" && !item.automated_block_reason).length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, activeTab === 'auto_blocked' && s.tabActive]} onPress={() => setActiveTab('auto_blocked')}><Text style={[s.tabText, activeTab === 'auto_blocked' && s.tabTextActive]}>Auto-blocked ({items.filter(item => !!item.automated_block_reason).length})</Text></TouchableOpacity>
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
                  {item.status !== 'approved' && !!pending(item).length && (
                    <Text style={[s.badge, s.alert]}>
                      {pending(item).length} match
                      {pending(item).length === 1 ? "" : "es"} to review
                    </Text>
                  )}
                  {!!item.automated_block_reason && <Text style={[s.badge, s.alert]}>Auto-blocked · view only</Text>}
                  {(item.ai_screening?.status === 'auto_blocked' || (item.ai_screening?.status === 'review_required' && item.ai_screening.review_status !== 'cleared')) && <Text style={[s.badge, s.alert]}>AI flag</Text>}
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
              <ReviewTransition key={selected.id}>
                <View style={s.modalHeader}>
                  <View style={{ flex: 1, minWidth: 0 }}>
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
                <ScrollView contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
                  <View style={[s.reviewGrid, { flexDirection: reviewLandscape ? 'row' : 'column' }]}>
                  <View style={[s.reviewColumn, s.reviewLeft, !reviewLandscape && { flex: undefined, width: '100%' }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Open artwork image for zooming and dragging" onPress={() => setViewingImage({ uri: selected.image_data, label: selected.title })} style={({ pressed }) => [s.imageButton, pressed && { opacity: 0.85 }]}>
                    <Image source={{ uri: selected.image_data }} style={[s.hero, { height: reviewLandscape ? 350 : 260 }]} resizeMode="contain" />
                    <View pointerEvents="none" style={s.imageInspectIcon}><ZoomIn size={22} color="#A74646" /></View>
                  </Pressable>
                  <Text style={s.artist}>
                    by {selected.artist_name} · ₱ {selected.price}
                  </Text>
                  <Text style={s.category}>{selected.category}</Text>
                  <Text style={s.description}>{selected.description}</Text>
                  <ArtworkHistoryPanel artworkId={selected.id} />
                  </View>
                  <View style={[s.reviewColumn, s.reviewRight, !reviewLandscape && { flex: undefined, width: '100%' }]}>
                  {!!selected.automated_block_reason && <View style={s.match}><Text style={s.copyResolved}>{readOnlyBlock ? 'Automatically blocked · read-only evidence' : 'Previously held for high similarity · moderator review available'}</Text><Text style={s.detailText}>{selected.automated_block_reason === 'high_ai_score' ? 'The AI model score reached the automatic block threshold. This artwork was not published; no moderator decision is required. The score does not prove artwork origin.' : 'This submission was not published. Review the matched artwork history and ownership evidence. A similarity score does not establish copyright infringement.'}</Text></View>}
                  {selected.status === "declined" && !!selected.decline_reason && <Text style={s.copyResolved}>Rejection reason: {selected.decline_reason}</Text>}
                  <Text style={s.detailTitle}>Submitted details</Text>
                  <Text style={s.detailText}>Sale type: {selected.sale_type || "Direct Sell"}</Text>
                  <Text style={s.detailText}>Artwork type: {selected.art_type || "Not specified"}</Text>
                  <Text style={s.detailText}>Tags: {selected.tags?.join(", ") || "None"}</Text>
                  {!!selected.additional_images?.length && (
                    <ScrollView horizontal contentContainerStyle={s.gallery}>
                      {selected.additional_images.map((uri, index) => (
                        <Pressable key={`${uri}-${index}`} accessibilityRole="button" accessibilityLabel={`Inspect additional artwork image ${index + 1}`} onPress={() => setViewingImage({ uri, label: `${selected.title} · Image ${index + 2}` })}><Image source={{ uri }} style={s.galleryImage} /></Pressable>
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
                  {!!selected.ai_screening && <View style={s.match}>
                    <Text style={s.sectionTitle}>AI image screening</Text>
                    <Text style={s.detailText}>{selected.ai_screening.provider_name ? `${selected.ai_screening.provider_name}: ` : ''}{screeningScoreLabel(selected.ai_screening)}</Text>
                    <Text style={s.detailText}>{selected.ai_screening.status === 'auto_blocked' ? 'Automatic block' : 'Screening'} threshold: {(selected.ai_screening.threshold * 100).toFixed(1)}%. The score is not proof of origin.</Text>
                    {selected.ai_screening.images?.map(image => <Text key={image.image_index} style={s.detailText}>{image.image_index === 0 ? 'Cover' : `Additional image ${image.image_index}`}: {screeningScoreLabel(image)} · {image.status !== 'clear' ? 'Flagged' : 'No AI flag'}</Text>)}
                    {selected.ai_screening.review_status === 'cleared' ? <Text style={s.detailText}>Flag cleared after evidence review: {selected.ai_screening.review_note}</Text> : selected.ai_screening.status === 'review_required' && !readOnlyBlock && <>
                      <Text style={s.detailText}>Review the artist’s process files, sketches or other supporting evidence before clearing this flag. You can decline the artwork using the normal decision controls.</Text>
                      <TextInput accessibilityLabel="Evidence reviewed for AI flag" placeholder="Describe the process evidence reviewed (at least 20 characters)" value={aiNote} onChangeText={setAiNote} maxLength={1000} multiline style={s.reason} />
                      <TouchableOpacity accessibilityRole="button" disabled={saving || aiNote.trim().length < 20} onPress={clearAIFlag} style={[s.notCopy, (saving || aiNote.trim().length < 20) && s.disabled]}><Text style={s.notCopyText}>Record evidence and clear AI flag</Text></TouchableOpacity>
                    </>}
                  </View>}
                  <View style={s.sectionHeader}>
                    <ShieldAlert size={18} color="#A86868" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.sectionTitle}>Automatic similarity assessment</Text>
                      <Text style={s.sectionHint}>
                        Visual matching supports your review; it does not establish plagiarism.
                      </Text>
                    </View>
                  </View>
                  {selected.similarity_matches.length === 0 ? (
                    <View style={s.safe}>
                      <CheckCircle2 size={18} color="#5D8A63" />
                      <Text style={s.safeText}>
                        No strong match was flagged among the internal references checked. This does not certify originality.
                      </Text>
                    </View>
                  ) : (
                    selected.similarity_matches.map((match) => (
                      <SimilarityAssessment key={match.id} match={match} onInspect={(uri, title) => setViewingImage({ uri, label: title })} />
                    ))
                  )}
                  {!readOnlyBlock && (selected.status === "pending" || selected.status === "declined") && (
                    <View style={s.decision}>
                      <Text style={s.sectionTitle}>{selected.status === "declined" ? "Reconsider artwork" : "Artwork decision"}</Text>
                      <Text style={s.detailText}>The assessment is automatic. You make the final decision after reviewing ownership, permissions and the submission.</Text>
                      {needsSimilarityReason && !declining && <>
                        <Text style={s.reasonLabel}>Evidence supporting approval</Text>
                        <TextInput accessibilityLabel="Ownership or permission evidence supporting approval" style={s.reason} value={reviewNote} onChangeText={setReviewNote} maxLength={500} multiline placeholder="Describe ownership, permission or authorized repost evidence (at least 20 characters)..." />
                        <Text style={s.metric}>Required to approve a flagged artwork. Your reason is saved in its review history.</Text>
                      </>}
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
                              disabled={approvalDisabled}
                              style={[s.approve, approvalDisabled && s.disabled]}
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
                  </View>
                  </View>
                </ScrollView>
                <Modal visible={!!viewingImage} transparent animationType="fade" onRequestClose={() => setViewingImage(null)}>
                  <View style={s.imageBackdrop}><View style={s.imageDialog}>
                    <View style={s.imageHeader}><Text numberOfLines={1} style={{ color: '#FFF', flex: 1, fontWeight: '700', fontSize: 17 }}>{viewingImage?.label}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close image viewer" onPress={() => setViewingImage(null)} style={s.close}><X size={24} color="#FFF" /></Pressable></View>
                    {viewingImage && <ZoomableArtwork key={viewingImage.uri} uri={viewingImage.uri} height={Math.max(150, Math.min(650, height - 220))} interactive hoverMagnify={false} />}
                  </View></View>
                </Modal>
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
              </ReviewTransition>
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
  page: { flex: 1, backgroundColor: "#FAF7F3" },
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
  title: { fontFamily: "LoraSemiBold", fontSize: 29, color: "#3A2D2A" },
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5DAD3",
    padding: 20,
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
    maxWidth: 1240,
    height: "92%",
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
  reviewGrid: { gap: 22, alignItems: 'stretch' },
  reviewColumn: { flex: 1, minWidth: 0, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#EEDFD5' },
  reviewLeft: { backgroundColor: '#FCF8F4' },
  reviewRight: { backgroundColor: '#FFFFFF' },
  imageButton: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E8D7CC', backgroundColor: '#F2ECE6' },
  imageInspectIcon: { position: 'absolute', right: 12, bottom: 12, width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFF9F3', borderWidth: 1, borderColor: '#E8D7CC', alignItems: 'center', justifyContent: 'center' },
  imageBackdrop: { flex: 1, backgroundColor: 'rgba(20,16,15,.94)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  imageDialog: { width: '100%', maxWidth: 1200, backgroundColor: '#181616', borderRadius: 16, overflow: 'hidden' },
  imageHeader: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
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
