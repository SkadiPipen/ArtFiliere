import { useCart } from '@/context/CartContext';
import { auth } from '@/firebase/config';
import { Watermark } from '@/module/artwork/components/Watermark';
import API_URL from '@/services/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Gavel, ShoppingCart } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ViewPostPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { addToCart } = useCart();

  const params = useLocalSearchParams();
  const artworkId = (params.artworkId as string) || '';

  const [artworkData, setArtworkData] = useState<any>(null);
  const [loadingArtwork, setLoadingArtwork] = useState(true);
  const [isOwnArtwork, setIsOwnArtwork] = useState(false);
  const [checkingOwner, setCheckingOwner] = useState(true);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (targetDate: any) => {
    if (!targetDate) return 'Active Now';
    const diff = Math.max(0, new Date(targetDate).getTime() - now);
    if (diff <= 0) return 'Auction Ended';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}s`;
  }

  useEffect(() => {
    if (!artworkId){
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
        console.warn('Failed to fetch artwork info:', err);
      } finally {
        setLoadingArtwork(false);
      }
    };

    fetchArtwork();
  }, [artworkId]);

  const title = artworkData?.title || params.title;
  const price = artworkData?.price || params.price;
  const image = artworkData?.image || artworkData?.image_data || params.image;
  const medium = artworkData?.category || params.medium;
  const artistName = artworkData?.artist_name || artworkData?.artist?.username || params.artist;
  const resolvedArtistId = String(artworkData?.artist?.id || artworkData?.artist_id || artworkData?.artist || params.artistId || '');

  const rawSaleType = String(artworkData?.sale_type || params.type || params.sale_type || '').toUpperCase();
  const hasAuctionTimes = Boolean(artworkData?.end_time || params.endTime || params.endtime || artworkData?.bid_increment);
  const isAuction = rawSaleType.includes('AUCTION') || params.type === 'Auction' || hasAuctionTimes;

  const bidIncrement = artworkData?.bid_increment || params.bidIncrement;
  const startingtTime = artworkData?.starting_time || artworkData?.start_time || params.startingTime || '';
  const endTime = artworkData?.end_time || params.endTime || '';
  const isDigital = String(artworkData?.category || params.medium || '').toLowerCase().includes('digital');

  useEffect(() => {
    const checkOwnership = async () => {
      if (!auth.currentUser || !resolvedArtistId) {
        setCheckingOwner(false);
        return;
      }
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch(`${API_URL}/auth/me/`, { headers: { Authorization: `Bearer ${token}` } });
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
      Alert.alert('Your artwork', 'You cannot add your own artwork to the cart.');
      return;
    }
    const user = auth.currentUser;

    if (!user) {
      if (Platform.OS === 'web') {
        const confirmLogin = window.confirm('You need an account to add items to cart. Log in now?');
        if (confirmLogin) router.push('/login');
      } else {
        Alert.alert('Account Required', 'You need to have an account to add items to cart.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => router.push('/login') },
        ]);
      }
      return;
    }

    try {
        await addToCart({
        artworkId: String(artworkId || ''),
        title: String(title),
        price: String(price),
        type: isAuction ? 'Auction' : 'Direct Sell',
        image: String(image),
        artistName: String(artistName),
    });

    if (Platform.OS === 'web') {
      alert(`${title} has been added to your cart!`);
    } else {
      Alert.alert('Added to Cart', `${title} has been added to your cart!`);
    }
  } catch (error: any) {
    if(Platform.OS === 'web') alert(error.message);
    else Alert.alert('Cart', error.message);
  }
  };

  const formatDate = (dateStr?: any) => {
    if (!dateStr) return 'Aactive Now';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return String(dateStr);
    }
  };

  return (
    <SafeAreaView style={styles.mainContainer} edges={['top', 'left', 'right']}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.cardWrapper, isDesktop && styles.desktopWrapper]}>
          
          {/* Left side for web & top for mobile android/iOS */}
          <View style={[styles.imageHeader, isDesktop && styles.desktopImageHeader]}>
            <Watermark
              uri={(image as string) || 'https://picsum.photos/seed/view/800/1200'}
              height={isDesktop ? 550 : 350}
            />
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <ArrowLeft color="white" size={22} />
            </TouchableOpacity>
          </View>

          {/* Right side for web & bottom side for mobile android/iOS */}
          <View style={[styles.contentCard, isDesktop && styles.desktopContentCard]}>
            <Text style={styles.date}>Posted Artwork</Text>
            <Text style={styles.title}>{title}</Text>

            {/* Artist Profile */}
              <TouchableOpacity onPress={() => router.push({ pathname: '/artist-profile' as any, params: { artistId: resolvedArtistId } })}>
                <Text style={styles.artistLink}>View artist profile ({artistName})</Text>
              </TouchableOpacity>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>{isAuction ? 'Auction' : medium}</Text>
            </View>

            <View style={styles.detailsSection}>
              <Text style={styles.detailsHeader}>About the Art</Text>
              <Text style={styles.detailsText}>
                {artworkData?.description || 'Original artwork on ArtFiliere.'}{'\n'}
                Medium/Material: {isDigital ? 'Digital' : (medium as string) || 'Oil on Canvas'}{'\n'}
                License: Standard Personal License{'\n'}
                Dimensions: 2000 x 3000 px
              </Text>
            </View>

            {/* Auction deets */}
            {isAuction && (
              <View style={styles.auctionDetailsBox}>
                <Text style={styles.auctionHeader}> Auction Parameters</Text>
                <Text style={styles.auctionText}>Bid Increment: Php{Number(bidIncrement).toLocaleString()}</Text>
                <Text style={[styles.auctionText, {fontWeight: '700', color: '#059d19', marginTop: 4 }]}>Starts: {startingtTime ? new Date(startingtTime).toLocaleString() : 'Active Now'}</Text>
                <Text style={[styles.auctionText, {fontWeight: '700', color: '#C15656', marginTop: 4 }]}>Ends in: {formatTimer(endTime)}</Text>
              </View>
            )}

            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>{isAuction ? 'Starting / Current Bid:' : 'Price:'}</Text>
              <Text style={styles.priceValue}>Php {Number(price || 0).toLocaleString()}</Text>
            </View>

            {/* If auction, Go to Auction / Place Bid is provided */}
            {isAuction ? (
              <TouchableOpacity style={[styles.auctionBtn, (isOwnArtwork || checkingOwner) && styles.cartBtnDisabled]}
                onPress={() => router.push('/auction-dashboard' as any)}
                disabled={isOwnArtwork || checkingOwner}
              >
                <Gavel color="#fff" size={18} style={{ marginRight: 8 }}/>
                <Text style={styles.cardText}>
                  {isOwnArtwork ? 'This is your auction' : 'Enter Auction Room'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.cartBtn, (isOwnArtwork || checkingOwner) && styles.cartBtnDisabled]} onPress={handleAddToCart} disabled={isOwnArtwork || checkingOwner}>
                <ShoppingCart color="#fff" size={18} style={{ marginRight: 8 }} />
                {checkingOwner ? (
                  <ActivityIndicator color="#fff" size="small" /> 
                ) : (
                  <Text style={styles.cartText}>{isOwnArtwork ? 'This is your artwork' : 'Add to Cart'}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F4F5F7' },
  scrollContent: { alignItems: 'center', paddingBottom: 100 },
  cardWrapper: { width: '100%', maxWidth: 800, backgroundColor: '#fff' },
  desktopWrapper: {
    maxWidth: 1000,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    marginTop: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  imageHeader: { position: 'relative', width: '100%' },
  desktopImageHeader: {
    flex: 1.1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
    zIndex: 10,
  },
  contentCard: {
    backgroundColor: '#fff',
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
    justifyContent: 'center',
  },
  date: { color: '#C15656', fontSize: 11, fontWeight: 'bold' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#C15656', marginTop: 4 },
  artistLink: { color: '#8B6E49', fontSize: 12, fontWeight: '800', marginTop: 5, textDecorationLine: 'underline' },
  badge: {
    borderWidth: 1,
    borderColor: '#C15656',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  badgeText: { color: '#C15656', fontSize: 10, fontWeight: 'bold' },
  detailsSection: { marginTop: 18, borderTopWidth: 1, borderTopColor: '#EDF2F7', paddingTop: 14 },
  detailsHeader: { fontWeight: 'bold', color: '#C15656', fontSize: 14 },
  detailsText: { color: '#4A5568', fontSize: 13, marginTop: 4, lineHeight: 20 },
  priceContainer: { marginTop: 'auto', paddingTop: 16 },
  priceLabel: { fontWeight: 'bold', color: '#C15656', marginTop: 10 },
  priceValue: { fontSize: 32, fontWeight: 'bold', color: '#C15656' },
  cartBtn: {
    flexDirection: 'row',
    backgroundColor: '#C15656',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  cartBtnDisabled: { backgroundColor: '#A99B96' },
  cartText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  // Added for auction
  auctionDetailsBox: {backgroundColor: '#FFF5F5', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#F5C6CB', marginBottom: 16, top: 20 },
  auctionHeader: { fontSize: 13, fontWeight: '700', color: '#D75B5C', marginBottom: 6 },
  auctionText: { fontSize: 12, color: '#555', marginBottom: 3},
  auctionBtn: { flexDirection: 'row', backgroundColor: '#7B241C', height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', top: 10 },
  cardText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
