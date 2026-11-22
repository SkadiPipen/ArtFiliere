import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import AdminTabs from '@/module/admin/AdminTabs';
import SupportScreen from '@/module/support/SupportScreen';
import AttributionReviewsScreen from '@/module/blockchain/AttributionReviewsScreen';

export default function CreativeConcernQueues({ onClose }: { onClose: () => void }) {
  const { queue, section } = useLocalSearchParams<{ queue?: string; section?: string }>();
  const [tab, setTab] = useState<'concerns' | 'attribution'>(queue === 'attribution' || section === 'attribution' ? 'attribution' : 'concerns');
  useEffect(() => { if (queue === 'attribution' || section === 'attribution') setTab('attribution'); }, [queue, section]);
  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: 24 }}><AdminTabs items={[{ id: 'concerns', label: 'Reports & appeals' }, { id: 'attribution', label: 'Attribution disputes' }]} value={tab} onChange={setTab} /></View>
    {tab === 'concerns' ? <SupportScreen moderator embedded onClose={onClose} /> : <AttributionReviewsScreen embedded mode="reviews" />}
  </View>;
}
