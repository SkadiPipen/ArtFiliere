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
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Watermark } from '../artwork/components/Watermark';
import ContractPanel from '../chat-negotiations/ContractPanel';

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web' || width > 768;

export default function AuctionPostView() {
  const params = useLocalSearchParams();
  const auctionId = params.id;
  const router = useRouter();

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

  // Fetch logged in user to check if viewer is artist or winning bidder
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

  const isWinner = Boolean(
    auction && (
      (firebaseUser && (auction.highest_bidder_uid === firebaseUser.uid)) ||
      (currentUser && (currentUser.id === auction.highest_bidder_id || currentUser.username === auction.highest_bidder_name))
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

      // Always call the standard plural route first
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

  // Settle auction and navigate to chat negotiations & payment
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
    <View style={styles.container}>
      <View style={[styles.mainWrapper, isWeb && styles.webWrapper]}>
        {/* Background Artwork Banner */}
        <View style={styles.imageHeader}>
          <Watermark uri={getArtworkUri()} height={isWeb ? 450 : 250} />
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.topInfo}>
            <View>
              <Text style={styles.bidLabel}>Current Bid:</Text>
              <Text style={styles.bidValue}>Php {auction.current_bid?.toLocaleString()}</Text>
            </View>
            <View style={[styles.timerPill, (isExpired || isSettled) && styles.endedPill]}>
              <Ionicons name="time-outline" size={14} color={(isExpired || isSettled) ? '#FFF' : '#C15656'} />
              <Text style={[styles.timerText, (isExpired || isSettled) && { color: '#FFF' }]}>
                {isSettled ? 'Settled' : formatTimer(auction.end_time)}
              </Text>
            </View>
          </View>

          {/* Top 5 Bidders Box */}
          <View style={styles.topBiddersBox}>
            <Text style={styles.topBiddersHeader}>Top Bidders:</Text>
            {auction.top_bidders && auction.top_bidders.length > 0 ? (
              auction.top_bidders.map((b: any, idx: number) => (
                <View key={idx} style={styles.bidderRow}>
                  <Ionicons name="person" size={12} color="#FFF" />
                  <Text style={styles.bidderName}>{b.masked_name}</Text>
                </View>
            ))
          ) : (
            <Text style={{ color: '#EEE', fontSize: 10 }}>No bids yet</Text>
          )}
          </View>
        </View>

        {/* Artwork Info & Description */}
        <View style={styles.bottomCard}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <Text style={styles.dateText}>{isExpired || isSettled ? 'Auction Concluded' : 'Ends soon'}</Text>
            <View style={styles.titleRow}>
              <Text style={styles.titleText}>{auction.title}</Text>
              <TouchableOpacity
                style={styles.artistPill}
                activeOpacity={0.7}
                onPress={() => {
                  const artistId = auction.artist_id || auction.artist?.id || auction.artist;
                  if (artistId) {
                    router.push({
                      pathname: '/artist-profile',
                      params: { artistId: artistId },
                    } as any);
                  }
                }}
              >
                <Ionicons name="ellipse-outline" size={12} color="#8B6E49" />
                <Text style={styles.artistName}> {auction.artist_name}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{auction.is_physical ? 'Physical Artwork' : 'Digital Asset'}</Text>
            </View>

            <Text style={styles.sectionHeader}>About the Art</Text>
            <Text style={styles.bodyText}>{auction.description}</Text>

            <Text style={styles.sectionHeader}>Materials/medium used:</Text>
            <Text style={styles.bodyText}>{auction.materials}</Text>

            <Text style={styles.sectionHeader}>Offered licenses:</Text>
            <TouchableOpacity
              style={styles.licenseBtn}
              onPress={() => setShowContractPanel(true)}
            >
              <Ionicons name="document-text-outline" size={16} color="#C05C5C" />
              <Text style={styles.licenseBtnText}>Negotiate License Terms & Usage Rights →</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Action Bar: Settle / Negotiate vs Active Bidding */}
          <View style={styles.actionBar}>
            {isSettled || isExpired ? (
              <View style={styles.settledContainer}>
                <View>
                  <Text style={styles.settledWinningLabel}>Final Winning Bid</Text>
                  <Text style={styles.settledWinningAmount}>Php {auction.current_bid?.toLocaleString()}</Text>
                </View>
                <TouchableOpacity
                  style={styles.settleBtn}
                  onPress={handleSettleAndNegotiate}
                  disabled={settling}
                >
                  {settling ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="chatbubbles-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                      <Text style={styles.settleBtnText}>
                        {isArtist ? 'Review Terms & Chat' : 'Proceed to Contract & Checkout'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View>
                  <Text style={styles.pastBidLabel}>Past bid: Php {auction.past_bid?.toLocaleString()}</Text>
                </View>
                <View style={styles.btnRow}>
                  <TouchableOpacity style={styles.rebidBtn} onPress={() => setBidModal(true)} disabled={isArtist}>
                    <Text style={[styles.rebidText, isArtist && {color: '#AAA'}]}>REBID</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.instantBidBtn, isArtist && { backgroundColor: '#CCC'}]}
                    onPress={() => placeBid(Number(auction.next_min_bid))}
                    disabled={isArtist || bidding}
                  >
                    {bidding ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.instantBidText}>Php{auction.next_min_bid?.toLocaleString()}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Bid Modal */}
      <Modal visible={bidModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Enter Bid Amount</Text>
            <Text style={styles.modalSubtitle}>
              Minimum bid: Php{auction.next_min_bid?.toLocaleString()}
            </Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={customBid}
              onChangeText={setCustomBid}
              placeholder="Enter amount..."
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setBidModal(false)} style={styles.cancelBtn}>
                <Text style={{ color: '#666'}}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => placeBid(Number(customBid))}
                style={styles.confirmBtn}
                disabled={bidding}
              >
                {bidding ? (
                  <ActivityIndicator color="#FFF" size="small"/>
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Submit Bid</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showContractPanel && (
        <ContractPanel
          artworkId={String(auction.artwork_id || auction.id)}
          startInChat={false}
          onClose={() => {
            setShowContractPanel(false);
            router.push({
              pathname: '/(home)/cart',
              params:{ 
                directCheckout: 'true', 
                auctionId: String(auction.id), 
                artworkId: String(auction.artwork_id || auction.id), 
              },
            } as any );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mainWrapper: { flex: 1 },
  webWrapper: { maxWidth: 900, alignSelf: 'center', width: '100%' },
  imageHeader: { position: 'relative' },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    padding: 6,
  },
  topInfo: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bidLabel: { color: '#FFF', fontSize: 13, textShadowColor: '#000', textShadowRadius: 4 },
  bidValue: { color: '#FFF', fontSize: 24, fontWeight: 'bold', textShadowColor: '#000', textShadowRadius: 4 },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  endedPill: { backgroundColor: '#C05C5C' },
  timerText: { fontSize: 12, fontWeight: 'bold', color: '#C15656', marginLeft: 4 },
  topBiddersBox: {
    position: 'absolute',
    top: 40,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 8,
    minWidth: 110,
  },
  topBiddersHeader: { color: '#FFF', fontSize: 11, fontWeight: 'bold', marginBottom: 4 },
  bidderRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 1 },
  bidderName: { color: '#FFF', fontSize: 10, marginLeft: 4 },
  bottomCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -16,
    padding: 20,
  },
  dateText: { fontSize: 12, color: '#C05C5C', fontWeight: 'bold', marginBottom: 4 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  titleText: { fontSize: 22, fontWeight: 'bold', color: '#2C3E50', flex: 1 },
  artistPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F2EC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  artistName: { fontSize: 12, color: '#8B6E49', fontWeight: '600' },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EAECEE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 14,
  },
  typeBadgeText: { fontSize: 11, color: '#555', fontWeight: '600' },
  sectionHeader: { fontSize: 14, fontWeight: 'bold', color: '#333', marginTop: 12, marginBottom: 4 },
  bodyText: { fontSize: 13, color: '#666', lineHeight: 20 },
  licenseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C05C5C',
    marginTop: 6,
    backgroundColor: '#FFF5F5',
  },
  licenseBtnText: { fontSize: 12, color: '#C05C5C', fontWeight: 'bold', marginLeft: 6 },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#EEE',
    paddingTop: 12,
    marginTop: 8,
  },
  pastBidLabel: { fontSize: 12, color: '#888' },
  btnRow: { flexDirection: 'row', alignItems: 'center' },
  rebidBtn: {
    borderWidth: 1,
    borderColor: '#C05C5C',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
  },
  rebidText: { color: '#C05C5C', fontWeight: 'bold', fontSize: 13 },
  instantBidBtn: {
    backgroundColor: '#C05C5C',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  instantBidText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  settledContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settledWinningLabel: { fontSize: 11, color: '#7F8C8D', textTransform: 'uppercase', fontWeight: 'bold' },
  settledWinningAmount: { fontSize: 18, color: '#27AE60', fontWeight: 'bold' },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27AE60',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  settleBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: { backgroundColor: '#FFF', width: '100%', maxWidth: 360, borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  modalSubtitle: { fontSize: 12, color: '#777', marginBottom: 16 },
  modalInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  confirmBtn: { backgroundColor: '#C05C5C', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
});