import { Text } from '@/components/Typography';
import API_URL from '@/services/api';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

export default function CreatorAttribution({ artworkId }: { artworkId: string | number }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    fetch(`${API_URL}/api/blockchain/artworks/${artworkId}/creator/`, { signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [artworkId]);
  if (!data?.created_by) return null;
  return <View style={{ gap: 4, marginVertical: 12 }}>
    <Text style={{ fontWeight: '700' }}>Original creator: @{data.created_by.username}</Text>
    <Text>{data.disputed ? 'Creator attribution is under review.' : data.creator_verification === 'reviewed' ? 'Creator attribution reviewed by ArtFiliere.' : 'Creator attribution recorded by ArtFiliere; not independently verified.'}</Text>
  </View>;
}
