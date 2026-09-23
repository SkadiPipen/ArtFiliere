import { useCart } from '@/context/CartContext';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { usePathname, useRouter } from 'expo-router';
import { Clock, Disc, Home, Plus, ShoppingCart, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BottomNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [isArtist, setIsArtist] = useState(false);
  const { cartItems } = useCart();
  const cartCount = cartItems.length;

  const isHomeActive = pathname === '/' || pathname === '/(home)';

  useEffect(() => {
    const loadRole = async () => {
      if (!auth.currentUser) return;
      try {
        const response = await fetch(`${API_URL}/auth/me/`, { headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } });
        const profile = response.ok ? await response.json() : null;
        setIsArtist(profile?.role === 'artist');
      } catch { setIsArtist(false); }
    };
    loadRole();
  }, []);

  return (
    <View style={[styles.navBar, { paddingBottom: Math.max(10, insets.bottom) }]}>
      <View style={styles.navInner}>
        {/* HOME */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(home)')}>
          <Home color="#fff" size={24} style={isHomeActive ? styles.activeIcon : undefined} />
          <Text style={[styles.navText, isHomeActive && styles.activeText]}>Home</Text>
        </TouchableOpacity>

        {/* ACTIVITIES */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(home)/activities')}>
          <Clock color="#fff" size={24} />
          <Text style={styles.navText}>Activities</Text>
        </TouchableOpacity>

        {/* Artists post from the dashboard; buyers retain the auction action. */}
        <TouchableOpacity 
          style={styles.auctionContainer} 
          onPress={() => { 
            if (isArtist) {
              router.push('/artist-post'); 
            } else { 
              router.push('/auction-dashboard');
            }
          }}>
          <View style={styles.auctionCircle}>
            {isArtist ? <Plus color="#fff" size={34} /> : <Disc color="#fff" size={32} />}
          </View>
          <Text style={[styles.navText, { marginTop: 20 }]}>{isArtist ? 'Post' : 'Auction'}</Text>
        </TouchableOpacity>

        {/* CART */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(home)/cart')}>
          <View style={styles.cartIconWrap}>
            <ShoppingCart color="#fff" size={24} style={pathname.includes('/cart') ? styles.activeIcon : undefined}/>
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
              </View>
            )}
          </View>
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
  cartIconWrap: { position: 'relative' },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: '#C15656',
  },
  cartBadgeText: { color: '#C15656', fontSize: 9, fontWeight: '800' },
});
