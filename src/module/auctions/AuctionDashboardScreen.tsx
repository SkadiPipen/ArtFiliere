import Skeleton from '@/components/Skeleton';
import { COLORS } from '@/constants/colors';
import Header from '@/module/home/components/Header';
import { matchesArtworkCategory, categoryLabel } from '@/services/artworkCategories';
import { marketplaceHeading } from '@/constants/marketplaceTypography';
import AuctionArtworkCard from './AuctionArtworkCard';
import AuctionGuidePanel from './AuctionGuidePanel';
import TourLauncher from '@/components/TourLauncher';
import { Text } from '@/components/Typography';
import API_URL from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, FlatList, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AuctionDashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>({ all_auctions: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showGuide, setShowGuide] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  const [contentWidth, setContentWidth] = useState(windowWidth);
  const isDesktop = windowWidth >= 768;
  useFocusEffect(useCallback(() => () => setShowGuide(false), []));
  const dismissGuide = useCallback(() => {
    setShowGuide(false);
    if (Platform.OS === 'web') requestAnimationFrame(() => document.getElementById('auction-guide-open')?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    if (showGuide) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [showGuide]);

  const fetchAuction = async () => {
    try {
      let res = await fetch(`${API_URL}/api/auction/dashboard/`);
      if (res.status === 404) {
        res = await fetch(`${API_URL}/api/auctions/dashboard/`);
      }
      if (res.ok) {
        const json = await res.json();
        const allList = json.all_auctions || (Array.isArray(json) ? json : []);
        setData({
          all_auctions: allList,
        });
      } else {
        console.warn('Auction Dashboard response not ok:', res.status);
      }
    } catch (err) {
      console.warn('Failed to load auctions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuction();
  }, []);

  const formatTimer = (targetDate: string) => {
    if (!targetDate) return '00:00:00s';
    const diff = Math.max(0, new Date(targetDate).getTime() - now);
    if (diff <= 0) return 'Ended';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}s`;
  };

  const getImageSource = (item: any) => {
    const raw =
      item.image_data ||
      item.artwork_image ||
      item.image_url ||
      item.image ||
      item.artwork?.image_data ||
      item.artwork?.image;

    if (!raw) return { uri: 'https://via.placeholder.com/400' };

    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
      return { uri: raw };
    }

    if (raw.startsWith('/media/') || raw.startsWith('/static/')) {
      return { uri: `${API_URL}${raw}` };
    }

    return { uri: `data:image/jpeg;base64,${raw}` };
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Skeleton layout="cards" />
      </View>
    );
  }

  const matchesFilters = (item: any) => {
    const words = [item.title, item.artist_name, item.description, item.category,
      ...(item.categories || []).map(categoryLabel)].join(' ').toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(word => words.includes(word))
      && matchesArtworkCategory({ ...item, art_type: item.is_physical ? 'physical' : 'digital' }, activeCategory);
  };
  const filteredAuctions = data.all_auctions.filter(matchesFilters);
  if (activeCategory === 'Trending') filteredAuctions.sort((a: any, b: any) => (b.bid_count || 0) - (a.bid_count || 0) || Number(b.id) - Number(a.id));

  const hasEnded = (item: any) =>
    ['ENDED', 'SETTLED', 'PAYMENT_PENDING', 'BACKUP_OFFER', 'FORFEITED'].includes(item.status) ||
    Boolean(item.end_time && new Date(item.end_time).getTime() <= now);
  const ongoingAuctions = filteredAuctions.filter((item: any) => !hasEnded(item));
  const pastAuctions = filteredAuctions.filter(hasEnded).sort(
    (a: any, b: any) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()
  );
  // Use the complete loaded catalogue so auctions enter the 24-hour window
  // while this page is open, and disappear as soon as their countdown expires.
  const deadlineAuctions = data.all_auctions.filter((item: any) => {
    const starts = new Date(item.start_time).getTime();
    const ends = new Date(item.end_time).getTime();
    return item.status === 'ACTIVE' && starts <= now && ends > now
      && ends <= now + 24 * 60 * 60 * 1000 && matchesFilters(item);
  }).sort((a: any, b: any) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime() || Number(a.id) - Number(b.id)).slice(0, 10);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']} onLayout={event => setContentWidth(event.nativeEvent.layout.width)}>
      <View style={{ flex: 1 }} pointerEvents={showGuide ? 'none' : 'auto'} accessibilityElementsHidden={showGuide} importantForAccessibility={showGuide ? 'no-hide-descendants' : 'auto'} {...(Platform.OS === 'web' && showGuide ? { inert: true } : {})}>
      <Header activeCategory={activeCategory} onSelectCategory={setActiveCategory} searchQuery={search} onSearchChange={setSearch} />
      {!showGuide && <TourLauncher label="Auction tutorial" steps={[
        { target: 'auction-guide-open', instruction: 'Open the auction guide for bidding rules, ending times, and what happens if you win.', closeOnActivate: true },
        { target: 'auction-tour-live', instruction: 'Choose a live auction to inspect the artwork, current bid, and listing terms.' },
        { target: 'auction-tour-past', instruction: 'Review closed auctions here. Check your cart for a winning artwork that is ready for checkout.' },
      ]} />}

      {/* Main Feed Column */}
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.feedWrapper}>
          {/* Banner Card */}
          <View style={styles.banner}>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>
                Discover your next original.
              </Text>
              <Text style={styles.bannerSubtitle}>
                Bid on exclusive curated original pieces.
              </Text>
              <TouchableOpacity id="auction-guide-open" accessibilityRole="button" accessibilityState={{ expanded: showGuide }} onPress={() => setShowGuide(true)} style={styles.bannerButton} activeOpacity={0.8}>
                <Text style={styles.bannerBtnText}>How auctions work →</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Close to Deadline Stories */}
          {deadlineAuctions.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Ending within 24 hours</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={deadlineAuctions}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.deadlineList}
                renderItem={({ item }) => (
                  <AuctionArtworkCard
                    compact
                    item={item}
                    image={getImageSource(item)}
                    countdown={formatTimer(item.end_time)}
                    style={styles.deadlineCard}
                    onPress={() =>
                      router.push({
                        pathname: '/auction-post',
                        params: { id: item.id },
                      } as any)
                    }
                  />
                )}
              />
            </View>
          )}

          {/* Feed Grid */}
          {[
            { title: 'Live auctions', auctions: ongoingAuctions, empty: 'No live auctions found.' },
            { title: 'Past auctions', auctions: pastAuctions, empty: 'No past auctions found.' },
          ].map(section => (
          <View key={section.title} style={styles.sectionContainer}>
            <View id={section.title === 'Live auctions' ? 'auction-tour-live' : 'auction-tour-past'}><Text style={styles.sectionTitle}>{section.title}</Text></View>
            {section.auctions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="images-outline" size={36} color="#BBB" />
                <Text style={styles.emptyText}>{section.empty}</Text>
              </View>
            ) : (
              <View style={[styles.grid, isDesktop ? styles.gridDesktop : styles.gridMobile]}>
                {section.auctions.map((item: any) => {
                  const isClosed = hasEnded(item);

                  return (
                    <AuctionArtworkCard
                      key={item.id}
                      item={item}
                      image={getImageSource(item)}
                      ended={isClosed}
                      countdown={formatTimer(item.end_time)}
                      style={isDesktop ? styles.gridCardDesktop : styles.gridCardMobile}
                      onPress={() =>
                        router.push({
                          pathname: '/auction-post',
                          params: { id: item.id },
                        } as any)
                      }
                    />
                  );
                })}
              </View>
            )}
          </View>
          ))}
        </View>
      </ScrollView>
      </View>
      {showGuide && <AuctionGuidePanel width={contentWidth} onDismiss={dismissGuide} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.pageBackground,
    overflow: 'hidden',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },

  // HEADER
  headerWrapper: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8DAD2',
  },
  headerContent: {
    width: '100%',
    maxWidth: 1280,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 14, flexWrap: 'wrap',
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FAF7F3', borderWidth: 1, borderColor: '#E8DAD2', minWidth: 160,
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 44,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    paddingRight: 6,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
  },
  iconBtn: {
    padding: 6,
  },

  // SCROLL CONTAINER
  scrollContainer: {
    flex: 1,
    backgroundColor: COLORS.pageBackground,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  feedWrapper: {
    width: '100%',
    maxWidth: 1200,
    backgroundColor: COLORS.pageBackground,
    minHeight: '100%',
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderColor: '#ECECEC',
  },

  // BANNER
  banner: {
    backgroundColor: COLORS.roseLight, borderWidth: 1, borderColor: COLORS.border,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 20,
    padding: 28,
    flexDirection: 'row',
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    color: '#3A2D2A',
    fontSize: 28, fontFamily: 'LoraSemiBold',
  },
  bannerSubtitle: {
    color: '#756357',
    fontSize: 14, lineHeight: 22,
    marginVertical: 8,
  },
  bannerButton: {
    backgroundColor: COLORS.red,
    alignSelf: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 6,
  },
  bannerBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // SECTION HEADINGS
  sectionContainer: {
    marginTop: 16,
  },
  sectionTitle: {
    ...marketplaceHeading,
    marginHorizontal: 16,
    marginBottom: 10,
  },

  // DEADLINE HORIZONTAL CAROUSEL
  deadlineList: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 40,
    paddingBottom: 14,
  },
  deadlineCard: {
    width: 124,
  },
  // FEED GRID (SEE MORE)
  grid: {
    paddingHorizontal: 24,
  },
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  gridMobile: {
    flexDirection: 'column',
    gap: 14,
  },
  gridCardDesktop: {
    width: '23%',
    marginTop: 22,
    marginBottom: 10,
  },
  gridCardMobile: {
    width: '100%',
    marginTop: 22,
  },
  emptyContainer: {
    padding: 32,
    marginHorizontal: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2D6CD', borderRadius: 16, minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 13,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandTitle: { fontSize: 24, fontFamily: 'LoraSemiBold', color: '#B54848' },
});
