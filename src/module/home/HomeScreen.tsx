import { useRouter } from 'expo-router';
import { MessageSquare, SlidersHorizontal } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ArtistCommission from '@/module/home/components/ArtistCommission';
import AuctionSection from '@/module/home/components/AuctionSection';
import ForYouGrid from '@/module/home/components/ForYouGrid';
import Header from '@/module/home/components/Header';
import HeroCarousel from '@/module/home/components/HeroCarousel';
import LatestSection from '@/module/home/components/LatestSection';
import API_URL from '@/services/api';
import { ArtItem } from '@/module/home/types';

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeCategory, setActiveCategory] = useState('All');
  const [approvedArtworks, setApprovedArtworks] = useState<ArtItem[]>([]);
  const isDesktop = width >= 768;

  const handleViewPost = (item: any, type: string) => {
    router.push({
      pathname: '/(home)/view-post',
      params: { type, title: item.artist || item.title, price: item.price, image: item.image || item.img, artist: item.artistName || item.artist, artistId: item.artistId, artworkId: item.id },
    });
  };

  useEffect(() => {
    fetch(`${API_URL}/api/users/artworks/`)
      .then((response) => response.ok ? response.json() : [])
      .then((artworks) => setApprovedArtworks(artworks.map((artwork: any) => ({ id: String(artwork.id), artist: artwork.title, artistName: artwork.artist_name, artistId: String(artwork.artist_id), price: artwork.price, type: artwork.category, image: artwork.image_data }))))
      .catch(() => undefined);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <Header activeCategory={activeCategory} onSelectCategory={setActiveCategory} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
      >
        {isDesktop ? (
          <View style={styles.desktopContainer}>
            <HeroCarousel onSelect={handleViewPost} />

            <View style={styles.desktopPromoRow}>
              <View style={[styles.promoCard, styles.latestPromo]}>
                <Text style={styles.promoEyebrow}>LATEST</Text>
                <Text style={styles.promoTitle}>Discover original work</Text>
                <Text style={styles.promoBody}>Fresh art from independent creators.</Text>
              </View>
              <View style={[styles.promoCard, styles.commissionPromo]}>
                <Text style={styles.promoEyebrow}>OPEN COMMISSION</Text>
                <Text style={styles.promoTitle}>Bring your idea to life</Text>
                <TouchableOpacity onPress={() => router.push('/artist-registration')}>
                  <Text style={styles.promoLink}>Find an artist →</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.catalogueLayout}>
              <View style={styles.filterPanel}>
                <View style={styles.filterHeading}>
                  <SlidersHorizontal size={16} color="#C15656" />
                  <Text style={styles.filterTitle}>Browse art</Text>
                </View>
                <Text style={styles.filterLabel}>Categories</Text>
                {['Visual Arts', 'Digital and Graphics', 'Photography', 'Traditional Art', 'Contemporary / Modern'].map((category) => (
                  <TouchableOpacity key={category} onPress={() => setActiveCategory(category === 'Visual Arts' ? 'All' : category)}>
                    <Text style={styles.filterOption}>{category}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={[styles.filterLabel, styles.filterLabelSpaced]}>Filter</Text>
                <Text style={styles.filterOption}>Artwork Type</Text>
                <Text style={styles.filterOption}>Price</Text>
                <Text style={styles.filterOption}>Artist Style</Text>
              </View>
              <View style={styles.catalogueContent}>
                <Text style={styles.catalogueTitle}>Artwork for you</Text>
                <ForYouGrid activeCategory={activeCategory} onSelect={handleViewPost} items={approvedArtworks} />
              </View>
            </View>

            <View style={styles.desktopFooter}>
              <Text style={styles.footerBrand}>ArtFiliere</Text>
              <Text style={styles.footerText}>ArtFiliere is a start-up project registered in the Philippines.</Text>
              <Text style={styles.footerText}>© 2026 ArtFiliere</Text>
            </View>
          </View>
        ) : (
          <View style={styles.centerContainer}>
            <HeroCarousel onSelect={handleViewPost} />
            <LatestSection activeCategory={activeCategory} onSelect={handleViewPost} />
            <ArtistCommission />
            <AuctionSection onSelect={handleViewPost} />
            <ForYouGrid activeCategory={activeCategory} onSelect={handleViewPost} items={approvedArtworks} />
          </View>
        )}
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
  desktopContainer: { width: '100%', maxWidth: 1160, paddingHorizontal: 24, paddingTop: 12 },
  desktopPromoRow: { flexDirection: 'row', gap: 16, marginBottom: 26 },
  promoCard: { flex: 1, minHeight: 132, borderRadius: 12, padding: 22, justifyContent: 'flex-end', overflow: 'hidden' },
  latestPromo: { backgroundColor: '#F7E9BD' },
  commissionPromo: { backgroundColor: '#27323A' },
  promoEyebrow: { color: '#C15656', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  promoTitle: { color: '#1F2933', fontSize: 22, fontWeight: '800' },
  promoBody: { color: '#5F6973', fontSize: 13, marginTop: 5 },
  promoLink: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: 9 },
  catalogueLayout: { flexDirection: 'row', alignItems: 'flex-start', gap: 24, marginTop: 4 },
  filterPanel: { width: 210, backgroundColor: '#FFF8D9', borderRadius: 10, padding: 20 },
  filterHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 },
  filterTitle: { color: '#C15656', fontSize: 16, fontWeight: '800' },
  filterLabel: { color: '#C15656', fontSize: 13, fontWeight: '800', marginBottom: 9 },
  filterLabelSpaced: { marginTop: 22 },
  filterOption: { color: '#7B6A65', fontSize: 12, marginBottom: 9 },
  catalogueContent: { flex: 1, minWidth: 0 },
  catalogueTitle: { color: '#C15656', fontSize: 20, fontWeight: '800', marginLeft: 15, marginBottom: -8 },
  desktopFooter: { borderTopWidth: 1, borderTopColor: '#E9DDD6', marginTop: 32, paddingVertical: 24, flexDirection: 'row', alignItems: 'center', gap: 18 },
  footerBrand: { color: '#C15656', fontSize: 18, fontWeight: '800' },
  footerText: { color: '#8A7C76', fontSize: 11, flex: 1 },
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
