import { auth } from '@/firebase/config';
import { fetchRiderProfile } from '@/services/deliveryApi';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface RiderProfile {
  fullName: string;
  email: string;
  phoneNum: string;
  address: string;
  rating: number;
  total_delivery: number;
  date_registered: string;
  vehicle: {
    type: string;
    model: string;
    plate_number: string;
    color: string;
    orcr_docs: string;
  };
  license: {
    license_number: string;
    expiry_date: string;
    document_url: string;
    status: string;
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const [riderData, setRiderData] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const loadProfile = async () => {
    try {
      const data = await fetchRiderProfile();
      if (data) {
        setRiderData(data);
      }
    } catch (err) {
      console.warn('Error loading rider profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [])
  );

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await signOut(auth);
      router.replace('/login');
    } catch (error) {
      console.error('Logout Error', error);
    } finally {
      setLogoutLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#BC5454" />
        <ActivityIndicator size="large" color="#BC5454" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#BC5454" />
      <View style={styles.headerBanner}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Text style={styles.headerSubtitle}>Rider Information</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Avatar & Header Identity */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person-outline" size={50} color="#BC5454" />
          </View>
          <Text style={styles.driverName}>{riderData?.fullName || 'Courier Partner'}</Text>

          <View style={styles.ratingRow}>
            <Ionicons name="star" size={16} color="#FFD700" />
            <Text style={styles.ratingText}> {riderData?.rating ?? 5.0} </Text>
            <Text style={styles.deliveryCount}>({riderData?.total_delivery ?? 0} deliveries)</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.editButton} activeOpacity={0.7}>
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        {/* Personal Details */}
        <Text style={styles.sectionHeading}>Personal Details & Contacts</Text>

        <View style={styles.infoCard}>
          <View style={styles.cardRow}>
            <Ionicons name="mail-outline" size={20} color="#BC5454" style={styles.cardIcon} />
            <View>
              <Text style={styles.cardLabel}>Email</Text>
              <Text style={styles.cardValue}>{riderData?.email || 'N/A'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.cardRow}>
            <Ionicons name="call-outline" size={20} color="#BC5454" style={styles.cardIcon} />
            <View>
              <Text style={styles.cardLabel}>Phone</Text>
              <Text style={styles.cardValue}>{riderData?.phoneNum || 'N/A'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.cardRow}>
            <Ionicons name="location-outline" size={20} color="#BC5454" style={styles.cardIcon} />
            <View>
              <Text style={styles.cardLabel}>Address</Text>
              <Text style={styles.cardValue}>{riderData?.address || 'Cebu City, Philippines'}</Text>
            </View>
          </View>
        </View>

        {/* Vehicle Information */}
        <Text style={styles.sectionHeading}>Vehicle Information</Text>

        <View style={styles.gridCard}>
          <View style={styles.gridRow}>
            <Ionicons name="bicycle-outline" size={22} color="#BC5454" style={styles.cardIcon} />
            <View style={styles.gridItem}>
              <Text style={styles.cardLabel}>Type</Text>
              <Text style={styles.cardValue}>{riderData?.vehicle?.type || 'Motorcycle'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.cardLabel}>Plate Number</Text>
              <Text style={styles.cardValue}>{riderData?.vehicle?.plate_number || 'N/A'}</Text>
            </View>
          </View>

          <View style={[styles.gridRow, { marginTop: 16 }]}>
            <View style={styles.cardIcon} />
            <View style={styles.gridItem}>
              <Text style={styles.cardLabel}>Model</Text>
              <Text style={styles.cardValue}>{riderData?.vehicle?.model || 'N/A'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.cardLabel}>Color</Text>
              <Text style={styles.cardValue}>{riderData?.vehicle?.color || 'N/A'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.documentLabel}>OR/CR Document</Text>
          <View style={styles.documentRow}>
            <Ionicons name="document-text-outline" size={18} color="#7F8C8D" />
            <Text style={styles.documentText}>{riderData?.vehicle?.orcr_docs || 'Verified OR/CR'}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => router.push('/report-management')} style={{ padding: 16, marginVertical: 12, backgroundColor: '#F6E8E1', borderRadius: 12 }}>
          <Text style={{ color: '#A74646', fontWeight: '700' }}>File an incident / dispute report</Text>
        </TouchableOpacity>
        {/* License Information */}
        <Text style={styles.sectionHeading}>Driver's License</Text>
        <View style={styles.gridCard}>
          <View style={styles.gridRow}>
            <Ionicons name="calendar-outline" size={22} color="#BC5454" style={styles.cardIcon} />
            <View style={styles.gridItem}>
              <Text style={styles.cardLabel}>License Number</Text>
              <Text style={styles.cardValue}>{riderData?.license?.license_number || 'N/A'}</Text>
            </View>
          </View>

          <View style={[styles.gridRow, { marginTop: 16 }]}>
            <View style={styles.cardIcon} />
            <View style={styles.gridItem}>
              <Text style={styles.cardLabel}>Expiry Date</Text>
              <Text style={styles.cardValue}>
                {riderData?.license?.expiry_date || 'N/A'}{' '}
                <Text style={styles.validTag}>({riderData?.license?.status || 'Active'})</Text>
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.documentLabel}>License Document</Text>
          <View style={styles.documentRow}>
            <Ionicons name="document-text-outline" size={18} color="#7F8C8D" />
            <Text style={styles.documentText}>{riderData?.license?.document_url || 'Verified License'}</Text>
          </View>
        </View>

        {/* Statistics */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Statistics</Text>
          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>Total Deliveries</Text>
            <Text style={styles.statsValue}>{riderData?.total_delivery ?? 0}</Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>Member Since</Text>
            <Text style={styles.statsValue}>{riderData?.date_registered || '2026'}</Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>Rating</Text>
            <Text style={styles.statsValue}>{riderData?.rating ?? 5.0}/5.0</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={logoutLoading}
          activeOpacity={0.7}
        >
          {logoutLoading ? (
            <ActivityIndicator color="#BC5454" />
          ) : (
            <View style={styles.logoutContent}>
              <Ionicons name="log-out-outline" size={20} color="#BC5454" style={{ marginRight: 6 }} />
              <Text style={styles.logoutText}>Logout</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9FB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  headerBanner: { backgroundColor: '#BC5454', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 24 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 13, color: '#F5EFEB', marginTop: 2 },
  scrollContainer: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 16 },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F5EFEB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  driverName: { fontSize: 22, fontWeight: 'bold', color: '#BC5454', marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  ratingText: { fontSize: 15, fontWeight: 'bold', color: '#333333' },
  deliveryCount: { fontSize: 13, color: '#7F8C8D' },
  editButton: {
    borderWidth: 1,
    borderColor: '#BC5454',
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
  },
  editButtonText: { color: '#BC5454', fontWeight: '600', fontSize: 14 },
  sectionHeading: { fontSize: 16, fontWeight: 'bold', color: '#BC5454', marginBottom: 12, marginTop: 12 },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: { marginRight: 14, width: 24, textAlign: 'center' },
  cardLabel: { fontSize: 12, color: '#7F8C8D', marginBottom: 2 },
  cardValue: { fontSize: 15, color: '#2C3E50', fontWeight: '500' },
  gridCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  gridRow: { flexDirection: 'row' },
  gridItem: { flex: 1 },
  divider: { height: 1, backgroundColor: '#ECF0F1', marginVertical: 14 },
  documentLabel: { fontSize: 12, color: '#7F8C8D', marginBottom: 6 },
  documentRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 8, borderRadius: 6 },
  documentText: { fontSize: 13, color: '#34495E', marginLeft: 8 },
  validTag: { color: '#2ECC71', fontWeight: 'bold', fontSize: 12 },
  statsCard: { backgroundColor: '#F5EFEB', borderRadius: 12, padding: 16, marginBottom: 20 },
  statsTitle: { fontSize: 16, fontWeight: 'bold', color: '#BC5454', marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 },
  statsLabel: { fontSize: 14, color: '#566573', flex: 1 },
  statsValue: { fontSize: 14, fontWeight: 'bold', color: '#2C3E50' },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#BC5454',
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#FFFFFF',
  },
  logoutContent: { flexDirection: 'row', alignItems: 'center' },
  logoutText: { color: '#BC5454', fontWeight: 'bold', fontSize: 15 },
});
