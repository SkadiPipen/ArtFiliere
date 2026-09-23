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

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web' || width > 768;

export default function AuctionPostView() {
  const params = useLocalSearchParams();
  const auctionId = params.id;
  const router = useRouter();

  const [auction, setAuction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bidModal, setBidModal] = useState(false);
  const [customBid, setCustomBid] = useState('');

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadDetails = async () => {
    if (!auctionId) {
      setLoading(false)
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
      } else {
        console.warn(`Auction detail returned status ${res.status}`);
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

  const formatTimer = (targetDate: string) => {
    if (!targetDate) return '00:00:00s';
    const diff = Math.max(0, new Date(targetDate).getTime() - now);
    if (diff <= 0) return 'Ended';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}s`;
  }

  const placeBid = async (amount: number) => {
    try {
      let res = await fetch(`${API_URL}/api/auction/${auctionId}/bid/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      if (res.status === 404) {
        res = await fetch(`${API_URL}/api/auctions/${auctionId}/bid/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({amount}),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Bid Error', data.error || 'Failed to place bid');
      } else {
        Alert.alert('Success', `Bid of ₱${amount.toLocaleString()} placed!`);
        setBidModal(false);
        loadDetails();
      }
    } catch (err) {
      Alert.alert('Error', 'Unable to connect to auction server.');
    }
  };

  const getArtworkUri = () => {
    const raw = auction?.image_data || auction?.artwork_image || auction?.image || auction?.image_url;
    if (!raw) return 'https//via.placeholder.com/600';
    if (raw.startsWith('http://') || raw. startsWith('https://') || raw.startsWith('data')) {
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
      <View style={[styles.centerBox, {padding:24}]}>
        <Text style={{ fontSize: 16, color: '#666', marginBottom: 16}}>Auction details not found.</Text>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
          <Text style={{ color: '#BC5454', fontWeight: 'bold', }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.mainWrapper, isWeb && styles.webWrapper]}>
        {/* Background Artwork Banner */}
        <View style={styles.imageHeader}>
          <Watermark
            uri={getArtworkUri()}
            height={isWeb ? 450 : 250}
          />
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.topInfo}>
            <View>
              <Text style={styles.bidLabel}>Current Bid:</Text>
              <Text style={styles.bidValue}>Php {auction.current_bid?.toLocaleString()}</Text>
            </View>
            <View style={styles.timerPill}>
              <Ionicons name="time-outline" size={14} color="#C15656" />
              <Text style={styles.timerText}>{formatTimer(auction.end_time)}</Text>
            </View>
          </View>

          {/* Top 5 Bidders Box */}
          <View style={styles.topBiddersBox}>
            <Text style={styles.topBiddersHeader}>Top Bidders:</Text>
            {auction.top_bidders?.map((b: any, idx: number) => (
              <View key={idx} style={styles.bidderRow}>
                <Ionicons name="person" size={12} color="#FFF" />
                <Text style={styles.bidderName}>{b.masked_name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Artwork Info & Description */}
        <View style={styles.bottomCard}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <Text style={styles.dateText}>Ends soon</Text>
            <View style={styles.titleRow}>
              <Text style={styles.titleText}>{auction.title}</Text>
              <TouchableOpacity 
                style={styles.artistPill}
                activeOpacity={0.7}
                onPress={() => {
                  const artistId = auction.artist_id || auction.artist?.id || auction.artist;
                  if (artistId) {
                    router.push({ pathname: '/artist-profile', params: {artistId: artistId},
                  });
                  }
                }}
                >
                <Ionicons name="ellipse-outline" size={12} color="#8B6E49" />
                <Text style={styles.artistName}> {auction.artist_name}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{auction.is_physical ? 'Physical' : 'Digital'}</Text>
            </View>

            <Text style={styles.sectionHeader}>About the Art</Text>
            <Text style={styles.bodyText}>{auction.description}</Text>

            <Text style={styles.sectionHeader}>Materials/medium used:</Text>
            <Text style={styles.bodyText}>{auction.materials}</Text>

            <Text style={styles.sectionHeader}>Offered licenses:</Text>
            <TouchableOpacity
              style={styles.licenseBtn}
              onPress={() => router.push(`/negotiation/${auction.id}` as any)}
            >
              <Ionicons name="document-text-outline" size={16} color="#C05C5C" />
              <Text style={styles.licenseBtnText}>Negotiate License Terms & Usage Rights →</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Action Bar */}
          <View style={styles.actionBar}>
            <View>
              <Text style={styles.pastBidLabel}>Past bid: Php {auction.past_bid?.toLocaleString()}</Text>
            </View>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.rebidBtn} onPress={() => setBidModal(true)}>
                <Text style={styles.rebidText}>REBID</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.instantBidBtn}
                onPress={() => placeBid(Number(auction.next_min_bid))}
              >
                <Text style={styles.instantBidText}>Php{auction.next_min_bid?.toLocaleString()}</Text>
              </TouchableOpacity>
            </View>
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
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setBidModal(false)} style={styles.cancelBtn}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => placeBid(Number(customBid))}
                style={styles.confirmBtn}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Submit Bid</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
    alignItems: 'center',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F5F7',
  },
  mainWrapper: {
    width: '100%',
    maxWidth: 800,
    backgroundColor: '#FFF',
    flex: 1,
  },
  webWrapper: {
    maxWidth: 1000,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    marginVertical: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    maxHeight: 640,
  },
  imageHeader: {
    width: '100%',
    height: isWeb ? '100%' : 350,
    minHeight: isWeb ? 550 : 350,
    flex: isWeb ? 1.1 : undefined,
    backgroundColor: '#bc54545e',
    justifyContent: 'space-between',
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  topInfo: {
    position: 'absolute',
    top: 470,
    right: 16,
    left: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    zIndex: 20,
  },
  bidLabel: {
    color: '#FFEAEA',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bidValue: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  timerPill: {
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    elevation: 2,
  },
  timerText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#C15656',
    marginLeft: 5,
  },
  topBiddersBox: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    bottom: 16,
    left: 16,
    right: 16,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 20,
  },
  topBiddersHeader: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 11,
    marginBottom: 4,
  },
  bidderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  bidderName: {
    color: '#F4F5F7',
    fontSize: 11,
    marginLeft: 6,
  },
  bottomCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderTopLeftRadius: isWeb ? 0 : 24,
    borderTopRightRadius: isWeb ? 0 : 24,
    marginTop: isWeb ? 0 : -20,
    padding: isWeb ? 36 : 24,
    justifyContent: 'space-between',
  },
  dateText: {
    color: '#C15656',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  titleText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#C15656',
    flex: 1,
  },
  artistPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  artistName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8B6E49',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#C15656',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 8,
    marginBottom: 4,
  },
  typeBadgeText: {
    color: '#C15656',
    fontSize: 10,
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontWeight: 'bold',
    color: '#C15656',
    fontSize: 13,
    marginTop: 14,
    marginBottom: 2,
  },
  bodyText: {
    color: '#4A5568',
    fontSize: 13,
    lineHeight: 19,
  },
  licenseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F5C6CB',
    marginTop: 8,
  },
  licenseBtnText: {
    color: '#D75B5C',
    fontSize: 12,
    marginLeft: 6,
    fontWeight: '700',
  },
  actionBar: {
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
    paddingTop: 16,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pastBidLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#718096',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rebidBtn: {
    borderWidth: 1.5,
    borderColor: '#C15656',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rebidText: {
    color: '#C15656',
    fontWeight: 'bold',
    fontSize: 13,
  },
  instantBidBtn: {
    backgroundColor: '#7B241C',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  instantBidText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: isWeb ? 400 : '90%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#C15656',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#718096',
    marginVertical: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    marginVertical: 12,
    fontSize: 16,
    color: '#2D3748',
    backgroundColor: '#F8FAFC',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#EDF2F7',
  },
  confirmBtn: {
    backgroundColor: '#C15656',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
});