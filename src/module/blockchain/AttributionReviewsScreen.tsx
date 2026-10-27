import { Text } from '@/components/Typography';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { purchaseRequest } from '@/services/purchases';
import { auth } from '@/firebase/config';
import ProvenancePanel from './ProvenancePanel';

export default function AttributionReviewsScreen() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const load = async () => { try { await auth.authStateReady(); setData(await purchaseRequest('blockchain/attribution-reviews/')); setError(''); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, []);
  return <ScrollView style={{ flex: 1, backgroundColor: '#FFFCF8' }} contentContainerStyle={{ padding: 24, gap: 16 }}>
    <TouchableOpacity onPress={() => router.back()}><Text>‹ Back</Text></TouchableOpacity>
    <Text style={{ fontSize: 24, fontWeight: '800' }}>Attribution & ownership reviews</Text>
    <Text>Review supporting evidence independently. Confirmed corrections append to the original claim and do not erase it.</Text>
    {!!error && <Text style={{ color: '#AD3535' }}>{error}</Text>}
    <TouchableOpacity onPress={() => void load()}><Text style={{ color: '#B74F50' }}>Refresh queue</Text></TouchableOpacity>
    {data?.reviews.map((r: any) => <View key={r.id} style={{ padding: 18, backgroundColor: '#F5EDE4', borderRadius: 10, gap: 8 }}><Text>Review #{r.id} · @{r.requested_by}</Text><Text>{r.reason}</Text><ProvenancePanel recordId={r.artwork_id} /></View>)}
    {data?.reviews.length === 0 && <Text>No pending attribution reviews.</Text>}
    <Text style={{ fontSize: 18, fontWeight: '700' }}>Failed blockchain transactions</Text>
    {data?.failed_transactions.map((e: any) => <View key={e.id}><Text>{e.kind} · {e.artwork_id}</Text><ProvenancePanel recordId={e.artwork_id} /></View>)}
    {data?.failed_transactions.length === 0 && <Text>No failed transactions.</Text>}
  </ScrollView>;
}
