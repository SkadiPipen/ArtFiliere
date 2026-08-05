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
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
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
        // II.4.2.1. Get Firebase user and token for authentication
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          console.log('⚠️ No Firebase user found');
          return {};
        }
        
        const token = await firebaseUser.getIdToken();
        console.log('🔍 Fetching chat users with token...');
        
        // II.4.2.2. API call to Django to get all users
        const response = await fetch(`${API_URL}/chat-users/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        // II.4.2.3. If successful, build the user map
        if (response.ok) {
          const users = await response.json();
          console.log(`✅ Loaded ${users.length} users for chat`);
          
          // II.4.2.3.A. Map: firebase_uid -> user data
          const map: {[key: string]: any} = {};
          users.forEach((user: any) => {
            console.log(`📝 ${user.firebase_uid} -> ${user.username} (${user.user_type})`);
            map[user.firebase_uid] = {
              id: user.firebase_uid,
              displayName: user.username || 'User',
              fullName: user.full_name || `${user.first_name} ${user.last_name}`,
              photoURL: user.photoURL || '',
              role: user.role || 'user',
              user_type: user.user_type || 'B',
            };
          });
          setUserMap(map);
          return map;
        } else {
          console.log('❌ Failed to fetch chat users:', response.status);
          return {};
        }
      } catch (error) {
        console.log('❌ Error fetching chat users:', error);
        return {};
      }
    };

    // II.4.3. Fetch users, then listen to chats
    //           Flow: 1. Get user data from Django
    //                 2. Then listen to Firestore for chat updates
    fetchChatUsers().then((map) => {
      console.log('📦 User map ready, listening to chats...');
      
      // II.4.3.1. Firestore query: Find all chats where current user is a participant
      //            Collection: 'chats' in Firestore
      //            Condition: 'participants' array contains currentUser.uid
      const chatsRef = collection(db, 'chats');
      const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid));

      // II.4.3.2. Real-time listener: Updates whenever chats change
      //            Called when: New chat created, message sent, unread count updated
      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log(`📄 Found ${snapshot.docs.length} chats`);
        
        const chatList: ChatListItem[] = [];

        // II.4.3.2.A. Loop through each chat document
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          // II.4.3.2.A.1. Find the other participant (not the current user)
          const otherUserId = data.participants?.find((id: string) => id !== currentUser.uid);
          
          if (otherUserId) {
            // II.4.3.2.A.2. Look up the other user's data from the map
            //              If not found, use fallback data (UID as display name)
            const otherUser = map[otherUserId] || {
              id: otherUserId,
              displayName: otherUserId.substring(0, 8),
              fullName: otherUserId.substring(0, 8),
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
      return () => unsubscribe();
    });
  }, [currentUser]); // Re-run when currentUser changes

  // II.5. (Func) Get unread count for the current user in a chat
  //        Reads from participantData[userId].unreadCount
  const getUnreadCount = (chat: ChatListItem) => {
    return chat.participantData?.[currentUser?.uid]?.unreadCount || 0;
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
              <Text style={styles.unreadText}>{unreadCount}</Text>
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
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage || 'No messages yet'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // II.7. Render: Show loading spinner while fetching data
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E8A066" />
      </View>
    );
  }

  // II.8. Render: Show empty state if no conversations exist
  if (chats.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="chatbubble-outline" size={60} color="#C7C7CC" />
        <Text style={styles.emptyText}>No conversations yet</Text>
        <Text style={styles.emptySubtext}>Start a chat with someone!</Text>
      </View>
    );
  }

  // II.9. Render: FlatList of all chats
  return (
    <FlatList
      data={chats}
      keyExtractor={(item) => item.id}
      renderItem={renderChatItem}
      contentContainerStyle={styles.listContent}
    />
  );
}

// III. Styles
const styles = StyleSheet.create({
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