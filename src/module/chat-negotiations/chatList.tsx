import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { Contract, contractRequest } from './contracts';
// ========================================
// FILE: chatList.tsx
// PURPOSE: Displays all conversations for the logged-in user.
//          Fetches user data from Django and listens to Firestore for real-time updates.
//          Referenced in: ChatModal.tsx (when no chat is selected)
// ========================================

// 1. Imports
//    - auth: Firebase auth instance for getting current user token
//    - API_URL: Django backend base URL
//    - Ionicons: Icon library for empty state
//    - Firestore functions: Real-time chat data
import { chatService } from './chats';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../../firebase/config';

// I. Interfaces
//    I.1. ChatListItem = Structure for each conversation in the list
//         - id: Firestore document ID (chatId)
//         - participants: Array of user UIDs in the chat
//         - lastMessage: Latest message text preview
//         - lastMessageTime: Timestamp of the latest message
//         - participantData: Tracks unread counts per user
//         - otherUser: Enriched user data (username, photo, role) from Django
export interface ChatListItem {
  id: string;
  participants: string[];
  proposalUnread?: number;
  buying?: boolean;
  selling?: boolean;
  lastMessage: string;
  lastMessageTime: string;
  participantData: {
    [key: string]: {
      unreadCount: number;
      lastRead: string;
    };
  };
  otherUser?: {
    id: string;
    displayName: string;
    fullName: string;
    photoURL: string;
    role: string;
    user_type: string;
  };
}

// I.2. ChatListProps = Props passed from ChatModal
//      - currentUser: Logged-in user from Firebase Auth
//      - onChatSelect: Callback to open chat window when a conversation is tapped
interface ChatListProps {
  currentUser: any;
  onChatSelect: (chatId: string, otherUser: any) => void;
}

// II. Main Component
export function ChatList({ currentUser, onChatSelect }: ChatListProps) {
  // II.1. State: List of chats to display
  const [artworkFilter, setArtworkFilter] = useState<'all' | 'buying' | 'selling'>('all');
  const [accountRole, setAccountRole] = useState('');
  useEffect(() => {
    let active = true;
    setAccountRole(''); setArtworkFilter('all');
    const loadProfile = async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const response = await fetch(`${API_URL}/auth/me/`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) { const profile = await response.json(); if (active) setAccountRole(profile.role || ''); }
    };
    loadProfile().catch(console.error);
    return () => { active = false; };
  }, [currentUser?.uid]);
  const [activeTab, setActiveTab] = useState<'artists' | 'drivers' | 'support'>('artists');
  const [contractChats, setContractChats] = useState<ChatListItem[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await contractRequest();
        const rows = new Map<string, ChatListItem>();
        result.contracts.forEach((c: Contract) => {
          const buying = c.buyer_uid === currentUser?.uid;
          const otherId = buying ? c.artist_uid : c.buyer_uid;
          const id = [c.buyer_uid, c.artist_uid].sort().join('_');
          if (rows.has(id)) {
            const row = rows.get(id)!;
            row.proposalUnread = (row.proposalUnread || 0) + (c.unread_count || 0);
            row.buying = row.buying || buying;
            row.selling = row.selling || !buying;
          }
          if (!rows.has(id)) rows.set(id, { id, buying, selling: !buying, proposalUnread: c.unread_count || 0, participants: [c.buyer_uid, c.artist_uid], lastMessage: `Contract proposal: ${c.title}`, lastMessageTime: c.created_at, participantData: {}, otherUser: { id: otherId, displayName: buying ? c.artist : c.buyer, fullName: buying ? c.artist : c.buyer, photoURL: '', role: buying ? 'artist' : 'buyer', user_type: buying ? 'artist' : 'buyer' } });
        });
        if (active) setContractChats([...rows.values()]);
      } catch (error) { console.error('Unable to load proposal conversations:', error); }
    };
    setContractChats([]);
    if (currentUser) load();
    const timer = setInterval(() => { if (currentUser) load(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [currentUser?.uid]);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  // II.2. State: Loading indicator while fetching data
  const [loading, setLoading] = useState(true);
  // II.3. State: Cache of user data from Django (UID -> user object)
  //           Used to look up display names for chat participants
  const [userMap, setUserMap] = useState<{[key: string]: any}>({});

  // II.4. Effect: Fetches user data and listens to chat updates
  //        Triggered when currentUser changes (login/logout)
  useEffect(() => {
    // II.4.1. Guard: Exit if no user is logged in
    if (!currentUser) {
      console.log('⚠️ No current user');
      setLoading(false);
      return;
    }

    console.log('👤 Current user:', currentUser.uid);

    // II.4.2. (Nested Func) Fetch ALL users from Django for chat
    //           Purpose: Build a map of UID -> user data (username, photo, role)
    //           Source: Django endpoint '/chat-users/' returns all users
    //           Used by: Mapping participant UIDs to display names
    const fetchChatUsers = async () => {
      try {
        const users = await chatService.fetchUsers(currentUser.uid);
        const map: {[key: string]: any} = {};
        users.forEach((user) => {
          map[user.id] = { ...user, fullName: user.displayName, user_type: user.role };
        });
        setUserMap(map);
        return map;
      } catch (error) {
        console.error('Unable to load chat usernames:', error);
        return {};
      }
    };

    // II.4.3. Fetch users, then listen to chats
    //           Flow: 1. Get user data from Django
    //                 2. Then listen to Firestore for chat updates
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    fetchChatUsers().then((map) => {
      if (cancelled) return;
      console.log('📦 User map ready, listening to chats...');
      
      // II.4.3.1. Firestore query: Find all chats where current user is a participant
      //            Collection: 'chats' in Firestore
      //            Condition: 'participants' array contains currentUser.uid
      const chatsRef = collection(db, 'chats');
      const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid));

      // II.4.3.2. Real-time listener: Updates whenever chats change
      //            Called when: New chat created, message sent, unread count updated
      unsubscribe = onSnapshot(q, (snapshot) => {
        console.log(`📄 Found ${snapshot.docs.length} chats`);
        
        const chatList: ChatListItem[] = [];

        // II.4.3.2.A. Loop through each chat document
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          // II.4.3.2.A.1. Find the other participant (not the current user)
          const otherUserId = data.participants?.find((id: string) => id !== currentUser.uid);
          
          if (otherUserId) {
            // II.4.3.2.A.2. Look up the other user's data from the map
            //              If not found, use a saved username or a neutral label
            const otherUser = map[otherUserId] || {
              id: otherUserId,
              displayName: data.participantData?.[otherUserId]?.username || 'Unknown user',
              fullName: data.participantData?.[otherUserId]?.username || 'Unknown user',
              photoURL: '',
              role: 'user',
              user_type: 'B',
            };
            
            // II.4.3.2.A.3. Build the chat item with all required fields
            const chatItem: ChatListItem = {
              id: doc.id,
              participants: data.participants || [],
              lastMessage: data.lastMessage || '',
              lastMessageTime: data.lastMessageTime || '',
              participantData: data.participantData || {},
              otherUser: otherUser,
            };
            
            chatList.push(chatItem);
          }
        });

        // II.4.3.2.B. Sort chats by lastMessageTime (newest first)
        chatList.sort((a, b) => 
          new Date(b.lastMessageTime || 0).getTime() - new Date(a.lastMessageTime || 0).getTime()
        );

        setChats(chatList);
        setLoading(false);
      }, (error) => {
        console.error('❌ Chat listener error:', error);
        setLoading(false);
      });

      // II.4.3.3. Cleanup: Unsubscribe from Firestore listener when component unmounts
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [currentUser]); // Re-run when currentUser changes

  // II.5. (Func) Get unread count for the current user in a chat
  //        Reads from participantData[userId].unreadCount
  const getUnreadCount = (chat: ChatListItem) => {
    return (chat.participantData?.[currentUser?.uid]?.unreadCount || 0) + (chat.proposalUnread || 0);
  };

  // II.6. (Func) Renders each chat item in the list
  //        Shows: Avatar, display name, last message, unread badge, artist tag
  const renderChatItem = ({ item }: { item: ChatListItem }) => {
    const unreadCount = getUnreadCount(item);
    const displayName = item.otherUser?.displayName || 'Unknown';
    const userType = item.otherUser?.user_type || '';
    const isArtist = userType === 'A';
    
    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => onChatSelect(item.id, item.otherUser)}
      >
        {/* II.6.1. Avatar Container with unread badge */}
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, isArtist ? styles.artistAvatar : styles.buyerAvatar]}>
            <Text style={styles.avatarText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          {/* II.6.1.A. Unread badge - red circle with number */}
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>
        
        {/* II.6.2. Chat info: name, artist tag, last message */}
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName}>{displayName}</Text>
            {/* II.6.2.A. Artist tag - shows only if user_type is 'A' */}
            {isArtist && (
              <View style={styles.artistTag}>
                <Text style={styles.artistTagText}>Artist</Text>
              </View>
            )}
          </View>
          {(item.buying || item.selling) && <Text style={{ fontSize: 11, color: '#A75A2C', marginTop: 3 }}>{item.buying && item.selling ? 'Buying & Selling' : item.buying ? "You're buying" : "You're selling"}</Text>}
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage || 'No messages yet'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const merged = [...chats.map(chat => ({ ...chat, buying: contractChats.find(c => c.id === chat.id)?.buying, selling: contractChats.find(c => c.id === chat.id)?.selling, proposalUnread: contractChats.find(c => c.id === chat.id)?.proposalUnread || 0 })), ...contractChats.filter(c => !chats.some(chat => chat.id === c.id))]
    .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  const category = (chat: ChatListItem) => {
    const role = (userMap[chat.otherUser?.id || '']?.role || chat.otherUser?.role || '').toLowerCase();
    if (role === 'driver') return 'drivers';
    if (role === 'customer_support') return 'support';
    return 'artists';
  };
  const tabs = [
    { key: 'artists', label: 'Artworks' },
    { key: 'drivers', label: 'Drivers' },
    { key: 'support', label: 'Customer Support' },
  ] as const;
  const filters = accountRole === 'artist' ? ['all', 'buying', 'selling'] as const : ['all', 'buying'] as const;
  const visible = merged.filter(chat => category(chat) === activeTab && (activeTab !== 'artists' || artworkFilter === 'all' || !!chat[artworkFilter]));
  return <View style={{ flex: 1 }}>
    <View style={styles.tabs}>
      {tabs.map(tab => <TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab.key }} onPress={() => setActiveTab(tab.key)} style={[styles.tab, activeTab === tab.key && styles.activeTab, activeTab === tab.key && (tab.key === 'drivers' ? styles.driverTab : tab.key === 'support' ? styles.supportTab : null)]}>
        <Text style={[styles.tabLabel, activeTab === tab.key && styles.activeTabLabel]}>{tab.label}</Text>
        {merged.some(chat => category(chat) === tab.key && getUnreadCount(chat) > 0) && <View accessibilityLabel="Unread messages" style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF3B30', position: 'absolute', top: 4, right: 6 }} />}
      </TouchableOpacity>)}
    </View>
    {activeTab === 'artists' && <View style={{ padding: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {filters.map(filter => <TouchableOpacity key={filter} accessibilityRole="button" accessibilityState={{ selected: artworkFilter === filter }} onPress={() => setArtworkFilter(filter)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: artworkFilter === filter ? '#D48C62' : '#F4EEE8' }}>
          <Text style={{ color: artworkFilter === filter ? '#fff' : '#75655F', fontWeight: '600' }}>{filter === 'all' ? 'All' : filter === 'buying' ? 'Buying' : 'Selling'}</Text>
        </TouchableOpacity>)}
      </View>
      <Text style={{ fontSize: 11, color: '#75655F' }}>Buying and Selling follow your role in each proposal. Chats without a proposal appear in All.</Text>
    </View>}
    {loading ? <View style={styles.centered}><ActivityIndicator size="large" color="#C15656" /></View> :
      <FlatList data={visible} keyExtractor={item => item.id} renderItem={renderChatItem} contentContainerStyle={visible.length ? styles.listContent : { flexGrow: 1 }}
        ListEmptyComponent={<View style={styles.centered}><Ionicons name="chatbubble-outline" size={48} color="#C7C7CC" /><Text style={styles.emptyText}>No {activeTab === 'artists' ? 'artwork' : activeTab === 'drivers' ? 'driver' : 'customer support'} conversations yet</Text></View>} />}
  </View>;
}

// III. Styles
const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: 0, paddingHorizontal: 10, gap: 5, borderBottomWidth: 3, borderBottomColor: '#D48C62', backgroundColor: '#FFF' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 34, paddingVertical: 7, paddingHorizontal: 6, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  activeTab: { backgroundColor: '#D48C62', minHeight: 38, borderTopLeftRadius: 10, borderTopRightRadius: 22 },
  driverTab: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  supportTab: { borderTopLeftRadius: 22, borderTopRightRadius: 10 },
  tabLabel: { fontSize: 12, color: '#75655F', fontWeight: '600', textAlign: 'center' },
  activeTabLabel: { color: '#FFFFFF', fontWeight: '800' },
  // III.1. FlatList container padding
  listContent: {
    paddingVertical: 8,
  },
  // III.2. Individual chat item row
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  // III.3. Avatar container (for positioning unread badge)
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  // III.4. Avatar circle
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // III.4.A. Artist avatar color (brown/orange)
  artistAvatar: {
    backgroundColor: '#D48C62',
  },
  // III.4.B. Buyer avatar color (lighter orange)
  buyerAvatar: {
    backgroundColor: '#E8A066',
  },
  // III.5. Avatar text (first letter of display name)
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // III.6. Unread badge - red circle
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  // III.7. Unread badge text
  unreadText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  // III.8. Chat info container
  chatInfo: {
    flex: 1,
  },
  // III.9. Chat header row (name + tag)
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  // III.10. Display name
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  // III.11. Artist tag
  artistTag: {
    backgroundColor: '#D48C62',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  // III.12. Artist tag text
  artistTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  // III.13. Last message preview
  lastMessage: {
    fontSize: 14,
    color: '#8E8E93',
  },
  // III.14. Centered container (loading/empty states)
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // III.15. Empty state title
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginTop: 12,
  },
  // III.16. Empty state subtitle
  emptySubtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
});

export default ChatList;