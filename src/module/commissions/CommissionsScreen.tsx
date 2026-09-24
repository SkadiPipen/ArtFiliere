import { auth } from '@/firebase/config';
import { ChatModal } from '@/module/chat-negotiations/chat-index';
import API_URL from '@/services/api';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle2,
  DollarSign,
  Eye,
  MessageCircle,
  Paintbrush,
  XCircle,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CommissionsScreen() {
  const router = useRouter();
  const [role, setRole] = useState<'buyer' | 'artist'>('buyer');
  const [userRole, setUserRole] = useState<string>('buyer');
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChatModal, setShowChatModal] = useState(false);

  // Progress Upload Modal State
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedCommissionId, setSelectedCommissionId] = useState<number | null>(null);
  const [progressPct, setProgressPct] = useState<number>(33);
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [captionInput, setCaptionInput] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  // 1. Fetch user role to determine if artist
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;

        const res = await fetch(`${API_URL}/auth/me/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (res.ok) {
          const data = await res.json();
          const currentRole = (data.role || 'buyer').toLowerCase();
          setUserRole(currentRole);
        }
      } catch (err) {
        console.warn('Failed to fetch user role:', err);
      }
    };
    fetchUserRole();
  }, []);

  const isArtist = userRole === 'artist';

  // Current chat user object for ChatModal
  const currentChatUser = auth.currentUser
    ? {
        id: auth.currentUser.uid,
        uid: auth.currentUser.uid,
        email: auth.currentUser.email || '',
        name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'User',
        displayName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'User',
        role: userRole,
      }
    : null;

  // 2. Fetch commissions according to the active tab
  const fetchCommissions = async () => {
    try {
      setLoading(true);
      const email = auth.currentUser?.email || '';
      const res = await fetch(`${API_URL}/api/commissions/requests/?role=${role}&user_email=${email}`);
      if (res.ok) {
        const data = await res.json();
        setCommissions(data);
      }
    } catch (e) {
      console.warn('Error fetching commissions:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommissions();
  }, [role]);

  const handleManage = async (id: number, action: 'ACCEPT' | 'REJECT') => {
    try {
      const res = await fetch(`${API_URL}/api/commissions/requests/${id}/manage/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        Alert.alert('Updated', `Commission marked as ${action === 'ACCEPT' ? 'In Progress' : 'Declined'}`);
        fetchCommissions();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update commission');
    }
  };

  const handlePayMilestone = async (milestoneId: number, num: number) => {
    try {
      const res = await fetch(`${API_URL}/api/commissions/milestones/${milestoneId}/pay/`, {
        method: 'POST',
      });
      if (res.ok) {
        Alert.alert('Paid', `Milestone #${num} has been paid!`);
        fetchCommissions();
      }
    } catch (e) {
      Alert.alert('Error', 'Payment processing failed');
    }
  };

  const handleUploadProgress = async () => {
    if (!imageUrlInput.trim()) {
      Alert.alert('Required', 'Please enter an image URL or image data.');
      return;
    }

    try {
      setUploading(true);
      const res = await fetch(`${API_URL}/api/commissions/requests/${selectedCommissionId}/track/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrlInput,
          progress_percentage: progressPct,
          caption: captionInput || `Progress update: ${progressPct}%`,
        }),
      });

      if (res.ok) {
        Alert.alert('Success', `Progress update (${progressPct}%) posted!`);
        setUploadModalVisible(false);
        setImageUrlInput('');
        setCaptionInput('');
        fetchCommissions();
      } else {
        const err = await res.json();
        Alert.alert('Error', err.error || 'Failed to upload progress update.');
      }
    } catch (e) {
      Alert.alert('Error', 'Network error posting progress.');
    } finally {
      setUploading(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View>
          <Text style={s.cardTitle}>{item.title}</Text>
          <Text style={s.cardSub}>
            {role === 'buyer' ? `Artist: @${item.artist_name}` : `Client: @${item.buyer_name}`}
          </Text>
        </View>
        <View
          style={[
            s.badge,
            item.status === 'IN_PROGRESS'
              ? s.badgeProgress
              : item.status === 'COMPLETE'
              ? s.badgeDone
              : s.badgePending,
          ]}
        >
          <Text style={s.badgeText}>{item.status}</Text>
        </View>
      </View>

      <Text style={s.desc}>{item.description || 'No specific instructions provided.'}</Text>
      <Text style={s.price}>
        Total: ₱{item.time_duration?.toLocaleString()} • {item.is_rush_job ? 'Rush' : 'Standard'}
      </Text>

      {/* Artist Action Buttons */}
      {role === 'artist' && item.status === 'PENDING' && (
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.btn, s.btnAccept]}
            onPress={() => handleManage(item.commission_req_id, 'ACCEPT')}
          >
            <CheckCircle2 color="#fff" size={14} />
            <Text style={s.btnText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.btnReject]}
            onPress={() => handleManage(item.commission_req_id, 'REJECT')}
          >
            <XCircle color="#fff" size={14} />
            <Text style={s.btnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Artist: Post Process Track Photo */}
      {role === 'artist' && item.status === 'IN_PROGRESS' && (
        <TouchableOpacity
          style={s.updateProgressBtn}
          onPress={() => {
            setSelectedCommissionId(item.commission_req_id);
            setUploadModalVisible(true);
          }}
        >
          <Paintbrush color="#FFF" size={14} />
          <Text style={s.updateProgressText}>Post Stage Progress Update</Text>
        </TouchableOpacity>
      )}

      {/* Commission Utility Row: Chat & Process Track */}
      <View style={s.utilityRow}>
        <TouchableOpacity
          style={s.chatBtn}
          onPress={() => setShowChatModal(true)}
        >
          <MessageCircle color="#E67E22" size={15} />
          <Text style={s.chatBtnText}>Chat & Negotiate</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.trackBtn}
          onPress={() =>
            router.push({
              pathname: '/process-track',
              params: { commissionId: String(item.commission_req_id) },
            } as any)
          }
        >
          <Eye color="#C15656" size={15} />
          <Text style={s.trackBtnText}>Track Progress</Text>
        </TouchableOpacity>
      </View>

      {/* Milestone Payments */}
      <View style={s.milestoneBox}>
        <Text style={s.milestoneHeading}>Payment Milestones</Text>
        {item.milestones?.map((m: any) => (
          <View key={m.milestone_id} style={s.milestoneRow}>
            <Text style={s.milestoneText}>
              Phase {m.milestone_number} ({m.percentage}%): ₱{m.amount?.toLocaleString()}
            </Text>
            {m.status === 'PAID' ? (
              <Text style={s.paidLabel}>✓ PAID</Text>
            ) : (
              <TouchableOpacity
                style={s.payBtn}
                onPress={() => handlePayMilestone(m.milestone_id, m.milestone_number)}
              >
                <DollarSign color="#fff" size={12} />
                <Text style={s.payBtnText}>Pay Phase</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.nav}>
        <TouchableOpacity onPress={handleBack} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ArrowLeft color="#fff" size={24} />
          <Text style={s.navTitle}>Commissions</Text>
        </TouchableOpacity>
      </View>

      {/* Role Toggle */}
      {isArtist ? (
        <View style={s.toggleContainer}>
          <TouchableOpacity
            style={[s.toggleBtn, role === 'buyer' && s.toggleActive]}
            onPress={() => setRole('buyer')}
          >
            <Text style={[s.toggleText, role === 'buyer' && s.toggleTextActive]}>
              My Requests
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, role === 'artist' && s.toggleActive]}
            onPress={() => setRole('artist')}
          >
            <Text style={[s.toggleText, role === 'artist' && s.toggleTextActive]}>
              Incoming Jobs
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.buyerHeader}>
          <Text style={s.buyerHeaderText}>My Requests</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#E67E22" size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={commissions}
          keyExtractor={(item) => String(item.commission_req_id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={s.empty}>No commissions found.</Text>}
        />
      )}

      {/* Upload Stage Progress Modal */}
      <Modal visible={uploadModalVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Post Process Track Update</Text>

            <Text style={s.modalLabel}>Select Stage Percentage:</Text>
            <View style={s.pctRow}>
              {[33, 66, 100].map((pct) => (
                <TouchableOpacity
                  key={pct}
                  style={[s.pctBtn, progressPct === pct && s.pctBtnActive]}
                  onPress={() => setProgressPct(pct)}
                >
                  <Text style={[s.pctBtnText, progressPct === pct && s.pctBtnTextActive]}>
                    {pct}% {pct === 33 ? '(Sketch)' : pct === 66 ? '(Render)' : '(Final)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.modalLabel}>Image URL / Storage URI:</Text>
            <TextInput
              style={s.modalInput}
              placeholder="https://... or base64"
              value={imageUrlInput}
              onChangeText={setImageUrlInput}
            />

            <Text style={s.modalLabel}>Caption / Notes (Optional):</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. Finished rough pencils"
              value={captionInput}
              onChangeText={setCaptionInput}
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setUploadModalVisible(false)}
              >
                <Text style={{ color: '#666', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalSubmitBtn}
                onPress={handleUploadProgress}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: '800' }}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Chat / Negotiation Modal Mount */}
      {showChatModal && currentChatUser && (
        <ChatModal
          visible={showChatModal}
          onClose={() => setShowChatModal(false)}
          currentUser={currentChatUser as any}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF6EF' },
  nav: {
    backgroundColor: '#E67E22',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  navTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginLeft: 10 },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#EDE5D8',
    margin: 12,
    borderRadius: 10,
    padding: 4,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: '#E67E22' },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#666' },
  toggleTextActive: { color: '#FFF' },

  buyerHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  buyerHeaderText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#8E44AD',
  },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8DED1',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#2C3E50' },
  cardSub: { fontSize: 12, color: '#777', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgePending: { backgroundColor: '#FAD7A0' },
  badgeProgress: { backgroundColor: '#AED6F1' },
  badgeDone: { backgroundColor: '#A9DFBF' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#333' },
  desc: { fontSize: 13, color: '#555', marginVertical: 8 },
  price: { fontSize: 13, fontWeight: '700', color: '#C0392B' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  btnAccept: { backgroundColor: '#27AE60' },
  btnReject: { backgroundColor: '#E74C3C' },
  btnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  updateProgressBtn: {
    backgroundColor: '#8E44AD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  updateProgressText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  utilityRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  chatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E67E22',
    backgroundColor: '#FEF5EC',
  },
  chatBtnText: {
    color: '#E67E22',
    fontSize: 12,
    fontWeight: '700',
  },
  trackBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C15656',
    backgroundColor: '#FAF0F0',
  },
  trackBtnText: {
    color: '#C15656',
    fontSize: 12,
    fontWeight: '700',
  },

  milestoneBox: { backgroundColor: '#FDFBF7', padding: 10, borderRadius: 8, marginTop: 10 },
  milestoneHeading: { fontSize: 12, fontWeight: '800', color: '#444', marginBottom: 6 },
  milestoneRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 },
  milestoneText: { fontSize: 12, color: '#666' },
  paidLabel: { color: '#27AE60', fontSize: 11, fontWeight: '800' },
  payBtn: {
    backgroundColor: '#27AE60',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  payBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700', marginLeft: 2 },
  empty: { textAlign: 'center', marginTop: 30, color: '#888' },

  // Stage upload modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#B84A4A', marginBottom: 14, textAlign: 'center' },
  modalLabel: { fontSize: 13, fontWeight: '700', color: '#444', marginTop: 10, marginBottom: 6 },
  pctRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  pctBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: '#EEE', borderRadius: 6 },
  pctBtnActive: { backgroundColor: '#B84A4A' },
  pctBtnText: { fontSize: 11, fontWeight: '700', color: '#555' },
  pctBtnTextActive: { color: '#FFF' },
  modalInput: { borderWidth: 1, borderColor: '#CCC', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#FAFAFA' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  modalCancelBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  modalSubmitBtn: { backgroundColor: '#B84A4A', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 6 },
});