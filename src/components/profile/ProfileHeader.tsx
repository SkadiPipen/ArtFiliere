import { useRouter } from 'expo-router';
import { Bell, Edit3, FileText, Folder, Settings } from 'lucide-react-native';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ProfileHeaderProps {
  userRole: string;
  profileData: any;
  user: any;
  onLogout: () => void;
}

export default function ProfileHeader({ userRole, profileData, user, onLogout }: ProfileHeaderProps) {
  const router = useRouter();

  const djangoFirstName = profileData?.first_name || profileData?.firstName || '';
  const djangoLastName = profileData?.last_name || profileData?.lastName || '';
  const djangoFullName = `${djangoFirstName} ${djangoLastName}`.trim();

  // Fall back to Firebase display name or username
  const fullName =
    djangoFullName.length > 0
      ? djangoFullName
      : user?.displayName || profileData?.username || user?.email?.split('@')[0] || 'Your Name';

  return (
    <View style={styles.headerBackground}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.innerContainer}>
          {/* TOP BAR */}
          <View style={styles.topRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{userRole}</Text>
            </View>

            <View style={styles.iconGroup}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => Alert.alert('Documents', 'Opening Docs...')}>
                <FileText color="#fff" size={20} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => Alert.alert('Folders', 'Opening Folders...')}>
                <Folder color="#fff" size={20} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => Alert.alert('Notifications', 'No new alerts')}>
                <Bell color="#fff" size={20} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/(home)/settings')}>
                <Settings color="#fff" size={20} />
              </TouchableOpacity>
            </View>
          </View>

          {/* USER PROFILE INFO */}
          <View style={styles.profileContent}>
            <View style={styles.avatarContainer}>
              <Image
                source={{
                  uri: profileData?.profileImage || user?.photoURL || 'https://i.pravatar.cc/150?u=incognito',
                }}
                style={styles.avatar}
              />
            </View>

            <View style={styles.userDetails}>
              <View style={styles.nameRow}>
                <Text style={styles.userName} numberOfLines={1}>{fullName}</Text>
                <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/(home)/edit-profile')}>
                  <Edit3 color="#fff" size={12} />
                  <Text style={styles.editBtnText}>Edit Profile</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.statsRow}>
                <Text style={styles.statText}>25 Reviews</Text>
                <Text style={styles.statDot}>•</Text>
                <Text style={styles.statText}>19 Followers</Text>
                <Text style={styles.statDot}>•</Text>
                <Text style={styles.statText}>3 Following</Text>
              </View>
            </View>

            {userRole === 'Buyer' && (
              <TouchableOpacity
                style={styles.registerArtistBtn}
                onPress={() => router.push('/artist-registration')}
              >
                <Text style={styles.registerText}>Register as ARTIST</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBackground: {
    backgroundColor: '#E67E22',
    width: '100%',
    paddingBottom: 45,
    alignItems: 'center',
  },
  safeArea: {
    width: '100%',
    alignItems: 'center',
  },
  innerContainer: {
    width: '100%',
    maxWidth: 1200,
    paddingHorizontal: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  roleBadge: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    elevation: 3,
  },
  roleText: { color: '#C15656', fontWeight: 'bold', fontSize: 12 },
  iconGroup: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { marginLeft: 16, padding: 4 },
  profileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    flexWrap: 'wrap',
    gap: 15,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.8)',
    overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%' },
  userDetails: { flex: 1, minWidth: 200 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  editBtnText: { color: '#fff', fontSize: 11, fontWeight: '600', marginLeft: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  statText: { color: '#fff', fontSize: 12, opacity: 0.95, fontWeight: '500' },
  statDot: { color: '#fff', marginHorizontal: 6, opacity: 0.7 },
  registerArtistBtn: {
    backgroundColor: '#2ECC71',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    elevation: 2,
  },
  registerText: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
});