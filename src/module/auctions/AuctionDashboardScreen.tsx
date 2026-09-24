import API_URL from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function AuctionDashboardScreen() {
    const router = useRouter();
    const [data, setData] = useState<any>({ close_to_deadline: [], all_auctions: [] });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const fetchAuction = async () => {
        try {
            // API_URL and fallback
            let res = await fetch(`${API_URL}/api/auction/dashboard/`);
            if (res.status === 404) {
                res = await fetch(`${API_URL}/api/auctions/dashboard/`);
            }
            if (res.ok) {
                const json = await res.json();
                console.log('Auction Dashboard API response:', json);
                const allList = json.all_auctions || (Array.isArray(json) ? json : []); 
                const deadlineList = (json.close_to_deadline && json.close_to_deadline.length > 0)
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
            item.image_data || item.artwork_image || item.image_url || item.image || item.artwork?.image_data || item.artwork?.image;

        if (!raw) return { uri: 'https://via.placeholder.com/200' };

        if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
            return { uri: raw};
        }

        if (raw.startsWith('/media/') || raw.startsWith('/static/')) {
            return { uri: `${API_URL}${raw}` };
        }

        return { uri: `data:image/jpeg:base64,${raw}` };
    }

    if (loading) {
        return <ActivityIndicator size="large" color="#BC5454" style={{ flex: 1, marginTop: 60}}/>;
    }
    
    const filteredAuctions = data.all_auctions.filter((item: any) =>
        (item.title || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.artist_name || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            {/* Top Search */}
            <View style={styles.header}>
                <View style={styles.searchBar}>
                    <TextInput placeholder="Search auction..." value={search} onChangeText={setSearch} style={styles.searchInput}/>
                    <Ionicons name="search" size={18} color="#BC5454"/>
                </View>
                <View style={styles.headerIcons}>
                    <Ionicons name="folder-outline" size={22} color="#FFF" style={styles.icon}/>
                    <Ionicons name="notifications-outline" size={22} color="#FFF" style={styles.icon}/>
                    <Ionicons name="settings-outline" size={22} color="#FFF" style={styles.icon}/>
                </View>
            </View>

            {/* Banner */}
            <View style={styles.banner}>
                <View style={styles.bannerText}>
                    <Text style={styles.bannerTitle}>New To <Text style={{ fontWeight: 'bold' }}>Artfilier</Text> Auction?</Text>
                    <Text style={styles.bannerSubtitle}>Bid on exclusive curated original pieces.</Text>
                    <TouchableOpacity style={styles.bannerButton}>
                        <Text style={styles.bannerBtnText}>Learn more about our auction...</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Close to Dealine Carousel */}
            {data.close_to_deadline?.length > 0 && (
                <>
                    <Text style={styles.sectionTitle}>Close to deadline</Text>
                    <FlatList
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        data={data.close_to_deadline}
                        keyExtractor={(item) => String(item.id)}
                        contentContainerStyle={{ paddingHorizontal: 16 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.deadlineCard} onPress={() => router.push({ pathname: '/auction-post', params: { id: item.id } })}>
                                <View style={styles.tagBadge}>
                                    <Text style={styles.tagText}>{item.is_physical ? 'Physical' : 'Digital'}</Text>
                                </View>
                                <Image source={getImageSource(item)} style={styles.cardImage} resizeMode="cover"/>
                                <Text style={styles.cardArtist} numberOfLines={1}>{item.artist_name || 'Artist'}</Text>
                                <Text style={styles.cardPrice}>Php {Number(item.current_bid).toLocaleString()}</Text>
                            </TouchableOpacity>
                        )}
                    />
                </>
            )}

            {/* See More Grid */}
            <Text style={[styles.sectionTitle, { marginTop: 24}]}>See More</Text>
            {filteredAuctions.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: '#888' }}>No live auctions found.</Text>
                </View>    
            ) : (
                <View style={styles.grid}>
                    {data.all_auctions.map((item: any) => (
                        <TouchableOpacity key={item.id} style={styles.gridCard} onPress={() => router.push({ pathname: '/auction-post', params: { id: item.id } })}>
                            <View style={styles.timerBadge}>
                                <Ionicons name="time-outline" size={13} color="#2C3E50"/>
                                <Text style={styles.timerText}>{formatTimer(item.end_time)}</Text>
                            </View>
                            <Image source={getImageSource(item)} style={styles.gridImage} resizeMode="cover"/>
                            <Text style={styles.gridTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.gridArtist}>{item.artist_name || 'Artist'}</Text>
                            <View style={styles.priceRow}>
                                <Text style={styles.gridPrice}>Php {Number(item.current_bid).toLocaleString()}</Text>
                                <Text style={styles.typeText}>{item.is_physical ? 'Physical' : 'Digital'}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { backgroundColor: '#C05C5C', padding: 16, paddingTop: 48, flexDirection: 'row', alignItems: 'center' },
  searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 12, height: 36, alignItems: 'center' },
  searchInput: { flex: 1, fontSize: 13 },
  headerIcons: { flexDirection: 'row', marginLeft: 10 },
  icon: { marginLeft: 10 },
  banner: { backgroundColor: '#A96B6B', margin: 16, borderRadius: 12, padding: 18, flexDirection: 'row' },
  bannerText: { flex: 1 },
  bannerTitle: { color: '#FFF', fontSize: 16 },
  bannerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginVertical: 4 },
  bannerButton: { backgroundColor: 'rgba(255,255,255,0.3)', alignSelf: 'flex-start', padding: 6, borderRadius: 4, marginTop: 6 },
  bannerBtnText: { color: '#FFF', fontSize: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#C05C5C', marginLeft: 16, marginBottom: 10 },
  deadlineCard: { width: 130, marginRight: 12, backgroundColor: '#FAFAFA', borderRadius: 10, padding: 8, elevation: 1 },
  tagBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: '#FFF', paddingHorizontal: 6, borderRadius: 4, zIndex: 1, borderWidth: 0.5, borderColor: '#DDD' },
  tagText: { fontSize: 9, color: '#C05C5C' },
  cardImage: { width: '100%', height: 100, borderRadius: 8, marginBottom: 6 },
  cardArtist: { fontSize: 12, color: '#333' },
  cardPrice: { fontSize: 13, fontWeight: 'bold', color: '#000' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, justifyContent: 'space-between' },
  gridCard: { width: '48%', backgroundColor: '#FAFAFA', borderRadius: 10, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#EEE' },
  timerBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.9)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, zIndex: 1 },
  timerText: { fontSize: 10, marginLeft: 4, fontWeight: 'bold' },
  gridImage: { width: '100%', height: 130 },
  gridTitle: { fontSize: 13, fontWeight: 'bold', marginTop: 6, marginHorizontal: 8 },
  gridArtist: { fontSize: 11, color: '#777', marginHorizontal: 8 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: 8 },
  gridPrice: { fontSize: 13, fontWeight: 'bold', color: '#C05C5C' },
  typeText: { fontSize: 10, color: '#888' },
});