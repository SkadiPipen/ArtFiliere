import { Watermark } from '@/components/Watermark';
import { useCart } from '@/context/CartContext';
import { auth } from '@/firebase/config';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ShoppingCart } from 'lucide-react-native';
import {
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

  const { type, title, price, image, medium, artist } = useLocalSearchParams();

  const handleAddToCart = () => {
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

    const itemTitle = (title as string) || 'Artwork Name';
    const itemPrice = (price as string) || '0.00';
    const itemType = (type as string) || 'Direct Sell';
    const itemImage = (image as string) || 'No Image';
    const itemArtist = (artist as string) || 'Artist';

    addToCart({
      title: itemTitle,
      price: itemPrice,
      type: itemType,
      image: itemImage,
      artistName: itemArtist,
    });

    if (Platform.OS === 'web') {
      alert(`${itemTitle} has been added to your cart!`);
    } else {
      Alert.alert('Added to Cart', `${itemTitle} has been added to your cart!`);
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
            <Text style={styles.date}>Posted: 04/10/2026</Text>
            <Text style={styles.title}>{(title as string) || 'Artwork Name'}</Text>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>{(type as string) || 'Physical'}</Text>
            </View>

            <View style={styles.detailsSection}>
              <Text style={styles.detailsHeader}>About the Art</Text>
              <Text style={styles.detailsText}>
                Medium/Material: {(medium as string) || 'Oil on Canvas'}{'\n'}
                License: Standard Personal License{'\n'}
                Dimensions: 2000 x 3000 px
              </Text>
            </View>

            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>{type === 'Auction' ? 'Current Bid:' : 'Price:'}</Text>
              <Text style={styles.priceValue}>₱ {(price as string) || '0.00'}</Text>
            </View>

            <TouchableOpacity style={styles.cartBtn} onPress={handleAddToCart}>
              <ShoppingCart color="#fff" size={18} style={{ marginRight: 8 }} />
              <Text style={styles.cartText}>Add to Cart</Text>
            </TouchableOpacity>
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
  cartText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});