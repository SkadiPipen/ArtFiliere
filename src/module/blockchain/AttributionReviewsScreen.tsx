import AdminTabs from '@/module/admin/AdminTabs';
import { adminWorkspaceStyles } from '@/module/admin/adminDesign';
import { useAdminRefresh } from '@/module/admin/AdminRefresh';
import { ShieldCheck, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import { staffWorkspaceStyles as staffStyles } from '@/components/staffWorkspaceStyles';
import { goBackToWorkspace } from '@/services/navigation';
import { Text } from '@/components/Typography';
import { markAdminQueueRead } from '@/services/adminNotifications';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { purchaseRequest } from '@/services/purchases';
import { auth } from '@/firebase/config';
import ProvenancePanel from './ProvenancePanel';

export default function AttributionReviewsScreen({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<'reviews' | 'failed'>('reviews');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => { setLoading(true); try { await auth.authStateReady(); const result = await purchaseRequest('blockchain/attribution-reviews/'); setData(result); void markAdminQueueRead('attribution', result.reviews.map((row: any) => row.id)); void markAdminQueueRead('blockchain', result.failed_transactions.map((row: any) => row.id)); setError(''); } catch (e: any) { setError(e.message); } finally { setLoading(false); } };
  const adminWorkspace = useAdminRefresh(load);
  const workspace = adminWorkspace ? adminWorkspaceStyles : staffStyles;
  useEffect(() => { void load(); }, []);
  return <ScrollView style={{ flex: 1, backgroundColor: '#FAF7F3' }} contentContainerStyle={embedded ? workspace.content : { padding: 24, gap: 16 }}>
    {!embedded && <>
    <TouchableOpacity onPress={() => void goBackToWorkspace()}><Text>‹ Back</Text></TouchableOpacity>
    </>}
    <View style={workspace.hero}><View style={workspace.titleRow}><ShieldCheck size={30} color="#B65B50" /><Text style={workspace.title}>Attribution & Ownership Reviews</Text></View><Text style={workspace.intro}>Review supporting evidence independently. Confirmed corrections append to the original claim and preserve its history.</Text></View>
    <AdminTabs items={[{ id: 'reviews', label: `Ownership reviews${data ? ` (${data.reviews.length})` : ''}`, icon: ShieldCheck }, { id: 'failed', label: `Failed transactions${data ? ` (${data.failed_transactions.length})` : ''}`, icon: AlertCircle }]} value={tab} onChange={setTab} />
    {!adminWorkspace && <TouchableOpacity onPress={() => void load()}><Text style={{ color: '#B74F50' }}>Refresh queue</Text></TouchableOpacity>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#AD3535' }}>{error}</Text>}
    {loading && <ActivityIndicator color="#B65B50" />}
    {!loading && data && (tab === 'reviews' ? data.reviews : data.failed_transactions).map((row: any) => {
      const key = `${tab}-${row.id}`;
      const open = expanded === key;
      return <View key={key} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5DAD3', overflow: 'hidden' }}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setExpanded(open ? null : key)} style={{ padding: 22, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {tab === 'reviews' ? <ShieldCheck size={22} color="#B65B50" /> : <AlertCircle size={22} color="#B65B50" />}
          <View style={{ flex: 1, gap: 6 }}><Text style={workspace.quickTitle}>{tab === 'reviews' ? `Review #${row.id} | @${row.requested_by}` : `${row.kind} | Artwork #${row.artwork_id}`}</Text><Text style={workspace.muted}>{tab === 'reviews' ? row.reason : 'Expand to inspect the blockchain record and transaction details.'}</Text></View>
          {open ? <ChevronUp size={20} color="#A74646" /> : <ChevronDown size={20} color="#A74646" />}
        </TouchableOpacity>
        {open && <View style={{ padding: 22, paddingTop: 0, borderTopWidth: 1, borderColor: '#EFE3DD' }}><ProvenancePanel recordId={row.artwork_id} /></View>}
      </View>;
    })}
    {!loading && !error && data && !(tab === 'reviews' ? data.reviews : data.failed_transactions).length && <View style={[workspace.quickCard, { justifyContent: 'center', padding: 36 }]}><Text style={workspace.muted}>{tab === 'reviews' ? 'No pending attribution reviews.' : 'No failed blockchain transactions.'}</Text></View>}
  </ScrollView>;
}
