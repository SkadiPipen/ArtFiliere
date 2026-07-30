import { useRouter } from 'expo-router';
import { MessageSquare } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ArtistCommission from '@/components/home/ArtistCommission';
import AuctionSection from '@/components/home/AuctionSection';
import ForYouGrid from '@/components/home/ForYouGrid';
import Header from '@/components/home/Header';
import HeroCarousel from '@/components/home/HeroCarousel';
import LatestSection from '@/components/home/LatestSection';

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeCategory, setActiveCategory] = useState('All');

  const handleViewPost = (item: any, type: string) => {
    router.push({
      pathname: '/(home)/view-post',
      params: { type, title: item.artist || item.title, price: item.price, image: item.image || item.img },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <Header activeCategory={activeCategory} onSelectCategory={setActiveCategory} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
      >
        <View style={styles.centerContainer}>
          <HeroCarousel onSelect={handleViewPost} />
          <LatestSection activeCategory={activeCategory} onSelect={handleViewPost} />
          <ArtistCommission />
          <AuctionSection onSelect={handleViewPost} />
          <ForYouGrid activeCategory={activeCategory} onSelect={handleViewPost} />
        </View>
      </ScrollView>

      {/* Floating chat button */}
      <TouchableOpacity
        style={[styles.msgFab, { bottom: 85 + insets.bottom }]}
        onPress={() => Alert.alert('Messages', 'Opening Chat...')}
      >
        <MessageSquare color="#fff" size={26} fill="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  scrollContent: { alignItems: 'center' },
  centerContainer: { width: '100%', maxWidth: 1200 },
  msgFab: {
    position: 'absolute',
    right: 20,
    backgroundColor: '#9B5B44',
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  navBar: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 75,
    backgroundColor: '#D48C62',
    alignItems: 'center',
  },
  navInner: {
    width: '100%',
    maxWidth: 600,
    height: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: { alignItems: 'center', justifyContent: 'center' },
  activeIcon: { transform: [{ scale: 1.1 }] },
  navText: { color: '#fff', fontSize: 11, fontWeight: '500', marginTop: 2 },
  auctionContainer: { alignItems: 'center', position: 'relative' },
  auctionCircle: {
    position: 'absolute',
    top: -45,
    backgroundColor: '#C15656',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    elevation: 4,
  },
});