// ========================================
// FILE: chats.tsx
// PURPOSE: Core chat functionality - handles Firebase operations and individual chat window.
//          Contains: chatService (Firebase CRUD) and ChatWindow (UI component).
//          Referenced in: ChatModal.tsx, ArtistList.tsx, chat-index.ts
// ========================================

// I. Imports
//    - Firestore functions: Create, read, update chat data
//    - React Native components: UI for chat window
//    - Ionicons: Icon library for send button and close
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { db } from '../../firebase/config';

// ========================================
// II. INTERFACES
// ========================================

// II.1. ChatUser - Structure for a chat participant
//       Used by: ChatWindow props, chatService.fetchUsers
export interface ChatUser {
  id: string;          // Firebase UID of the user
  email: string;
  displayName: string;
  photoURL: string;
  role: string;        // 'buyer' or 'artist'
}

// II.2. ChatMessage - Structure for a single message
//       Stored in Firestore: chats/{chatId}/messages/{messageId}
export interface ChatMessage {
  id: string;          // Firestore document ID
  text: string;        // Message content
  senderId: string;    // UID of who sent it
  senderName: string;  // Display name of sender
  timestamp: string;   // ISO string
  read: boolean;       // Whether recipient has read it
}

// ========================================
// III. CHAT SERVICE - Firebase Operations
// ========================================

export const chatService = {
  // III.1. fetchUsers: Gets all users from Firestore (DEPRECATED for chat)
  //        Currently not used - we now fetch from Django via chat-users endpoint
  //        Kept for potential future use
  async fetchUsers(currentUserId: string): Promise<ChatUser[]> {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef);
      const querySnapshot = await getDocs(q);

      const userList: ChatUser[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const userId = doc.id;
        
        if (userId === currentUserId) return;
        
        userList.push({
          id: userId,
          email: data.email || '',
          displayName: data.displayName || data.email?.split('@')[0] || 'User',
          photoURL: data.photoURL || '',
          role: data.role || 'buyer',
        });
      });

      return userList;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  // III.2. createChatIfNotExists: Creates a chat document in Firestore
  //        - Chat ID format: {uid1}_{uid2} (sorted alphabetically)
  //        - Both users share the same chat ID for consistent messaging
  //        - Called from: ArtistList.tsx when "Message" is clicked
  //        - Also called from: sendMessage() if chat doesn't exist
  async createChatIfNotExists(chatId: string, participant1: string, participant2: string) {
    try {
      // III.2.1. Ensure consistent format: sorted UIDs joined with '_'
      const sortedParticipants = [participant1, participant2].sort();
      const correctChatId = sortedParticipants.join('_');
      
      // III.2.2. Use correct format
      const finalChatId = chatId.includes('_') ? chatId : correctChatId;
      
      console.log('🔍 Creating chat with ID:', finalChatId);
      console.log('🔍 Participants:', sortedParticipants);
      
      const chatDocRef = doc(db, 'chats', finalChatId);
      const chatDoc = await getDoc(chatDocRef);
      
      // III.2.3. Only create if it doesn't exist
      if (!chatDoc.exists()) {
        const chatData = {
          participants: sortedParticipants,
          createdAt: new Date().toISOString(),
          lastMessage: '',
          lastMessageTime: new Date().toISOString(),
          // III.2.3.A. participantData tracks unread counts per user
          participantData: {
            [participant1]: {
              unreadCount: 0,
              lastRead: new Date().toISOString()
            },
            [participant2]: {
              unreadCount: 0,
              lastRead: new Date().toISOString()
            }
          }
        };
        await setDoc(chatDocRef, chatData);
        console.log('✅ Chat created successfully!');
        return true;
      } else {
        console.log('📝 Chat already exists');
        return false;
      }
    } catch (error) {
      console.error('❌ Error creating chat:', error);
      throw error;
    }
  },

  // III.3. getChatMessages: Sets up real-time listener for messages
  //        - Listens to: chats/{chatId}/messages subcollection
  //        - Orders by: timestamp (ascending)
  //        - Real-time: Updates when new messages are sent
  //        - Called from: ChatWindow useEffect
  getChatMessages(
    chatId: string,
    setMessages: (messages: ChatMessage[]) => void,
    setLoading: (loading: boolean) => void
  ) {
    try {
      const finalChatId = chatId.includes('_') ? chatId : chatId;
      console.log('📡 Listening to messages for chat:', finalChatId);
      
      const chatRef = collection(db, 'chats', finalChatId, 'messages');
      const q = query(chatRef, orderBy('timestamp', 'asc'));

      // III.3.1. Firestore real-time listener
      const unsubscribe = onSnapshot(q, 
        (snapshot) => {
          const msgs: ChatMessage[] = [];
          snapshot.forEach((doc) => {
            msgs.push({
              id: doc.id,
              ...doc.data(),
            } as ChatMessage);
          });
          console.log('📥 Messages loaded:', msgs.length);
          setMessages(msgs);
          setLoading(false);
        },
        (error) => {
          // III.3.1.A. Permission-denied means chat doesn't exist yet
          if (error.code === 'permission-denied') {
            console.log('📭 Chat does not exist yet');
            setMessages([]);
            setLoading(false);
          } else {
            console.error('Error listening to messages:', error);
            setLoading(false);
          }
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up message listener:', error);
      setLoading(false);
      return () => {};
    }
  },

  // III.4. markMessagesAsRead: Resets unread count for a user
  //        - Called from: ChatWindow when chat is opened
  //        - Updates: participantData.{userId}.unreadCount = 0
  async markMessagesAsRead(chatId: string, userId: string) {
    try {
      const finalChatId = chatId.includes('_') ? chatId : chatId;
      const chatDocRef = doc(db, 'chats', finalChatId);
      const chatDoc = await getDoc(chatDocRef);
      if (!chatDoc.exists()) return;
      
      const data = chatDoc.data();
      if (!data.participants || !data.participants.includes(userId)) return;
      
      await updateDoc(chatDocRef, {
        [`participantData.${userId}.unreadCount`]: 0,
        [`participantData.${userId}.lastRead`]: new Date().toISOString(),
      });
      console.log('✅ Messages marked as read');
    } catch (error: any) {
      console.log('Could not mark messages as read:', error.message);
    }
  },

  // III.5. sendMessage: Sends a message and updates chat metadata
  //        - Creates: Message document in messages subcollection
  //        - Updates: lastMessage, lastMessageTime, unreadCount
  //        - Called from: ChatWindow sendMessage()
  async sendMessage(
    chatId: string,
    senderId: string,
    senderName: string,
    text: string,
    recipientId: string,
    messages: ChatMessage[]
  ) {
    // III.5.1. Ensure consistent chat ID format
    const sortedParticipants = [senderId, recipientId].sort();
    const correctChatId = sortedParticipants.join('_');
    const finalChatId = chatId.includes('_') ? chatId : correctChatId;
    
    console.log('📤 Sending to chat:', finalChatId);
    
    const chatRef = collection(db, 'chats', finalChatId, 'messages');
    const chatDocRef = doc(db, 'chats', finalChatId);

    try {
      // III.5.2. Ensure chat exists before sending
      const chatDoc = await getDoc(chatDocRef);
      if (!chatDoc.exists()) {
        await this.createChatIfNotExists(finalChatId, senderId, recipientId);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // III.5.3. Create message document
      const messageData = {
        senderId: senderId,
        senderName: senderName,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        read: false,
      };

      const messageRef = doc(chatRef);
      await setDoc(messageRef, messageData);

      // III.5.4. Update chat metadata (last message, timestamps, unread counts)
      const updateData: any = {
        lastMessage: text.trim(),
        lastMessageTime: new Date().toISOString(),
        // III.5.4.A. Sender's unread count = 0 (they read their own messages)
        [`participantData.${senderId}.unreadCount`]: 0,
        [`participantData.${senderId}.lastRead`]: new Date().toISOString(),
      };

      // III.5.4.B. Recipient's unread count = total unread + 1
      const unreadMessages = messages.filter(m => !m.read && m.senderId !== senderId).length + 1;
      updateData[`participantData.${recipientId}.unreadCount`] = unreadMessages;
      
      await updateDoc(chatDocRef, updateData);
      console.log('✅ Message sent successfully!');
      return true;
    } catch (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }
  }
};

// ========================================
// IV. CHAT WINDOW COMPONENT
// ========================================

// IV.1. Props: user (the person you're chatting with), currentUser (logged-in user)
interface ChatWindowProps {
  user: ChatUser | null;
  currentUser: any;
  onClose: () => void;
}

// IV.2. Main Component
export function ChatWindow({ user, currentUser, onClose }: ChatWindowProps) {
  // IV.2.1. State: List of messages in this chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // IV.2.2. State: Current input text
  const [messageText, setMessageText] = useState('');
  // IV.2.3. State: Loading indicator
  const [loading, setLoading] = useState(true);

  // IV.2.4. Effect: Set up message listener when chat opens
  //           Triggered when: user or currentUser changes
  useEffect(() => {
    if (!user || !currentUser) {
      setLoading(false);
      return;
    }

    // IV.2.4.1. Generate consistent chat ID
    const sortedParticipants = [currentUser.uid, user.id].sort();
    const chatId = sortedParticipants.join('_');
    
    console.log('📱 Opening chat:', chatId);
    console.log('📱 With user:', user.displayName);
    
    // IV.2.4.2. Listen for messages and mark as read
    const unsubscribe = chatService.getChatMessages(chatId, setMessages, setLoading);
    chatService.markMessagesAsRead(chatId, currentUser.uid);

    // IV.2.4.3. Cleanup: Unsubscribe when chat closes
    return () => unsubscribe();
  }, [user, currentUser]);

  // IV.2.5. sendMessage: Handles sending a new message
  const sendMessage = async (text: string) => {
    if (!text.trim() || !user || !currentUser) return;

    const sortedParticipants = [currentUser.uid, user.id].sort();
    const chatId = sortedParticipants.join('_');
    
    console.log('📤 Sending message to:', chatId);
    
    try {
      await chatService.sendMessage(
        chatId,
        currentUser.uid,
        currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        text,
        user.id,
        messages
      );
      setMessageText('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  // IV.2.6. handleSendMessage: Wrapper for send button
  const handleSendMessage = () => {
    sendMessage(messageText);
  };

  // IV.2.7. renderMessage: Renders each message bubble
  //          - Sent messages: Orange bubble on the right
  //          - Received messages: Grey bubble on the left
  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isSent = item.senderId === currentUser?.uid;
    
    return (
      <View
        style={[
          styles.messageBubble,
          isSent ? styles.messageBubbleSent : styles.messageBubbleReceived,
        ]}
      >
        <Text
          style={[
            styles.messageText,
            isSent ? styles.messageTextSent : styles.messageTextReceived,
          ]}
        >
          {item.text}
        </Text>
        <Text style={styles.messageTime}>
          {item.timestamp
            ? new Date(item.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </Text>
      </View>
    );
  };

  // IV.2.8. Guard: Show if no user selected
  if (!user) {
    return (
      <View style={styles.chatLoadingContainer}>
        <Text>No user selected</Text>
      </View>
    );
  }

  // IV.2.9. Render
  return (
    <View style={styles.chatWindowContainer}>
      {/* IV.2.9.1. Header - User info and close button */}
      <View style={styles.chatHeader}>
        <View style={styles.chatUserInfo}>
          <View style={styles.chatAvatar}>
            {user.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.chatAvatarImage} />
            ) : (
              <Text style={styles.chatAvatarText}>{user.displayName.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <View>
            <Text style={styles.chatUserName}>{user.displayName}</Text>
            <Text style={styles.chatUserRole}>{user.role || 'User'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.chatCloseButton}>
          <Ionicons name="close" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {/* IV.2.9.2. Messages List */}
      {loading ? (
        <View style={styles.chatLoadingContainer}>
          <ActivityIndicator size="large" color="#E8A066" />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          inverted={false}
          // IV.2.9.2.A. Empty state when no messages
          ListEmptyComponent={
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#8E8E93' }}>No messages yet</Text>
              <Text style={{ color: '#8E8E93', fontSize: 12 }}>Say hello to {user.displayName}!</Text>
            </View>
          }
        />
      )}

      {/* IV.2.9.3. Message Input */}
      <View style={styles.messageInputContainer}>
        <TextInput
          style={styles.messageInput}
          placeholder="Type a message..."
          value={messageText}
          onChangeText={setMessageText}
          multiline
          placeholderTextColor="#8E8E93"
        />
        <TouchableOpacity
          style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={!messageText.trim()}
        >
          <Ionicons
            name="send"
            size={20}
            color={messageText.trim() ? '#E8A066' : '#C7C7CC'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ========================================
// V. STYLES
// ========================================

const styles = StyleSheet.create({
  // V.1. Main container
  chatWindowContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  // V.2. Header bar
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F8F8FC',
  },
  // V.3. User info container
  chatUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // V.4. Avatar circle
  chatAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8A066',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  chatAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  chatUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  chatUserRole: {
    fontSize: 12,
    color: '#8E8E93',
    textTransform: 'capitalize',
  },
  // V.5. Close button
  chatCloseButton: {
    padding: 4,
  },
  // V.6. Loading container
  chatLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // V.7. Messages list container
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  // V.8. Individual message bubble
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 16,
    marginBottom: 8,
  },
  // V.8.A. Sent message (orange, right aligned)
  messageBubbleSent: {
    backgroundColor: '#E8A066',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  // V.8.B. Received message (grey, left aligned)
  messageBubbleReceived: {
    backgroundColor: '#F2F2F7',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  // V.9. Message text
  messageText: {
    fontSize: 14,
    lineHeight: 18,
  },
  messageTextSent: {
    color: '#FFFFFF',
  },
  messageTextReceived: {
    color: '#000',
  },
  // V.10. Message timestamp
  messageTime: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  // V.11. Input container
  messageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  // V.12. Text input
  messageInput: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 80,
    color: '#000',
  },
  // V.13. Send button
  sendButton: {
    marginLeft: 8,
    padding: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

export default ChatWindow;