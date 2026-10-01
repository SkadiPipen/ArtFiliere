import API_URL from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AuctionDashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>({ close_to_deadline: [], all_auctions: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now());
  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  const isDesktop = windowWidth >= 768;

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchAuction = async () => {
    try {
      let res = await fetch(`${API_URL}/api/auction/dashboard/`);
      if (res.status === 404) {
        res = await fetch(`${API_URL}/api/auctions/dashboard/`);
      }
      if (res.ok) {
        const json = await res.json();
        const allList = json.all_auctions || (Array.isArray(json) ? json : []);
        const deadlineList =
          json.close_to_deadline && json.close_to_deadline.length > 0
            ? json.close_to_deadline
            : allList.slice(0, 5);
        setData({
          close_to_deadline: deadlineList,
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
        <ActivityIndicator size="large" color="#BC5454" />
      </View>
    );
  }

  const filteredAuctions = data.all_auctions.filter(
    (item: any) =>
      (item.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.artist_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Header Bar */}
      <View style={styles.headerWrapper}>
        <View style={styles.headerContent}>
            <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(home)' as any);
              }
            }}
          >
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.searchBar}>
            <TextInput
              placeholder="Search auction..."
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              placeholderTextColor="#999"
            />
            <Ionicons name="search" size={18} color="#BC5454" />
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="folder-outline" size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="notifications-outline" size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

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
                New To <Text style={{ fontWeight: 'bold' }}>Artfilier</Text> Auction?
              </Text>
              <Text style={styles.bannerSubtitle}>
                Bid on exclusive curated original pieces.
              </Text>
              <TouchableOpacity style={styles.bannerButton} activeOpacity={0.8}>
                <Text style={styles.bannerBtnText}>Learn more about our auction...</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Close to Deadline Stories */}
          {data.close_to_deadline?.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Close to deadline</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={data.close_to_deadline}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.deadlineList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.deadlineCard}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({
                        pathname: '/auction-post',
                        params: { id: item.id },
                      } as any)
                    }
                  >
                    <View style={styles.tagBadge}>
                      <Text style={styles.tagText}>
                        {item.is_physical ? 'Physical' : 'Digital'}
                      </Text>
                    </View>
                    <Image
                      source={getImageSource(item)}
                      style={styles.cardImage}
                      resizeMode="cover"
                    />
                    <Text style={styles.cardArtist} numberOfLines={1}>
                      {item.artist_name || 'Artist'}
                    </Text>
                    <Text style={styles.cardPrice}>
                      Php {Number(item.current_bid).toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Feed Grid */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>See More</Text>
            {filteredAuctions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="images-outline" size={36} color="#BBB" />
                <Text style={styles.emptyText}>No live auctions found.</Text>
              </View>
            ) : (
              <View style={[styles.grid, isDesktop ? styles.gridDesktop : styles.gridMobile]}>
                {filteredAuctions.map((item: any) => {
                  const isClosed =
                    item.status === 'SETTLED' ||
                    (item.end_time && new Date(item.end_time).getTime() <= now);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.gridCard, isDesktop ? styles.gridCardDesktop : styles.gridCardMobile]}
                      activeOpacity={0.9}
                      onPress={() =>
                        router.push({
                          pathname: '/auction-post',
                          params: { id: item.id },
                        } as any)
                      }
                    >
                      <View style={styles.imageHeaderWrapper}>
                        <View style={[styles.timerBadge, isClosed && styles.timerBadgeEnded]}>
                          <Ionicons
                            name="time-outline"
                            size={12}
                            color={isClosed ? '#C05C5C' : '#2C3E50'}
                          />
                          <Text style={[styles.timerText, isClosed && styles.timerTextEnded]}>
                            {formatTimer(item.end_time)}
                          </Text>
                        </View>
                        <Image
                          source={getImageSource(item)}
                          style={styles.gridImage}
                          resizeMode="cover"
                        />
                      </View>

                      <View style={styles.cardBody}>
                        <Text style={styles.gridTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.gridArtist} numberOfLines={1}>
                          by {item.artist_name || 'Artist'}
                        </Text>
                        <View style={styles.priceRow}>
                          <View>
                            <Text style={styles.bidPromptLabel}>Current Bid</Text>
                            <Text style={styles.gridPrice}>
                              Php {Number(item.current_bid).toLocaleString()}
                            </Text>
                          </View>
                          <View style={styles.typeTag}>
                            <Text style={styles.typeText}>
                              {item.is_physical ? 'Physical' : 'Digital'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#C05C5C',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },

  // HEADER
  headerWrapper: {
    backgroundColor: '#C05C5C',
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerContent: {
    width: '100%',
    maxWidth: 680,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backBtn: {
    right: 300,
    paddingVertical: 6,
    paddingRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 38,
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
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  feedWrapper: {
    width: '100%',
    maxWidth: 900,
    backgroundColor: '#FFFFFF',
    minHeight: '100%',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: '#ECECEC',
  },

  // BANNER
  banner: {
    backgroundColor: '#A96B6B',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    color: '#FFF',
    fontSize: 15,
  },
  bannerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginVertical: 4,
  },
  bannerButton: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginTop: 6,
  },
  bannerBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },

  // SECTION HEADINGS
  sectionContainer: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#C05C5C',
    marginHorizontal: 16,
    marginBottom: 10,
  },

  // DEADLINE HORIZONTAL CAROUSEL
  deadlineList: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  deadlineCard: {
    width: 124,
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  tagBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 2,
    borderWidth: 0.5,
    borderColor: '#DDD',
  },
  tagText: {
    fontSize: 9,
    color: '#C05C5C',
    fontWeight: 'bold',
  },
  cardImage: {
    width: '100%',
    height: 96,
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: '#EEE',
  },
  cardArtist: {
    fontSize: 11,
    color: '#555',
    marginBottom: 2,
  },
  cardPrice: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#222',
  },

  // FEED GRID (SEE MORE)
  grid: {
    paddingHorizontal: 16,
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
  gridCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  gridCardDesktop: {
    width: '48.8%',
    marginBottom: 10,
  },
  gridCardMobile: {
    width: '100%',
  },
  imageHeaderWrapper: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#F0F0F0',
  },
  gridImage: {
    width: '100%',
    height: 160,
  },
  timerBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 2,
    borderWidth: 0.5,
    borderColor: '#E5E5E5',
    gap: 4,
  },
  timerBadgeEnded: {
    backgroundColor: '#FFF0F0',
    borderColor: '#F5C6CB',
  },
  timerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2C3E50',
  },
  timerTextEnded: {
    color: '#C05C5C',
  },
  cardBody: {
    padding: 10,
  },
  gridTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#222',
  },
  gridArtist: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F4',
  },
  bidPromptLabel: {
    fontSize: 9,
    color: '#888',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  gridPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#C05C5C',
  },
  typeTag: {
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
  },
  typeText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 13,
  },
});