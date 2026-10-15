import { auth } from '@/firebase/config';
import AvailabilityCalendar from '@/module/commissions/AvailabilityCalendar';
import API_URL from '@/services/api';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

export default function PortfolioAvailability({ artistId }: { artistId: number }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [works, setWorks] = useState<any[]>([]);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_URL}/api/users/artworks/?mine=1`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Unable to load portfolio.');
        const data = await response.json();
        if (active) { setWorks(data.sort((a: any, b: any) => Number(b.id) - Number(a.id)).slice(0, 3)); setError(''); }
      } catch (error: any) { if (active) setError(error.message); }
    })();
    return () => { active = false; };
  }, [artistId]));
  return <View style={{ flexDirection: width >= 1000 ? 'row' : 'column', gap: 20, marginVertical: 18 }}>
    <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#40322E' }}>Latest Portfolio Works</Text>
      {!!error && <Text>{error}</Text>}
      {!error && !works.length && <Text>No works yet.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {works.map(work => <TouchableOpacity key={work.id} onPress={() => router.push('/my-portfolio')} style={{ flex: 1, minWidth: 110 }}>
          <Image source={{ uri: work.image_data }} style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }} />
          <Text numberOfLines={1}>{work.title}</Text>
        </TouchableOpacity>)}
      </View>
      <TouchableOpacity onPress={() => router.push('/my-portfolio')}><Text style={{ color: '#C15656', fontWeight: '700' }}>View complete portfolio →</Text></TouchableOpacity>
    </View>
    <View style={{ width: width >= 1000 ? 320 : '100%' }}><AvailabilityCalendar artistId={artistId} /></View>
  </View>;
}
