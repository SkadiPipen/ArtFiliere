import API_URL from '@/services/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function ProcessTrackScreen() {
  const router = useRouter();
  const { commissionId } = useLocalSearchParams<{ commissionId: string }>();

  const [loading, setLoading] = useState(true);
  const [trackData, setTrackData] = useState<any>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

  useEffect(() => {
    fetchTrack();
  }, [commissionId]);

  const fetchTrack = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/commissions/requests/${commissionId}/track/`);
      if (res.ok) {
        const data = await res.json();
        setTrackData(data);
        if (data.photos && data.photos.length > 0) {
          setSelectedPhotoIndex(data.photos.length - 1); // latest by default
        }
      }
    } catch (e) {
      console.warn('Error loading process track:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/commissions' as any);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#C15656" size="large" />
      </View>
    );
  }

  const currentPercentage = trackData?.photos?.[selectedPhotoIndex]?.progress_percentage ?? trackData?.current_progress ?? 33;
  const activeImage = trackData?.photos?.[selectedPhotoIndex]?.image_url || 'https://via.placeholder.com/400';

  return (
    <SafeAreaView style={s.container}>
      {/* Top Left Back Arrow */}
      <TouchableOpacity style={s.backBtn} onPress={handleBack}>
        <ChevronLeft color="#C15656" size={32} />
      </TouchableOpacity>

      {/* Screen Title */}
      <Text style={s.screenTitle}>Process Track</Text>

      {/* Process Track Bar (Red fill vs Grey remainder) */}
      <View style={s.trackBarContainer}>
        <View style={s.trackBarBackground}>
          <View style={[s.trackBarFill, { width: `${Math.min(100, Math.max(5, currentPercentage))}%` }]} />
        </View>
      </View>

      {/* Main Stage Artwork Container with red border frame */}
      <View style={s.imageCenterWrapper}>
        <View style={s.imageCard}>
          <Image source={{ uri: activeImage }} style={s.artworkImage} resizeMode="contain" />
        </View>

        {/* Caption / Phase Indicator */}
        <Text style={s.progressLabel}>{currentPercentage}% Completed</Text>
      </View>

      {/* Stage Dots to switch between Sketch (33%), Shading (66%), Final (100%) */}
      {trackData?.photos && trackData.photos.length > 1 && (
        <View style={s.stageDotsRow}>
          {trackData.photos.map((p: any, idx: number) => (
            <TouchableOpacity
              key={p.photo_id}
              style={[s.stageDot, selectedPhotoIndex === idx && s.stageDotActive]}
              onPress={() => setSelectedPhotoIndex(idx)}
            >
              <Text style={[s.stageDotText, selectedPhotoIndex === idx && s.stageDotTextActive]}>
                {p.progress_percentage}%
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF6ED' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF6ED' },
  backBtn: { position: 'absolute', top: 50, left: 24, zIndex: 10 },
  screenTitle: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 22,
    fontWeight: '800',
    color: '#B84A4A',
    letterSpacing: 0.5,
  },

  // Red progress bar matching wireframes
  trackBarContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 30,
    paddingHorizontal: 40,
  },
  trackBarBackground: {
    width: '100%',
    maxWidth: 500,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D9D9D9',
    overflow: 'hidden',
  },
  trackBarFill: {
    height: '100%',
    backgroundColor: '#C15656',
    borderRadius: 4,
  },

  // Image Frame matching the red bordered box in wireframes
  imageCenterWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  imageCard: {
    width: Math.min(width * 0.75, 340),
    height: Math.min(width * 0.95, 420),
    borderWidth: 1.5,
    borderColor: '#C15656',
    backgroundColor: '#FFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkImage: { width: '100%', height: '100%' },
  progressLabel: {
    marginTop: 16,
    color: '#B84A4A',
    fontSize: 14,
    fontWeight: '700',
  },

  stageDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 40,
  },
  stageDot: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#E6DCCF',
  },
  stageDotActive: { backgroundColor: '#C15656' },
  stageDotText: { fontSize: 11, fontWeight: '700', color: '#666' },
  stageDotTextActive: { color: '#FFF' },
});