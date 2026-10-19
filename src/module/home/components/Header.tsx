import { useCart } from '@/context/CartContext';
import { auth } from '@/firebase/config';
import { ChatUser, ChatWindow } from '@/module/chat-negotiations/chats';
import { Contract, contractRequest } from '@/module/chat-negotiations/contracts';
import SigningModal from '@/module/chat-negotiations/SigningModal';
import { CATEGORIES } from '@/module/home/types';
import API_URL from '@/services/api';
import { useRouter } from 'expo-router';
import { Bell, ChevronDown, Folder, Menu, Search, Settings, ShoppingCart, SlidersHorizontal } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';

interface HeaderProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  activeCategory: string;
  onSelectCategory: (category: string) => void;
}

type Notification = { id: number; title: string; message: string; is_read: boolean; created_at: string; agreement_id?: number | null; negotiation_partner?: ChatUser | null };

export default function Header({ activeCategory, onSelectCategory, searchQuery, onSearchChange }: HeaderProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const webDesktop = Platform.OS === 'web' && isDesktop;
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [filesOpen, setFilesOpen] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [selectedContract, setSelectedContract] = useState<number | null>(null);

  const [browseOpen, setBrowseOpen] = useState(false);
  const animValue = useState(() => new Animated.Value(0))[0];

  const handlePointerEnter = () => {
    setBrowseOpen(true);
    Animated.timing(animValue, {
      toValue: 1,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const handlePointerLeave = () => {
    Animated.timing(animValue, {
      toValue: 0,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) {
        setBrowseOpen(false);
      }
    });
  };
  
  const openFiles = async () => {
    setFilesOpen(true); setFilesLoading(true); setFilesError('');
    try { setContracts((await contractRequest()).contracts); }
    catch (error: any) { setFilesError(error.message); }
    finally { setFilesLoading(false); }
  };

  const { cartItems } = useCart();
  const cartCount = cartItems.length;
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationChat, setNotificationChat] = useState<ChatUser | null>(null);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const loadNotifications = async () => {
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken();
    const response = await fetch(`${API_URL}/api/users/notifications/`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return null;

    const data = await response.json();
    setUnreadCount(data.unread_count || 0);
    setNotifications(data.notifications || []);
    return data;

  };

  useEffect(() => {
    loadNotifications().catch(() => undefined);
    const refreshId = setInterval(() => loadNotifications().catch(() => undefined), 10000);
    return () => clearInterval(refreshId);
  }, []);

  const openNotifications = async () => {
    setNotificationOpen(true);
    setNotificationsLoading(true);
    try { 
      await loadNotifications(); 
    } catch { 
      Alert.alert('Notifications', 'Unable to load notifications right now.'); 
    } finally { 
      setNotificationsLoading(false); 
    }
  };

  const markRead = async (notification: Notification) => {
    if (notification.is_read) 
      return;
    setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      const user = auth.currentUser;
      if (!user) 
        return;
      const token = await user.getIdToken();
      await fetch(`${API_URL}/api/users/notifications/`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ notification_id: notification.id }) });
    } catch { loadNotifications().catch(() => undefined); }
  };

  const markAllRead = async () => {
    if (!unreadCount) 
      return;
    setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
    try {
      const user = auth.currentUser;
      if (!user) 
        return;
      const token = await user.getIdToken();
      await fetch(`${API_URL}/api/users/notifications/`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
    } catch { 
      loadNotifications().catch(() => undefined); 
    }
  };

  const visibleNotifications = useMemo(() => notificationFilter === 'all' ? notifications : notifications.filter((item) => !item.is_read), [notificationFilter, notifications]);

  return (
    <View style={[styles.header, isDesktop && styles.desktopHeader, webDesktop && styles.fullWidthHeader]}>
      <View style={[styles.innerContainer, isDesktop && styles.desktopInnerContainer, webDesktop && styles.fullWidthInnerContainer]}>
        <View style={[styles.topRow, webDesktop && styles.desktopRowSpacing]}>
          <View style={styles.searchSectionWrapper}>
          {webDesktop && (
            <View
              style={styles.browseDropdownContainer}
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeave}
            >
              <TouchableOpacity
                style={[styles.browseButton, browseOpen && styles.browseButtonActive]}
                activeOpacity={0.85}
              >
                <SlidersHorizontal size={15} color="#FFFFFF" />
                <Text style={styles.browseButtonText}>Browse art</Text>
                <ChevronDown
                  size={14}
                  color="#FFFFFF"
                  style={{
                    transform: [
                      {
                        rotate: animValue.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '180deg'],
                        }) as any,
                      },
                    ],
                  }}
                />
              </TouchableOpacity>

              {browseOpen && (
                <Animated.View
                  style={[
                    styles.browsePopover,
                    {
                      opacity: animValue,
                      transform: [
                        {
                          translateY: animValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-8, 0],
                          }),
                        },
                      ],
                      pointerEvents: browseOpen ? 'auto' : 'none',
                    } as any,
                  ]}
                >
                  <Text style={styles.popoverSectionLabel}>CATEGORIES</Text>
                  {[
                    "Visual Arts",
                    "Digital and Graphics",
                    "Photography",
                    "Traditional Art",
                    "Contemporary / Modern",
                  ].map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={styles.popoverItem}
                      onPress={() => {
                        onSelectCategory(cat === "Visual Arts" ? "All" : cat);
                        handlePointerLeave();
                      }}
                    >
                      <Text
                        style={[
                          styles.popoverItemText,
                          activeCategory === (cat === "Visual Arts" ? "All" : cat) && styles.popoverItemTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  <View style={styles.popoverDivider} />

                  <Text style={styles.popoverSectionLabel}>FILTERS</Text>
                  {["Artwork Type", "Price", "Artist Style"].map((filterName) => (
                    <TouchableOpacity
                      key={filterName}
                      style={styles.popoverItem}
                      onPress={handlePointerLeave}
                    >
                      <Text style={styles.popoverItemText}>{filterName}</Text>
                    </TouchableOpacity>
                  ))}
                </Animated.View>
              )}
            </View>
          )}

            <View style={[styles.searchBox, webDesktop && styles.desktopSearchBox]}>
              <TextInput
                style={styles.input}
                placeholder="Search Artwork..."
                placeholderTextColor="#888"
                underlineColorAndroid="transparent"
                value={webDesktop && onSearchChange ? (searchQuery ?? '') : localSearchQuery}
                onChangeText={(query) => {
                  setLocalSearchQuery(query);
                  if (webDesktop) onSearchChange?.(query);
                }}
                {...(webDesktop ? { accessibilityLabel: 'Search artwork by title, artist or tag' } : {})}
              />
              <Search size={18} color="#555" />
            </View>
          </View>

          <View style={styles.headerIcons}>
            <TouchableOpacity accessibilityLabel="Your licenses and agreements" onPress={webDesktop ? openFiles : () => Alert.alert('Files', 'Opening Files...')}>
              <Folder color="#fff" size={22} />
            </TouchableOpacity>

            {!webDesktop && 
            <TouchableOpacity onPress={() => router.push('/(home)/cart')} style={styles.notificationButton}>
              <ShoppingCart color="#fff" size={22} style={{ marginHorizontal: 12 }} />
              {cartCount > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text></View>}
            </TouchableOpacity>}

            <TouchableOpacity onPress={openNotifications} style={styles.notificationButton}>
              <Bell color="#fff" size={22} style={{ marginHorizontal: 12 }} />
              {unreadCount > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View>}
            </TouchableOpacity>

            {!webDesktop && 
            <TouchableOpacity onPress={() => router.push('/(home)/settings')}>
              <Settings color="#fff" size={22} />
            </TouchableOpacity>}
          </View>
        </View>

        <View style={[styles.categoryRow, isDesktop && styles.desktopCategoryRow, webDesktop && styles.desktopRowSpacing]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 10 }}>
            {CATEGORIES.map((cat, i) => (
              <TouchableOpacity key={i} onPress={() => onSelectCategory(cat)}>
                <Text
                  style={[
                    styles.catText,
                    isDesktop && styles.desktopCatText,
                    activeCategory === cat && styles.activeCatText,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {!webDesktop && <>
          <View style={styles.verticalDivider} />
          <TouchableOpacity onPress={() => Alert.alert('Filter', 'Opening advanced filters...')}>
            <Menu color="#fff" size={22} />
          </TouchableOpacity></>}
        </View>
      </View>

      <Modal visible={filesOpen} transparent animationType="fade" onRequestClose={() => setFilesOpen(false)}>
        <Pressable style={styles.notificationBackdrop} onPress={() => setFilesOpen(false)}>
          <Pressable style={[styles.notificationPanel, { top: 70, right: 16, width: 440, maxWidth: '92%' }]} onPress={event => event.stopPropagation()}>
            <View style={styles.notificationPanelHeader}>
              <Text style={styles.notificationTitle}>Licenses & agreements</Text>
              <TouchableOpacity onPress={() => setFilesOpen(false)}>
                <Text style={styles.markReadText}>Close</Text>
              </TouchableOpacity>
            </View>
            {filesLoading ? 
            <ActivityIndicator color="#C15656" /> : <ScrollView showsVerticalScrollIndicator={false}>
              {!!filesError && <Text accessibilityRole="alert" style={styles.notificationEmptyText}>{filesError}</Text>}
              {!filesError && !contracts.length && <Text style={styles.notificationEmptyText}>No agreements yet.</Text>}
              {contracts.map(contract => 
              <TouchableOpacity key={contract.id} style={styles.notificationItem} onPress={() => { setFilesOpen(false); setSelectedContract(contract.id); }}>
                <View style={styles.notificationCopy}>
                  <Text style={styles.notificationItemTitle}>{contract.title}</Text>
                  <Text style={styles.notificationItemMessage}>{contract.artist} · {contract.buyer}</Text>
                  <Text style={styles.notificationItemMessage}>{contract.status} · {contract.fully_signed ? 'Signed by both parties' : 'Awaiting signatures'}</Text>
                </View>
              </TouchableOpacity>)}
            </ScrollView>}
          </Pressable>
        </Pressable>
      </Modal>

      {selectedContract !== null && <SigningModal id={selectedContract} onClose={() => setSelectedContract(null)} onSigned={async () => { setContracts((await contractRequest()).contracts); }} />}

      <Modal visible={notificationOpen} transparent animationType="fade" onRequestClose={() => setNotificationOpen(false)}>
        <Pressable style={styles.notificationBackdrop} onPress={() => setNotificationOpen(false)}>
          <Pressable style={[
            styles.notificationPanel,
            isDesktop
              ? [styles.desktopNotificationPanel, { right: Math.max(16, (width - 1200) / 2 + 10) }]
              : styles.mobileNotificationPanel,
          ]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.notificationPanelHeader}>
              <Text style={styles.notificationTitle}>Notifications</Text>
              <TouchableOpacity onPress={markAllRead} disabled={!unreadCount}>
                <Text style={[styles.markReadText, !unreadCount && styles.markReadTextDisabled]}>Mark all read</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.notificationTabs}>
              {(['all', 'unread'] as const).map((tab) => 
              <TouchableOpacity key={tab} onPress={() => setNotificationFilter(tab)} style={[styles.notificationTab, notificationFilter === tab && styles.notificationTabActive]}>
                <Text style={[styles.notificationTabText, notificationFilter === tab && styles.notificationTabTextActive]}>{tab === 'all' ? 'All' : `Unread${unreadCount ? ` (${unreadCount})` : ''}`}</Text>
              </TouchableOpacity>)}
            </View>

            <Text style={styles.notificationSectionLabel}>{notificationFilter === 'all' ? 'Earlier' : 'Unread notifications'}</Text>

            {notificationsLoading ? 
            <View style={styles.notificationLoading}>
              <ActivityIndicator color="#C15656" />
              </View> : <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.notificationList}>
              {visibleNotifications.length ? visibleNotifications.map((item) => 
              <TouchableOpacity key={item.id} onPress={() => { markRead(item); if (item.negotiation_partner) { setNotificationOpen(false); setNotificationChat(item.negotiation_partner); } }} style={[styles.notificationItem, !item.is_read && styles.notificationItemUnread]}>
                <View style={[styles.notificationIcon, item.title.toLowerCase().includes('approved') ? styles.notificationIconApproved : styles.notificationIconRejected]}>
                  <Bell size={18} color="#FFFFFF" />
                </View>
                <View style={styles.notificationCopy}>
                  <Text style={styles.notificationItemTitle}>{item.title}</Text>
                  <Text style={styles.notificationItemMessage}>{item.message}</Text>
                  {item.negotiation_partner && <Text style={{ color: '#A34A40', fontSize: 11, fontWeight: '700', marginTop: 5 }}>Open negotiation chat</Text>}
                </View>
                {!item.is_read && 
                <View style={styles.notificationUnreadDot} />}
              </TouchableOpacity>) : <View style={styles.notificationEmpty}>
                <Bell size={30} color="#D7C7C0" />
                <Text style={styles.notificationEmptyText}>No {notificationFilter === 'unread' ? 'unread ' : ''}notifications yet.</Text>
              </View>}
            </ScrollView>}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={!!notificationChat} animationType="slide" onRequestClose={() => setNotificationChat(null)}>
        {notificationChat && <ChatWindow user={notificationChat} currentUser={auth.currentUser} onClose={() => setNotificationChat(null)} />}
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  header: { backgroundColor: '#C15656', width: '100%', alignItems: 'center', paddingVertical: 12, zIndex: 1000 },
  desktopHeader: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E9DDD6', paddingTop: 0, zIndex: 1000 },
  innerContainer: { width: '100%', maxWidth: 1200, paddingHorizontal: 15, zIndex: 1000 },
  desktopInnerContainer: { maxWidth: 1160, paddingHorizontal: 24, alignSelf: 'center' },
  fullWidthHeader: { paddingVertical: 0 },
  fullWidthInnerContainer: { maxWidth: '100%', paddingHorizontal: 0 },
  desktopNav: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#C15656', fontSize: 18, fontWeight: '800' },
  desktopLinks: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  desktopLink: { color: '#8A7C76', fontSize: 13, fontWeight: '600' },
  activeLink: { color: '#C15656', fontSize: 13, fontWeight: '800' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#463532', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#C15656',
    marginHorizontal: -15,
    paddingHorizontal: 15,
    paddingVertical: 8,
    zIndex: 1001,
  },
  searchBox: { flex: 1, backgroundColor: '#fff', borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 38, borderWidth: 0 },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    paddingVertical: 0,
    borderWidth: 0,
    ...Platform.select({
      web: {
        outlineWidth: 0,
      },
    }),
  },
  notificationButton: { position: 'relative' },
  notificationBadge: { position: 'absolute', top: -5, right: 5, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1, borderColor: '#FFFFFF' },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  notificationBackdrop: { flex: 1, backgroundColor: 'rgba(43, 35, 32, 0.16)' },
  notificationPanel: { position: 'absolute', maxHeight: '78%', backgroundColor: '#FFFDF5', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E4D6CD', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 10 },
  mobileNotificationPanel: { top: 68, right: 12, left: 12 }, desktopNotificationPanel: { top: 108, width: 390 }, notificationPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, notificationTitle: { color: '#2B2320', fontSize: 21, fontWeight: '800' }, markReadText: { color: '#C15656', fontSize: 12, fontWeight: '800' }, markReadTextDisabled: { color: '#CBBAB3' }, notificationTabs: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 14 }, notificationTab: { backgroundColor: '#F0E4DB', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 }, notificationTabActive: { backgroundColor: '#C15656' }, notificationTabText: { color: '#8A6258', fontSize: 12, fontWeight: '800' }, notificationTabTextActive: { color: '#FFFFFF' }, notificationSectionLabel: { color: '#6E5650', fontWeight: '800', fontSize: 13, marginBottom: 8 }, notificationLoading: { height: 180, justifyContent: 'center', alignItems: 'center' }, notificationList: { paddingBottom: 2 }, notificationItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 5 }, notificationItemUnread: { backgroundColor: '#FFF3ED' }, notificationIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, notificationIconApproved: { backgroundColor: '#5D8A63' }, notificationIconRejected: { backgroundColor: '#C15656' }, notificationCopy: { flex: 1 }, notificationItemTitle: { color: '#3A2D2A', fontSize: 12, fontWeight: '800' }, notificationItemMessage: { color: '#6F625D', fontSize: 11, lineHeight: 15, marginTop: 2 }, notificationUnreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#C15656', marginLeft: 7 }, notificationEmpty: { minHeight: 160, justifyContent: 'center', alignItems: 'center' }, notificationEmptyText: { color: '#7C6A64', fontSize: 12, marginTop: 9 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  desktopCategoryRow: {
    marginTop: 0,
    paddingVertical: 8,
    backgroundColor: '#F8EEE9',
    marginHorizontal: -15,
    paddingHorizontal: 15,
  },
  desktopRowSpacing: { marginHorizontal: 0, paddingHorizontal: 16 },
  catText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginRight: 20, fontWeight: '500', paddingBottom: 4 },
  desktopCatText: { color: '#A45B52', backgroundColor: '#EADBD4', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 4, marginRight: 8, fontSize: 12 },
  activeCatText: { color: '#fff', fontWeight: 'bold', borderBottomWidth: 2, borderBottomColor: '#fff' },
  verticalDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.4)', marginRight: 12 },
  searchSectionWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2000,
  },
  browseDropdownContainer: {
    position: 'relative',
    marginLeft: 0,
    zIndex: 3000,
    paddingBottom: 8,
    marginBottom: -8,
  },
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    paddingLeft: 0, // Keeps icon and text flush to the container start
    paddingRight: 10,
    height: 44,
    borderWidth: 0,
    cursor: Platform.OS === 'web' ? ('pointer' as any) : undefined,
  },
  headerIcons: {
    flexDirection: 'row',
    marginLeft: 16,
    marginRight: 0, // Sits flush with the carousel's right edge
    alignItems: 'center',
  },
  browseButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  browseButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  browsePopover: {
    position: 'absolute',
    top: 40,
    left: 0,
    width: 250,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#EFE3DC',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9999,
    zIndex: 9999,
    ...Platform.select({
      web: {
        boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.18)',
      },
    }),
  },
  popoverSectionLabel: {
    color: '#A08E88',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  popoverItem: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    cursor: Platform.OS === 'web' ? ('pointer' as any) : undefined,
  },
  popoverItemText: {
    color: '#3A2E2B',
    fontSize: 13,
    fontWeight: '500',
  },
  popoverItemTextActive: {
    color: '#C15656',
    fontWeight: '700',
  },
  popoverDivider: {
    height: 1,
    backgroundColor: '#F3EAE4',
    marginVertical: 8,
    marginHorizontal: 4,
  },
  desktopSearchBox: {
    flexGrow: 0,
    flexShrink: 0,
    width: 320,
    minWidth: 400,
    height: 42,
    borderRadius: 21,
    marginRight: 16,
  },
});

