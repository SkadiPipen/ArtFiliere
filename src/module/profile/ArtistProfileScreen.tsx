import ProductImage from '@/components/ProductImage';
import ArtistShareCard from './components/ArtistShareCard';
import ProfileCover from '@/components/ProfileCover';
import { ChatModal } from '@/module/chat-negotiations/chatModal';
import { chatService } from '@/module/chat-negotiations/chats';
import { readApiResponse } from '@/module/chat-negotiations/contracts';
import { Text, TextInput } from '@/components/Typography';
import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, MessageCircle, Paintbrush, Share2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Image, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AvailabilityCalendar from '@/module/commissions/AvailabilityCalendar';

const { width } = Dimensions.get("window");
const isWeb = Platform.OS === "web" || width > 768;

export default function ArtistProfileScreen() {
  const { artistId: routeArtistId, username } = useLocalSearchParams<{ artistId?: string; username?: string }>();
  const router = useRouter();
  const { width: pageWidth } = useWindowDimensions();
  const [showFullPortfolio, setShowFullPortfolio] = useState(false);

  const [artist, setArtist] = useState<any>(null);
  const artistId = String(artist?.id || routeArtistId || '');
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [chatArtist, setChatArtist] = useState<any>(null);
  const [openingChat, setOpeningChat] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [showShare, setShowShare] = useState(false);
  const openArtistChat = async () => {
    if (openingChat) return;
    setOpeningChat(true); setMessageError('');
    try {
      await auth.authStateReady();
      const currentUser = auth.currentUser;
      if (!currentUser) throw Error('Please sign in to message this artist.');
      const users = await chatService.fetchUsers(currentUser.uid);
      const recipient = users.find(user => user.displayName === artist.username);
      if (!recipient) throw Error('This artist is unavailable for chat, or this is your own profile.');
      setChatArtist({ ...recipient, firebase_uid: recipient.id, displayName: artist.name || recipient.displayName, username: artist.username, photoURL: artist.profile_image || '' });
    } catch (error: any) { setMessageError(error.message || 'Unable to open this conversation.'); }
    finally { setOpeningChat(false); }
  };


  // Commission Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [portfolioPreview, setPortfolioPreview] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("2500");
  const [isRush, setIsRush] = useState<"EXCLUSIVE" | "NON_EXCLUSIVE" | "SOLE">(
    "NON_EXCLUSIVE",
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setArtist(null); setProfileError('');
    (async () => {
      try {
        if (!username && !/^\d+$/.test(routeArtistId || '')) throw Error('This artist profile link is invalid.');
        const path = username ? `by-username/${encodeURIComponent(username)}` : routeArtistId;
        const response = await fetch(`${API_URL}/api/users/artists/${path}/`);
        const data = await readApiResponse(response);
        if (active) setArtist(data);
      } catch (error: any) {
        if (active) setProfileError(error.message || 'Unable to load this artist.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [routeArtistId, username]);

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
        <ActivityIndicator color="#A84B46" size="large" />
      </View>
    );
  }

  if (!artist) {
    return (
      <View style={s.center}>
        <Text accessibilityRole="alert" style={{ color: "#666", textAlign: 'center', padding: 16 }}>{profileError || 'Artist not found.'}</Text>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/artists')}><Text style={{ color: '#BC5555', padding: 12 }}>Back to artists</Text></TouchableOpacity>
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
      router.replace("/(home)");
    }
  };

  return (
    <SafeAreaView style={s.page}>
      {chatArtist && <ChatModal visible currentUser={auth.currentUser} initialArtist={chatArtist} onClose={() => setChatArtist(null)} />}
      {showShare && <ArtistShareCard artist={artist} avatarUri={avatarUri} onClose={() => setShowShare(false)} />}
      {/* 1. Header Navigation Bar */}
      <View style={s.topNav}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back from artist profile" style={s.navLeft} onPress={handleBack}>
          <ArrowLeft color="#62493E" size={24} />
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
          ) : null}

          {/* Message Button */}
          <TouchableOpacity
            style={[s.messageBtn, openingChat && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Message artist in chats"
            disabled={openingChat}
            onPress={() => { void openArtistChat(); }}
          >
            <MessageCircle color="#A84B46" size={16} />
            <Text style={s.messageText}>{openingChat ? 'Opening...' : 'Message'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share artist profile" accessibilityState={{ expanded: showShare }} onPress={() => setShowShare(true)} style={s.shareButton}><Share2 size={18} color="#A84B46" /></TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {!!messageError && <Text accessibilityRole="alert" style={{ color: '#B91C1C', padding: 16 }}>{messageError}</Text>}
        {/* 2. Artist Profile Hero Card (Identical to Artist POV Header) */}
        <View style={s.heroCard}>
          <ProfileCover uri={artist.cover_image} />
          <View style={s.heroMain}>
            <Image source={{ uri: avatarUri }} style={s.avatar} />

            <View style={s.heroDetails}>
              <View style={s.artistTags}>
                <View style={s.artistBadgePill}><Text style={s.artistBadgeText}>Artist</Text></View>
                <View style={[s.commissionStatus, artist.is_accepting_commissions && s.commissionStatusOpen]}>
                  <Text style={[s.commissionStatusText, artist.is_accepting_commissions && s.commissionStatusTextOpen]}>{artist.is_accepting_commissions ? 'Commissions Open' : 'Commissions Closed'}</Text>
                </View>
              </View>
              <Text style={s.artistNameText}>
                {artist.name || artist.username}
              </Text>
              <Text style={s.handleText}>@{artist.username}</Text>
              {!!artist.bio?.trim() && <Text style={s.bioText}>{artist.bio}</Text>}
              <Text style={s.statsText}>
                {artist.reviews_count ?? 25} Reviews •{" "}
                {artist.followers_count ?? 19} Followers •{" "}
                {artist.following_count ?? 3} Following
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Artwork Showcase Section */}
        <View
          style={{
            flexDirection: pageWidth >= 1000 ? 'row' : 'column',
            gap: 28,
            paddingHorizontal: 20,
            paddingTop: 16,
            maxWidth: 1200,
            width: '100%',
            alignSelf: 'center',
            justifyContent: 'center',
            alignItems: pageWidth >= 1000 ? 'flex-start' : 'center',
          }}
        >
          {/* Portfolio Column */}
          <View style={[s.worksContainer, { flex: pageWidth >= 1000 ? 1 : undefined }]}>
            <Text style={s.sectionHeading}>
              {showFullPortfolio ? 'Complete portfolio' : 'Latest Portfolio Works'}
            </Text>
            <TouchableOpacity onPress={() => setShowFullPortfolio(!showFullPortfolio)}>
              <Text style={{ color: '#BC5555', fontWeight: '700', marginBottom: 16 }}>
                {showFullPortfolio ? 'Show latest 4 works' : 'View complete portfolio'}
              </Text>
            </TouchableOpacity>

            {!(artist.portfolio || artist.artworks) || (artist.portfolio || artist.artworks).length === 0 ? (
              <Text style={s.noArtText}>No artworks published yet.</Text>
            ) : (
              <View style={s.grid}>
                {[...(artist.portfolio || artist.artworks)]

                  .slice(0, showFullPortfolio ? (artist.portfolio || artist.artworks).length : 4)
                  .map((item: any) => (
                    <TouchableOpacity
                      key={item.id}
                      style={s.card}
                      activeOpacity={0.85}
                      onPress={() =>
                        item.source === 'commission' ? setPortfolioPreview(item) : router.push({
                          pathname: '/(home)/view-post' as any,
                          params: {
                            artworkId: String(item.id),
                            title: item.title || '',
                            price: String(item.price || ''),
                            image: item.image_data || item.image || item.image_url || '',
                            artist: artist.name || artist.username || '',
                            artistId: String(item.artist_id || artist.id),
                            medium: item.category || '',
                            sale_type: item.sale_type || 'Direct Sell',
                            type: item.sale_type === 'auction' ? 'Auction' : 'Direct Sell',
                            bidIncrement: String(item.bid_increment || ''),
                            startingTime: item.starting_time || '',
                            endTime: item.end_time || '',
                          },
                        })
                      }
                    >
                      {!!getImageUri(item) && <ProductImage
                        source={{ uri: getImageUri(item) }}
                        style={s.image}
                        resizeMode="cover"
                      />}
                      <View style={s.cardMeta}>
                        <Text style={s.title} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={s.price}>
                          {item.source === 'commission' ? 'Completed commission' : `₱ ${Number(item.price || 0).toLocaleString()}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
              </View>
            )}
          </View>

          {/* Public schedule is shown only while commissions are open. */}
          {artist.is_accepting_commissions && <View
            style={{
              width: pageWidth >= 1000 ? 320 : '100%',
              maxWidth: 360,
              alignSelf: pageWidth >= 1000 ? 'flex-start' : 'center',
            }}
          >
            <AvailabilityCalendar artistId={artistId} />
          </View>}
        </View>
      </ScrollView>

      <Modal visible={!!portfolioPreview} transparent animationType="fade" onRequestClose={() => setPortfolioPreview(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24 }}>
          <TouchableOpacity accessibilityRole="button" onPress={() => setPortfolioPreview(null)}><Text style={{ color: 'white', textAlign: 'right', padding: 16 }}>Close</Text></TouchableOpacity>
          <Text style={{ color: 'white', fontSize: 20 }}>{portfolioPreview?.title}</Text>
          {!!portfolioPreview?.image_data && <ProductImage source={{ uri: portfolioPreview.image_data }} resizeMode="contain" style={{ width: '100%', height: '70%' }} />}
          <Text style={{ color: 'white' }}>Completed commission · Portfolio preview</Text>
        </View>
      </Modal>
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
  page: { flex: 1, backgroundColor: "#FAF7F3" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAF7F3",
  },

  // Top Nav
  topNav: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EFE1DC",
    paddingVertical: 12,
    gap: 12,
    flexWrap: "wrap",
    minHeight: 65,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 180 },
  navTitle: { color: "#3A2D2A", fontSize: 18, fontFamily: "LoraSemiBold", fontWeight: "600" },
  navRight: { flexDirection: "row", alignItems: "center", gap: 8 },

  commissionBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#BC5555",
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
    backgroundColor: "#F5E8E3",
    borderWidth: 1,
    borderColor: "#E5DAD3",
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  closedCommissionText: { color: "#786862", fontSize: 11, fontWeight: "700" },
  messageBtn: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    backgroundColor: "#F5E8E3",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
  },
  shareButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#F5E8E3' },
  messageText: { color: "#A84B46", fontSize: 12, fontWeight: "700" },

  content: { paddingBottom: 30 },

  // Hero Card matching POV 2
  heroCard: {
    backgroundColor: "#FFFFFF",
    minHeight: 240,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 32,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  artistBadgePill: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 16,
  },
  artistTags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 },
  commissionStatus: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: '#EBDAD4' },
  commissionStatusOpen: { backgroundColor: '#EDF4EE' },
  commissionStatusText: { color: '#786862', fontSize: 12, fontWeight: '600' },
  commissionStatusTextOpen: { color: '#477452' },
  artistBadgeText: { color: "#A84B46", fontSize: 12, fontWeight: "800" },
  heroMain: {
    flexDirection: "row",
    alignItems: "center",
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    flexShrink: 0,
    zIndex: 2,
    borderWidth: 3.5,
    borderColor: "#FFFFFF",
    marginRight: -24,
    backgroundColor: "#FFF",
  },
  heroDetails: { flexShrink: 1, flexGrow: 0, minWidth: 0, maxWidth: 620, paddingVertical: 14, paddingLeft: 38, paddingRight: 18, borderRadius: 14, backgroundColor: 'rgba(235,235,235,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)' },
  artistNameText: {
    color: "#3A2D2A",
    fontSize: 23,
    fontFamily: "LoraSemiBold",
    fontWeight: "600",
    marginBottom: 2,
  },
  statsText: {
    color: "#786862",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },
  handleText: { color: "#A84B46", fontSize: 12, fontWeight: "700" },
  bioText: { color: "#5A4944", fontSize: 12, marginTop: 3, lineHeight: 16 },

  // Gallery Showcase
  worksContainer: {
    paddingHorizontal: 0,
    width: "100%",
  },
  sectionHeading: {
    color: "#3A2D2A",
    fontFamily: "LoraSemiBold",
    fontWeight: "600",
    fontSize: 20,
    marginBottom: 8,
    marginTop: 0,
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
    borderColor: "#EFE1DC",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  image: { width: "100%", height: 150 },
  cardMeta: { padding: 9 },
  title: { color: "#3A2D2A", fontSize: 13, fontWeight: "800" },
  price: { color: "#BC5555", fontSize: 13, fontWeight: "800", marginTop: 4 },

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
  modalHeading: { fontSize: 20, fontFamily: "LoraSemiBold", fontWeight: "600", color: "#3A2D2A" },
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
  pillActive: { borderColor: "#A84B46", backgroundColor: "#F5E8E3" },
  pillText: { fontSize: 11, color: "#666", fontWeight: "600" },
  pillTextActive: { color: "#A84B46", fontWeight: "800" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: { paddingVertical: 9, paddingHorizontal: 14 },
  submitBtn: {
    backgroundColor: "#BC5555",
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  submitBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
});
