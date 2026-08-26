import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { useRouter } from 'expo-router';
import { ArrowLeft, Clock3, Store } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Artwork = { id: number; title: string; category: string; price: string; image_data: string; status: 'pending' | 'approved' | 'declined'; decline_reason: string; created_at: string };

const STATUS_COPY = {
  pending: { label: 'Under review', detail: 'Your artwork is waiting for Creative Moderator review.' },
  approved: { label: 'On the market', detail: 'Your artwork is live and visible to buyers.' },
  declined: { label: 'Needs changes', detail: 'Review the moderator feedback and submit an updated post.' },
};

export default function ActivitiesScreen() {
  const router = useRouter();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const response = await fetch(`${API_URL}/api/users/artworks/?mine=1`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (response.ok) setArtworks(await response.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load().catch(() => setLoading(false)); }, [load]);

  return <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
    <View style={styles.header}><TouchableOpacity onPress={() => router.back()}><ArrowLeft color="#C15656" size={24} /></TouchableOpacity><Text style={styles.headerTitle}>Activities</Text><View style={{ width: 24 }} /></View>
    {loading ? <View style={styles.center}><ActivityIndicator color="#C15656" size="large" /></View> : <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor="#C15656" />}>
      <View style={styles.intro}><Clock3 color="#C15656" size={22} /><View><Text style={styles.title}>Your artwork activity</Text><Text style={styles.lead}>Track artwork under review and currently on the market.</Text></View></View>
      {artworks.length ? artworks.map((artwork) => { const copy = STATUS_COPY[artwork.status]; return <View key={artwork.id} style={styles.card}>
        <Image source={{ uri: artwork.image_data }} style={styles.image} />
        <View style={styles.copy}><View style={styles.cardTop}><Text style={styles.artTitle}>{artwork.title}</Text><View style={[styles.status, styles[`status_${artwork.status}`]]}><Text style={styles.statusText}>{copy.label}</Text></View></View><Text style={styles.meta}>{artwork.category} · ₱ {artwork.price}</Text><Text style={styles.detail}>{copy.detail}</Text>{artwork.status === 'declined' && !!artwork.decline_reason && <Text style={styles.reason}>Feedback: {artwork.decline_reason}</Text>}</View>
      </View>; }) : <View style={styles.empty}><Store color="#D7C7C0" size={38} /><Text style={styles.emptyTitle}>No artwork activity yet</Text><Text style={styles.emptyText}>Use the Post button on the dashboard to submit your first artwork.</Text></View>}
    </ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFDF7' }, header: { height: 58, backgroundColor: '#FFFFFF', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#E8DDD6' }, headerTitle: { color: '#382D29', fontSize: 18, fontWeight: '800' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 110 }, intro: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 20 }, title: { color: '#3A2D2A', fontSize: 21, fontWeight: '800' }, lead: { color: '#7C6A64', fontSize: 12, marginTop: 3 }, card: { backgroundColor: '#FFFFFF', borderColor: '#E7DDD5', borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', gap: 13, marginBottom: 11 }, image: { width: 82, height: 82, borderRadius: 8, backgroundColor: '#F1E8E1' }, copy: { flex: 1 }, cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }, artTitle: { color: '#3A2D2A', fontWeight: '800', fontSize: 15, flex: 1 }, status: { borderRadius: 14, paddingVertical: 4, paddingHorizontal: 8 }, status_pending: { backgroundColor: '#FFF0CD' }, status_approved: { backgroundColor: '#DCEBDD' }, status_declined: { backgroundColor: '#F8DEDE' }, statusText: { color: '#624B43', fontSize: 10, fontWeight: '800' }, meta: { color: '#9B6A5C', fontSize: 11, marginTop: 5 }, detail: { color: '#6E625C', fontSize: 11, lineHeight: 15, marginTop: 7 }, reason: { color: '#B54F4F', fontSize: 11, lineHeight: 15, marginTop: 5, fontWeight: '700' }, empty: { alignItems: 'center', paddingTop: 95, paddingHorizontal: 35 }, emptyTitle: { color: '#5D4B46', fontSize: 16, fontWeight: '800', marginTop: 11 }, emptyText: { color: '#8A7B74', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 5 },
});
