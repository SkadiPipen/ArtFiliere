import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { useRouter } from 'expo-router';
import { ArrowLeft, Clock3, Store, Truck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Artwork = {
  id: number;
  title: string;
  category: string;
  price: string;
  image_data: string;
  status: "pending" | "approved" | "declined";
  decline_reason: string;
  created_at: string;
};

type ActivityLogItem = { id: number; action: string; description: string; reference_type: string; reference_id: number; created_at: string; };

const STATUS_COPY = {
  pending: {
    label: "Under review",
    detail: "Your artwork is waiting for Creative Moderator review.",
  },
  approved: {
    label: "On the market",
    detail: "Your artwork is live and visible to buyers.",
  },
  declined: {
    label: "Needs changes",
    detail: "Review the moderator feedback. You can appeal this rejection.",
  },
};

export default function ActivitiesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'posts' | 'purchases'>('purchases');
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      
      // Fetched artists posts
      const artRes = await fetch(`${API_URL}/api/users/artworks/?mine=1`, { headers: { Authorization: `Bearer ${token}` } });
      if (artRes.ok) setArtworks(await artRes.json());

      // Fetches buyer activity logs and delivery
      const logRes = await fetch(`${API_URL}/api/wallets/activities/`, { headers: { Authorization: `Bearer ${token}` } });
      if (logRes.ok) setActivityLogs(await logRes.json());
    } catch (e) {
      console.error('Error fetching activities:', e)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  return <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()}>
        <ArrowLeft color="#C15656" size={24} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Activities</Text>
      <View style={{ width: 24 }} />
    </View>

    {/* Tabs */}
    <View style={styles.tabBar}>
      <TouchableOpacity style={[styles.tabItem, tab === 'purchases' && styles.tabItemActive]} onPress={() => setTab('purchases')}>
        <Text style={[styles.tabText, tab === 'purchases' && styles.tabTextActive]}>
          Purchases & Deliveries
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tabItem, tab === 'posts' && styles.tabItemActive]} onPress={() => setTab('posts')}>
        <Text style={[styles.tabText, tab === 'posts' && styles.tabTextActive]}>
          My Artwork Posts
        </Text>
      </TouchableOpacity>
    </View>

    {loading ? (
      <View style={styles.center}>
        <ActivityIndicator color="#C15656" size="large" />
      </View> 
    ) : (
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor="#C15656" />}>
        {tab === 'purchases' ? (
          // Buyer side
          activityLogs.length ? (
            activityLogs.map((log) => (
              <View key={log.id} style={styles.card}>
                <View style={styles.iconContainer}>
                  <Truck color="#C15656" size={22} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.artTitle}>{log.action.replace(/_/g, ' ').toUpperCase()}</Text>
                  <Text style={styles.detail}>{log.description}</Text>
                  <Text style={styles.meta}>{new Date(log.created_at).toLocaleDateString()}</Text>

                  {/* Tracking Link */}
                  {log.reference_type === 'delivery_order' && (
                    <TouchableOpacity style={styles.trackButton} onPress={() => router.push('/purchases' as any)}>
                      <Truck color="#FFFFFF" size={14}/>
                      <Text style={styles.trackButtonText}>Track Delivery</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.empty}>
              <Truck color="#D7C7C0" size={38}/>
              <Text style={styles.emptyTitle}>No purchase activity yet</Text>
              <Text style={styles.emptyText}>Deliveries for items you buy will appear here.</Text>
            </View>
          )
        ) : (
          // Artist Posts
          <>
            <View style={styles.intro}>
              <Clock3 color="#C15656" size={22} />
              <View>
                <Text style={styles.title}>Your artwork activity</Text>
                <Text style={styles.lead}>Track artwork under review and currently on the market.</Text>
              </View>
            </View>
            {artworks.length ? (
              artworks.map((artwork) => { 
                const copy = STATUS_COPY[artwork.status]; 
                return (
                  <View key={artwork.id} style={styles.card}>
                    <Image source={{ uri: artwork.image_data }} style={styles.image} />
                    <View style={styles.copy}>
                      <View style={styles.cardTop}>
                        <Text style={styles.artTitle}>{artwork.title}</Text>
                        <View style={[styles.status, styles[`status_${artwork.status}`]]}>
                          <Text style={styles.statusText}>{copy.label}</Text>
                        </View>
                      </View>
                    <Text style={styles.meta}>{artwork.category} · ₱ {artwork.price}</Text>
                    <Text style={styles.detail}>{copy.detail}</Text>
                    {artwork.status === 'declined' && !!artwork.decline_reason && (
                      <Text style={styles.reason}>Feedback: {artwork.decline_reason}</Text>
                    )}
                    {artwork.status === 'declined' && (
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Appeal rejection of ${artwork.title}`} style={styles.trackButton} onPress={() => router.push({ pathname: "/support", params: { artworkId: String(artwork.id) } })}>
                        <Text style={styles.trackButtonText}>Appeal rejection</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.empty}>
              <Store color="#D7C7C0" size={38} />
              <Text style={styles.emptyTitle}>No artwork activity yet</Text>
              <Text style={styles.emptyText}>Use the Post button on the dashboard to submit your first artwork.</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  )}
  </SafeAreaView>
  ;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFDF7' }, 
  header: { 
    height: 58, 
    backgroundColor: '#FFFFFF', 
    paddingHorizontal: 18, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    borderBottomWidth: 1, 
    borderColor: '#E8DDD6' 
  }, 
  headerTitle: { 
    color: '#382D29', 
    fontSize: 18, 
    fontWeight: '800' 
  },
tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E8DDD6',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#C15656',
  },
  tabText: {
    color: '#8A7B74',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#C15656',
  },
  center: { 
    flex: 1,
    alignItems: 'center', 
    justifyContent: 'center' 
  }, 
  content: { 
    width: '100%', 
    maxWidth: 760, 
    alignSelf: 'center', 
    padding: 20, 
    paddingBottom: 110 
  }, 
  intro: { 
    flexDirection: 'row', 
    gap: 12, 
    alignItems: 'center', 
    marginBottom: 20 
  }, 
  title: { 
    color: '#3A2D2A', 
    fontSize: 21, 
    fontWeight: '800' 
  }, 
  lead: { 
    color: '#7C6A64', 
    fontSize: 12, 
    marginTop: 3 
  }, 
  card: { 
    backgroundColor: '#FFFFFF', 
    borderColor: '#E7DDD5', 
    borderWidth: 1, 
    borderRadius: 12, 
    padding: 12, 
    flexDirection: 'row', 
    gap: 13, 
    marginBottom: 11,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#FBEBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { 
    width: 82, 
    height: 82, 
    borderRadius: 8, 
    backgroundColor: '#F1E8E1' 
  }, 
  copy: { flex: 1 }, 
  cardTop: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    justifyContent: 'space-between', 
    gap: 8 
  }, 
  artTitle: { 
    color: '#3A2D2A', 
    fontWeight: '800', 
    fontSize: 15, 
    flex: 1 
  }, 
  status: { 
    borderRadius: 14, 
    paddingVertical: 4, 
    paddingHorizontal: 8 
  }, 
  status_pending: { backgroundColor: '#FFF0CD' }, 
  status_approved: { backgroundColor: '#DCEBDD' }, 
  status_declined: { backgroundColor: '#F8DEDE' }, 
  statusText: { 
    color: '#624B43', 
    fontSize: 10, 
    fontWeight: '800' 
  }, 
  meta: { 
    color: '#9B6A5C', 
    fontSize: 11, 
    marginTop: 5 
  }, 
  detail: { 
    color: '#6E625C', 
    fontSize: 11, 
    lineHeight: 15, 
    marginTop: 7 
  }, 
  reason: { 
    color: '#B54F4F', 
    fontSize: 11, 
    lineHeight: 15, 
    marginTop: 5, 
    fontWeight: '700' 
  }, 
  empty: { 
    alignItems: 'center', 
    paddingTop: 95, 
    paddingHorizontal: 35 
  }, 
  emptyTitle: { 
    color: '#5D4B46', 
    fontSize: 16, 
    fontWeight: '800', 
    marginTop: 11 
  }, 
  emptyText: { 
    color: '#8A7B74', 
    fontSize: 12, 
    textAlign: 'center', 
    lineHeight: 18, 
    marginTop: 5 
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#C15656',
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  trackButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
