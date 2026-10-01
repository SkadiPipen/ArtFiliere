import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Watermark } from '../artwork/components/Watermark';
import ContractPanel from '../chat-negotiations/ContractPanel';

export default function AuctionPostView() {
  const params = useLocalSearchParams();
  const auctionId = params.id;
  const router = useRouter();

  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  const isDesktop = windowWidth >= 920;

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => sub?.remove();
  }, []);

  const [auction, setAuction] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bidding, setBidding] = useState(false);
  const [settling, setSettling] = useState(false);
  const [bidModal, setBidModal] = useState(false);
  const [customBid, setCustomBid] = useState('');
  const [showContractPanel, setShowContractPanel] = useState(false);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchMe() {
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/auth/me/`, { headers });
        if (res.ok) {
          const user = await res.json();
          setCurrentUser(user);
        }
      } catch (err) {
        console.warn('Could not fetch user profile:', err);
      }
    }
    fetchMe();
  }, []);

  const loadDetails = async () => {
    if (!auctionId) {
      setLoading(false);
      return;
    }

    try {
      let res = await fetch(`${API_URL}/api/auction/${auctionId}/`);
      if (res.status === 404) {
        res = await fetch(`${API_URL}/api/auctions/${auctionId}/`);
      }
      if (res.ok) {
        const data = await res.json();
        setAuction(data);
        setCustomBid(String(data.next_min_bid || ''));
      }
    } catch (err) {
      console.warn('Error loading auction details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [auctionId]);

  const isExpired = auction?.end_time ? new Date(auction.end_time).getTime() <= now : false;
  const isSettled = auction?.status === 'SETTLED';
  const firebaseUser = auth.currentUser;
  const isArtist = Boolean(
    auction && (
      (firebaseUser && (auction.artist_uid === firebaseUser.uid || auction.artist_email === firebaseUser.email)) ||
      (currentUser && (currentUser.id === auction.artist_id || currentUser.username === auction.artist_name))
    )
  );

  const formatTimer = (targetDate: string) => {
    if (!targetDate) return '00:00:00s';
    const diff = Math.max(0, new Date(targetDate).getTime() - now);
    if (diff <= 0) return 'Ended';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}s`;
  };

  const formatEndDate = (dateStr: string) => {
    if (!dateStr) return 'Soon';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const placeBid = async (amount: number) => {
    if (bidding) return;

    if (!amount || isNaN(amount)) {
      Alert.alert('Invalid Amount', 'Please enter a valid numeric bid amount.');
      return;
    }

    try {
      setBidding(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        Alert.alert('Login Required', 'Please log in to place a bid on this artwork.');
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      let res = await fetch(`${API_URL}/api/auctions/${auctionId}/bid/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ amount }),
      });
      if (res.status === 404) {
        res = await fetch(`${API_URL}/api/auction/${auctionId}/bid/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ amount }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Bid Error', data.error || 'Failed to place bid.');
      } else {
        Alert.alert('Success!', `Your bid of ₱${amount.toLocaleString()} was placed!`);
        setBidModal(false);
        await loadDetails();
      }
    } catch (err) {
      Alert.alert('Error', 'Unable to connect to auction server.');
    } finally {
      setBidding(false);
    }
  };

  const handleSettleAndNegotiate = async () => {
    if (settling) return;

    try {
      setSettling(true);
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res = await fetch(`${API_URL}/api/auction/${auctionId}/settle/`, {
        method: 'POST',
        headers,
      });
      if (res.status === 404) {
        res = await fetch(`${API_URL}/api/auctions/${auctionId}/settle/`, {
          method: 'POST',
          headers,
        });
      }

      const data = await res.json();
      if (res.ok) {
        setShowContractPanel(true);
      } else {
        if (isSettled || data.error?.includes('settled')) {
          setShowContractPanel(true);
        } else {
          Alert.alert('Auction Notice', data.error || 'Auction could not be settled.');
        }
      }
    } catch (err) {
      Alert.alert('Notice', 'Opening negotiation panel...');
      setShowContractPanel(true);
    } finally {
      setSettling(false);
    }
  };

  const getArtworkUri = () => {
    const raw = auction?.image_data || auction?.artwork_image || auction?.image || auction?.image_url;
    if (!raw) return 'https://via.placeholder.com/600';
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
      return raw;
    }
    if (raw.startsWith('/media') || raw.startsWith('/static')) {
      return `${API_URL}${raw}`;
    }
    return `data:image/jpeg;base64,${raw}`;
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/auction-dashboard' as any);
    }
  };

  const handleArtistClick = () => {
    const artistId = auction?.artist_id || auction?.artist?.id || auction?.artist;
    if (artistId) {
      router.push({
        pathname: '/artist-profile',
        params: { artistId: String(artistId) },
      } as any);
    }
  };

  const tagsList = auction?.tags
    ? typeof auction.tags === 'string'
      ? auction.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : Array.isArray(auction.tags)
      ? auction.tags
      : []
    : ['Art', 'Featured', 'Original'];

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color="#BC5454" />
      </View>
    );
  }

  if (!auction) {
    return (
      <View style={[styles.centerBox, { padding: 24 }]}>
        <Text style={{ fontSize: 16, color: '#666', marginBottom: 16 }}>Auction details not found.</Text>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
          <Text style={{ color: '#BC5454', fontWeight: 'bold' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.bgGlowTop} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* TOP HEADER BAR */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.navArrowBtn} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color="#844038" />
          </TouchableOpacity>

          <View style={styles.topCenterContainer}>
            <Text style={styles.endsOnText}>
              Ends on: {formatEndDate(auction.end_time)}
            </Text>
            <View style={[styles.timerPill, (isExpired || isSettled) && styles.endedPill]}>
              <Ionicons
                name="time-outline"
                size={13}
                color="#FFF"
              />
              <Text style={styles.timerText}>
                {isSettled ? 'Settled' : formatTimer(auction.end_time)}
              </Text>
            </View>
          </View>

          <View style={{ width: 32 }} />
        </View>

        {/* MAIN 3-PANEL ROW */}
        <View style={[styles.layoutRow, !isDesktop && styles.layoutColumn]}>
          {/* LEFT PANEL: TOP BIDDER CARD */}
          <View style={[styles.leftColumn, !isDesktop && styles.columnFull]}>
            <View style={styles.topBiddersCard}>
              <Text style={styles.topBiddersTitle}>Top Bidder</Text>
              <View style={styles.biddersList}>
                {auction.top_bidders && auction.top_bidders.length > 0 ? (
                  auction.top_bidders.map((b: any, idx: number) => (
                    <View key={idx} style={styles.bidderItemRow}>
                      <View style={styles.avatarWrapper}>
                        {idx === 0 && (
                          <Ionicons name="ribbon" size={12} color="#D48C62" style={styles.crownIcon} />
                        )}
                        <Ionicons name="person-circle-outline" size={20} color="#B89F8B" />
                      </View>
                      <Text style={styles.bidderMaskedText}>{b.masked_name}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyBiddersText}>No bids yet</Text>
                )}
              </View>
            </View>
          </View>

          {/* CENTER PANEL: ARTWORK IMAGE & CURRENT BID PRICE */}
          <View style={[styles.centerColumn, !isDesktop && styles.columnFull]}>
            <View style={styles.imageCanvasWrapper}>
              <Watermark uri={getArtworkUri()} height={isDesktop ? 440 : 260} />
            </View>

            <View style={styles.currentBidContainer}>
              <Text style={styles.currentBidLabel}>CURRENT BID PRICE:</Text>
              <Text style={styles.currentBidAmount}>
                ₱ {auction.current_bid?.toLocaleString() || '0'}
              </Text>
            </View>
          </View>

          {/* RIGHT PANEL: ART DETAILS, TAGS & ACTION CONTROLS */}
          <View style={[styles.rightColumn, !isDesktop && styles.columnFull]}>
            <View style={styles.metaHeader}>
              <Text style={styles.artTitleText}>
                {auction.title}{' '}
                <Text style={styles.byLabel}>by </Text>
                <Text
                  style={styles.byArtistLink}
                  onPress={handleArtistClick}
                >
                  {auction.artist_name || 'Artist'}
                </Text>
              </Text>

              {/* Tags */}
              <View style={styles.tagsContainer}>
                {tagsList.map((tag: string, index: number) => (
                  <View key={index} style={styles.tagPill}>
                    <Text style={styles.tagPillText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Description */}
            <Text style={styles.bodyDescription}>
              {auction.description || 'No description provided for this auction piece.'}
            </Text>

            {/* Materials */}
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Materials used: </Text>
              <Text style={styles.specValue}>{auction.materials || 'Mixed Media'}</Text>
            </View>

            {/* Type */}
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Type: </Text>
              <Text style={styles.specValue}>
                {auction.is_physical ? 'Physical Piece' : 'Digital Asset'}
              </Text>
            </View>

            {/* License Negotiation Link */}
            <TouchableOpacity
              style={styles.licenseBtn}
              onPress={() => setShowContractPanel(true)}
            >
              <Ionicons name="document-text-outline" size={14} color="#844038" />
              <Text style={styles.licenseBtnText}>Negotiate License Terms & Rights →</Text>
            </TouchableOpacity>

            {/* Bottom Actions */}
            <View style={styles.rightActionFooter}>
              {isSettled || isExpired ? (
                <View style={styles.settledActionBox}>
                  <Text style={styles.settledStatusLabel}>Final Winning Bid</Text>
                  <Text style={styles.settledStatusAmount}>
                    ₱ {auction.current_bid?.toLocaleString()}
                  </Text>
                  <TouchableOpacity
                    style={styles.settleBtn}
                    onPress={handleSettleAndNegotiate}
                    disabled={settling}
                  >
                    {settling ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="chatbubbles-outline" size={16} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.settleBtnText}>
                          {isArtist ? 'Review Terms & Chat' : 'Proceed to Contract & Checkout'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.activeBiddingBlock}>
                  <Text style={styles.pastBidLabel}>
                    Past bid: ₱ {auction.past_bid?.toLocaleString() || '0'}
                  </Text>
                  <View style={styles.buttonActionRow}>
                    <TouchableOpacity
                      style={styles.rebidBtn}
                      onPress={() => setBidModal(true)}
                      disabled={isArtist}
                    >
                      <Text style={[styles.rebidText, isArtist && { color: '#AAA' }]}>REBID</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.instantBidBtn, isArtist && { backgroundColor: '#CCC' }]}
                      onPress={() => placeBid(Number(auction.next_min_bid))}
                      disabled={isArtist || bidding}
                    >
                      {bidding ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.instantBidText}>
                          ₱{Number(auction.next_min_bid || 0).toLocaleString()}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* BID MODAL */}
      <Modal visible={bidModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Enter Bid Amount</Text>
            <Text style={styles.modalSubtitle}>
              Minimum bid: ₱{auction.next_min_bid?.toLocaleString()}
            </Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={customBid}
              onChangeText={setCustomBid}
              placeholder="Enter amount..."
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setBidModal(false)} style={styles.modalCancelBtn}>
                <Text style={{ color: '#666' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => placeBid(Number(customBid))}
                style={styles.confirmBtn}
                disabled={bidding}
              >
                {bidding ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Submit Bid</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CONTRACT MODAL */}
      {showContractPanel && (
        <ContractPanel
          artworkId={String(auction.artwork_id || auction.id)}
          startInChat={false}
          onClose={() => {
            setShowContractPanel(false);
            router.push({
              pathname: '/(home)/cart',
              params: {
                directCheckout: 'true',
                auctionId: String(auction.id),
                artworkId: String(auction.artwork_id || auction.id),
              },
            } as any);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F1E3',
    position: 'relative',
  },
  bgGlowTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: '#FAF6ED',
    opacity: 0.8,
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: '#EFE1CA',
    opacity: 0.6,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    width: '100%',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F1E3',
  },

  // TOP BAR
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 1180,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  navArrowBtn: {
    top: 30,
    padding: 4,
    marginLeft: -4,
  },
  topCenterContainer: {
    right: 40,
    top: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  endsOnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#844038',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E48A64',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 5,
  },
  endedPill: {
    backgroundColor: '#844038',
  },
  timerText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },

  // 3-PANEL WIREFRAME ROW
  layoutRow: {
    top: 70,
    left: 40,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 24,
    width: '100%',
    maxWidth: 1180,
  },
  layoutColumn: {
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    gap: 20,
  },
  leftColumn: {
    flex: 1,
    minWidth: 175,
    maxWidth: 205,
  },
  centerColumn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightColumn: {
    flex: 2,
    gap: 6,
  },
  columnFull: {
    width: '100%',
    maxWidth: 420,
    flex: undefined,
  },

  // LEFT PANEL (TOP BIDDERS)
  topBiddersCard: {
    backgroundColor: '#ECE3D4',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DFCDB8',
    width: '100%',
    minHeight: 180,
  },
  topBiddersTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#844038',
    marginBottom: 12,
  },
  biddersList: {
    gap: 10,
  },
  bidderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownIcon: {
    position: 'absolute',
    top: -5,
    left: -4,
    zIndex: 2,
  },
  bidderMaskedText: {
    fontSize: 12,
    color: '#844038',
    fontWeight: '600',
  },
  emptyBiddersText: {
    fontSize: 12,
    color: '#A89284',
    fontStyle: 'italic',
  },

  // CENTER PANEL (ARTWORK & CURRENT BID PRICE)
  imageCanvasWrapper: {
    width: '100%',
    backgroundColor: '#D9D9D9',
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DDD0C0',
  },
  currentBidContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  currentBidLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#844038',
    letterSpacing: 0.5,
  },
  currentBidAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: '#844038',
    marginTop: 2,
  },

  // RIGHT PANEL (META & ACTION CONTROLS)
  metaHeader: {
    marginBottom: 4,
  },
  artTitleText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#844038',
    marginBottom: 6,
  },
  byLabel: {
    fontSize: 13,
    fontWeight: 'normal',
    color: '#844038',
  },
  byArtistLink: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#844038',
    textDecorationLine: 'underline',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  tagPill: {
    backgroundColor: '#E48A64',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tagPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  bodyDescription: {
    fontSize: 12,
    color: '#844038',
    lineHeight: 18,
    marginVertical: 4,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  specLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#844038',
  },
  specValue: {
    fontSize: 12,
    color: '#844038',
  },
  licenseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DFCDB8',
    backgroundColor: '#F3EADB',
    marginTop: 6,
    marginBottom: 8,
  },
  licenseBtnText: {
    fontSize: 11,
    color: '#844038',
    fontWeight: '700',
    marginLeft: 6,
  },

  // ACTIONS
  rightActionFooter: {
    marginTop: 10,
    paddingTop: 10,
  },
  activeBiddingBlock: {
    gap: 8,
  },
  pastBidLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#844038',
    marginBottom: 2,
  },
  buttonActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rebidBtn: {
    backgroundColor: '#9B906E',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rebidText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  instantBidBtn: {
    backgroundColor: '#C56054',
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instantBidText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  // SETTLED / WINNER ACTIONS
  settledActionBox: {
    gap: 6,
  },
  settledStatusLabel: {
    fontSize: 11,
    color: '#7F8C8D',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  settledStatusAmount: {
    fontSize: 18,
    color: '#27AE60',
    fontWeight: 'bold',
  },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27AE60',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  settleBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#FFF',
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#777',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  confirmBtn: {
    backgroundColor: '#C05C5C',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
});