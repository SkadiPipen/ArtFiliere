import { usePathname, useRouter } from 'expo-router';
import { Clock, Disc, Home, ShoppingCart, User } from 'lucide-react-native';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BottomNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isHomeActive = pathname === '/' || pathname === '/(home)';

  return (
    <View style={[styles.navBar, { paddingBottom: Math.max(10, insets.bottom) }]}>
      <View style={styles.navInner}>
        {/* HOME */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(home)')}>
          <Home color="#fff" size={24} style={isHomeActive ? styles.activeIcon : undefined} />
          <Text style={[styles.navText, isHomeActive && styles.activeText]}>Home</Text>
        </TouchableOpacity>

        {/* ACTIVITIES */}
        <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Activities', 'Opening Activities...')}>
          <Clock color="#fff" size={24} />
          <Text style={styles.navText}>Activities</Text>
        </TouchableOpacity>

        {/* AUCTION CIRCLE BUTTON */}
        <TouchableOpacity style={styles.auctionContainer} onPress={() => Alert.alert('Auction', 'Opening Auctions...')}>
          <View style={styles.auctionCircle}>
            <Disc color="#fff" size={32} />
          </View>
          <Text style={[styles.navText, { marginTop: 20 }]}>Auction</Text>
        </TouchableOpacity>

        {/* CART */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(home)/cart')}>
          <ShoppingCart color="#fff" size={24} style={pathname.includes('/cart') ? styles.activeIcon : undefined}/>
          <Text style={styles.navText}>Cart</Text>
        </TouchableOpacity>

        {/* PROFILE / ME */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(home)/profile')}>
          <User color="#fff" size={24} style={pathname.includes('/profile') ? styles.activeIcon : undefined}/>
          <Text style={[styles.navText, pathname.includes('/profile') && styles.activeText]}>Me</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#D48C62',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  navInner: {
    width: '100%',
    maxWidth: 600,
    height: 65,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: { alignItems: 'center', justifyContent: 'center' },
  activeIcon: { transform: [{ scale: 1.1 }] },
  navText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '500', marginTop: 2 },
  activeText: { color: '#fff', fontWeight: 'bold' },
  auctionContainer: { alignItems: 'center', position: 'relative' },
  auctionCircle: {
    position: 'absolute',
    top: -42,
    backgroundColor: '#C15656',
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    elevation: 5,
  },
});