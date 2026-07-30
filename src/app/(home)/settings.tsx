import { auth } from '@/firebase/config';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import {
  ArrowLeft,
  ChevronRight,
  CreditCard,
  Lock,
  LogOut,
  User,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TabType = 'account' | 'privacy' | 'billing';

export default function SettingsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [loggingOut, setLoggingOut] = useState(false);

  const performLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
      router.replace('/login');
    } catch (error) {
      console.log('Error logging out:', error);
      setLoggingOut(false);
    }
  };

  const handleLogoutPress = () => {
    if (Platform.OS === 'web') {
      const confirmLogout = window.confirm('Are you sure you want to log out?');
      if (confirmLogout) {
        performLogout();
      }
    } else {
      Alert.alert('Logout', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: performLogout,
        },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <ArrowLeft color="#fff" size={22} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>User Settings</Text>
          <View style={{ width: 28 }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.discorContainer, isDesktop && styles.desktopContainer]}>
          {/* Lft sidebar navigation */}
          <View style={[styles.sidebar, isDesktop && styles.desktopSidebar]}>
            <Text style={styles.sidebarSectionTitle}>SETTINGS</Text>

            {/* Account */}
            <TouchableOpacity
              style={[
                styles.navItem,
                activeTab === 'account' && styles.activeNavItem,
              ]}
              onPress={() => setActiveTab('account')}
            >
              <View style={styles.navItemLeft}>
                <User
                  color={activeTab === 'account' ? '#C15656' : '#718096'}
                  size={18}
                />
                <Text
                  style={[
                    styles.navText,
                    activeTab === 'account' && styles.activeNavText,
                  ]}
                >
                  Account
                </Text>
              </View>
              {!isDesktop && <ChevronRight color="#CBD5E0" size={18} />}
            </TouchableOpacity>

            {/* Data and privacy tab */}
            <TouchableOpacity
              style={[
                styles.navItem,
                activeTab === 'privacy' && styles.activeNavItem,
              ]}
              onPress={() => setActiveTab('privacy')}
            >
              <View style={styles.navItemLeft}>
                <Lock
                  color={activeTab === 'privacy' ? '#C15656' : '#718096'}
                  size={18}
                />
                <Text
                  style={[
                    styles.navText,
                    activeTab === 'privacy' && styles.activeNavText,
                  ]}
                >
                  Data & Privacy
                </Text>
              </View>
              {!isDesktop && <ChevronRight color="#CBD5E0" size={18} />}
            </TouchableOpacity>

            {/* Billing tab, user can customize their payment bills here */}
            <TouchableOpacity
              style={[
                styles.navItem,
                activeTab === 'billing' && styles.activeNavItem,
              ]}
              onPress={() => setActiveTab('billing')}
            >
              <View style={styles.navItemLeft}>
                <CreditCard
                  color={activeTab === 'billing' ? '#C15656' : '#718096'}
                  size={18}
                />
                <Text
                  style={[
                    styles.navText,
                    activeTab === 'billing' && styles.activeNavText,
                  ]}
                >
                  Billing
                </Text>
              </View>
              {!isDesktop && <ChevronRight color="#CBD5E0" size={18} />}
            </TouchableOpacity>

            <View style={styles.sidebarDivider} />

            {/* Logout button */}
            <TouchableOpacity
              style={[styles.navItem, styles.logoutNavItem]}
              onPress={handleLogoutPress}
              disabled={loggingOut}
            >
              <View style={styles.navItemLeft}>
                <LogOut color="#E53E3E" size={18} />
                <Text style={styles.logoutNavText}>
                  {loggingOut ? 'Logging out...' : 'Log Out'}
                </Text>
              </View>
              {loggingOut && <ActivityIndicator size="small" color="#E53E3E" />}
            </TouchableOpacity>
          </View>

          {/* Right content display */}
          <View style={[styles.contentPanel, isDesktop && styles.desktopContentPanel]}>
            {activeTab === 'account' && (
              <View style={styles.panelInner}>
                <Text style={styles.panelTitle}>Account Settings</Text>

                <View style={styles.placeholderBox}>
                  <Text style={styles.placeholderText}>
                    Email: {auth.currentUser?.email || 'N/A'}
                  </Text>
                  <Text style={[styles.placeholderText, { marginTop: 8 }]}>
                    Account ID: {auth.currentUser?.uid || 'N/A'}
                  </Text>
                </View>
              </View>
            )}

            {activeTab === 'privacy' && (
              <View style={styles.panelInner}>
                <Text style={styles.panelTitle}>Data & Privacy</Text>

                <View style={styles.placeholderBox}>
                  <Text style={styles.placeholderText}>
                    Privacy settings and activity log details will appear here.
                  </Text>
                </View>
              </View>
            )}

            {activeTab === 'billing' && (
              <View style={styles.panelInner}>
                <Text style={styles.panelTitle}>Billing & Subscriptions</Text>

                <View style={styles.placeholderBox}>
                  <Text style={styles.placeholderText}>
                    No saved credit cards or payment methods found.
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  header: {
    backgroundColor: '#C15656',
    width: '100%',
    alignItems: 'center',
    paddingVertical: 14,
    elevation: 3,
  },
  headerInner: {
    width: '100%',
    maxWidth: 1100,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  discorContainer: {
    width: '100%',
    maxWidth: 1100,
    gap: 16,
  },
  desktopContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sidebar: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  desktopSidebar: {
    width: 280,
  },
  sidebarSectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#A0AEC0',
    letterSpacing: 1,
    marginBottom: 12,
    paddingLeft: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  activeNavItem: {
    backgroundColor: '#FFF5F5',
  },
  navItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
    marginLeft: 12,
  },
  activeNavText: {
    color: '#C15656',
    fontWeight: 'bold',
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: '#EDF2F7',
    marginVertical: 12,
  },
  logoutNavItem: {
    backgroundColor: '#FFF5F5',
  },
  logoutNavText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#E53E3E',
    marginLeft: 12,
  },
  contentPanel: {
    flex: 1,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  desktopContentPanel: {
    minHeight: 350,
    padding: 32,
  },
  panelInner: {},
  panelTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 6,
  },
  placeholderBox: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    borderRadius: 12,
    padding: 20,
  },
  placeholderText: {
    fontSize: 14,
    color: '#4A5568',
  },
});