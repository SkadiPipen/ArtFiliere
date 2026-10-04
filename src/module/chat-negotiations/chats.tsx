import ContractPanel from './ContractPanel';
import ProposalCard from './ProposalCard';
import { Contract, contractRequest } from './contracts';
// ========================================
// FILE: chats.tsx
// PURPOSE: Core chat functionality - handles Firebase operations and individual chat window.
//          Contains: chatService (Firebase CRUD) and ChatWindow (UI component).
//          Referenced in: ChatModal.tsx, ArtistList.tsx, chat-index.ts
// ========================================

import NegotiationForm from './negotiationForm';
import type { Artwork } from './types';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, onSnapshot, orderBy, query, setDoc, updateDoc, increment, writeBatch, runTransaction } from 'firebase/firestore';
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
import { auth, db } from '../../firebase/config';
import API_URL from '@/services/api';
import { purchaseRequest } from '@/services/purchases';

// ========================================
// II. INTERFACES
// ========================================

export interface ChatUser {
  id: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: string;
}

export interface ChatMessage {
  contract?: Contract;
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: string;
  read: boolean;
  type?: string;
  negotiationId?: string;
  artworkId?: string;
  artworkTitle?: string;
  artworkImageUri?: string;
  negotiationData?: any;
}

// ========================================
// III. CHAT SERVICE - Firebase Operations
// ========================================

export const chatService = {
  async fetchUsers(currentUserId: string): Promise<ChatUser[]> {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Please log in again.');
    const response = await fetch(`${API_URL}/auth/chat-users/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Unable to load chat usernames.');
    const users: { firebase_uid: string; username: string; role: string }[] = await response.json();
    return users.filter(user => user.firebase_uid !== currentUserId).map(user => ({
      id: user.firebase_uid,
      displayName: user.username,
      role: user.role,
      email: '',
      photoURL: '',
    }));
  },

  async createChatIfNotExists(chatId: string, participant1: string, participant2: string) {
    try {
      const sortedParticipants = [participant1, participant2].sort();
      const correctChatId = sortedParticipants.join('_');
      const finalChatId = chatId.includes('_') ? chatId : correctChatId;
      
      console.log('🔍 Creating chat with ID:', finalChatId);
      console.log('🔍 Participants:', sortedParticipants);
      
      const chatDocRef = doc(db, 'chats', finalChatId);
      const chatDoc = await getDoc(chatDocRef);
      
      if (!chatDoc.exists()) {
        const chatData = {
          participants: sortedParticipants,
          createdAt: new Date().toISOString(),
          lastMessage: '',
          lastMessageTime: new Date().toISOString(),
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

      const unsubscribe = onSnapshot(q, 
        (snapshot) => {
          const msgs: ChatMessage[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            msgs.push({
              id: doc.id,
              text: data.text || '',
              senderId: data.senderId || '',
              senderName: data.senderName || '',
              timestamp: data.timestamp || '',
              read: data.read || false,
              type: data.type || 'text',
              negotiationId: data.negotiationId,
              artworkId: data.artworkId,
              artworkTitle: data.artworkTitle,
              artworkImageUri: data.artworkImageUri,
              negotiationData: data.negotiationData,
            } as ChatMessage);
          });
          console.log('📥 Messages loaded:', msgs.length);
          setMessages(msgs);
          setLoading(false);
        },
        (error) => {
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

  async markMessagesAsRead(chatId: string, userId: string, observedTime: string) {
    try {
      const finalChatId = chatId.includes('_') ? chatId : chatId;
      const chatDocRef = doc(db, 'chats', finalChatId);
      await runTransaction(db, async transaction => {
        const chatDoc = await transaction.get(chatDocRef);
        if (!chatDoc.exists()) return;
        const data = chatDoc.data();
        if (!data.participants?.includes(userId) || data.lastMessageTime > observedTime) return;
        transaction.update(chatDocRef, {
          [`participantData.${userId}.unreadCount`]: 0,
          [`participantData.${userId}.lastRead`]: observedTime,
        });
      });
      console.log('✅ Messages marked as read');
    } catch (error: any) {
      console.log('Could not mark messages as read:', error.message);
    }
  },

  async sendMessage(
    chatId: string,
    senderId: string,
    senderName: string,
    text: string,
    recipientId: string,
    messages: ChatMessage[],
    type: string = 'text',
    negotiationData: any = null
  ) {
    const access = await purchaseRequest('account/restrictions/');
    if (access.restricted) throw new Error('Use the commission workspace for approved existing work. General messages are unavailable while your account is restricted.');
    const sortedParticipants = [senderId, recipientId].sort();
    const correctChatId = sortedParticipants.join('_');
    const finalChatId = chatId.includes('_') ? chatId : correctChatId;
    
    console.log('📤 Sending to chat:', finalChatId);
    
    const chatRef = collection(db, 'chats', finalChatId, 'messages');
    const chatDocRef = doc(db, 'chats', finalChatId);

    try {
      const chatDoc = await getDoc(chatDocRef);
      if (!chatDoc.exists()) {
        await this.createChatIfNotExists(finalChatId, senderId, recipientId);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      let messageData: any = {
        senderId: senderId,
        senderName: senderName,
        timestamp: new Date().toISOString(),
        read: false,
        type: type,
      };

      if (type === 'text') {
        messageData.text = text.trim();
      } else if (type === 'negotiation' && negotiationData) {
        messageData.text = `📝 License negotiation for "${negotiationData.artworkTitle || 'Artwork'}"`;
        messageData.negotiationId = negotiationData.negotiationId;
        messageData.artworkId = negotiationData.artworkId;
        messageData.artworkTitle = negotiationData.artworkTitle;
        messageData.artworkImageUri = negotiationData.artworkImageUri;
        messageData.negotiationData = negotiationData;
      }

      const messageRef = doc(chatRef);
      const batch = writeBatch(db);
      batch.set(messageRef, messageData);

      const updateData: any = {
        lastMessage: type === 'text' ? text.trim() : `📝 Negotiation: ${negotiationData?.artworkTitle || 'Artwork'}`,
        lastMessageTime: messageData.timestamp,
      };

      if (type !== 'system') {
        updateData[`participantData.${recipientId}.unreadCount`] = increment(1);
      }

      batch.update(chatDocRef, updateData);
      await batch.commit();

      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }
};

// ========================================
// IV. CHAT WINDOW COMPONENT
// ========================================

interface ChatWindowProps {
  user: ChatUser | null;
  currentUser: any;
  onClose: () => void;
  initialNegotiationArtwork?: Artwork | null;
  isArtist?: boolean;
}

export function ChatWindow({ 
  user, 
  currentUser, 
  onClose,
  initialNegotiationArtwork,
  isArtist = false,
}: ChatWindowProps) {
  const [revision, setRevision] = useState<Contract | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const refreshContracts = async () => {
    try {
      const data = await contractRequest();
      setContracts(data.contracts.filter((c: Contract) =>
        (c.buyer_uid === currentUser?.uid && c.artist_uid === user?.id) ||
        (c.artist_uid === currentUser?.uid && c.buyer_uid === user?.id)));
    } catch (error) { console.error('Unable to load chat proposals:', error); }
  };
  useEffect(() => {
    setContracts([]);
    refreshContracts();
    const timer = setInterval(refreshContracts, 5000);
    return () => clearInterval(timer);
  }, [user?.id, currentUser?.uid]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [negotiationArtwork, setNegotiationArtwork] = useState<Artwork | null>(null);
  const [showNewNegotiationForm, setShowNewNegotiationForm] = useState(false);

  // Check for negotiation artwork
  useEffect(() => {
    if (initialNegotiationArtwork && !isArtist) {
      console.log('✅ Setting negotiation artwork:', initialNegotiationArtwork.title);
      setNegotiationArtwork(initialNegotiationArtwork);
      setShowNewNegotiationForm(true);
    }
  }, [initialNegotiationArtwork, isArtist]);

  // Set up message listener
  useEffect(() => {
    if (!user || !currentUser) {
      setLoading(false);
      return;
    }

    const sortedParticipants = [currentUser.uid, user.id].sort();
    const chatId = sortedParticipants.join('_');
    
    console.log('📱 Opening chat:', chatId);
    console.log('📱 With user:', user.displayName);
    
    const unsubscribe = chatService.getChatMessages(chatId, setMessages, setLoading);


    return () => unsubscribe();
  }, [user, currentUser]);

  useEffect(() => {
    if (loading || !messages.length || !user?.id || !currentUser?.uid || showNewNegotiationForm || revision) return;
    const chatId = [currentUser.uid, user.id].sort().join('_');
    chatService.markMessagesAsRead(chatId, currentUser.uid, messages[messages.length - 1].timestamp);
  }, [messages, loading, user?.id, currentUser?.uid, showNewNegotiationForm, revision]);

  useEffect(() => {
    if (showNewNegotiationForm || revision) return;
    const ids = contracts.filter(c => c.unread_count).map(c => c.id);
    if (ids.length) contractRequest('read/', 'POST', { ids }).catch(console.error);
  }, [contracts, showNewNegotiationForm, revision]);

  // Send regular message
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
        messages,
        'text'
      );
      setMessageText('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  // Send negotiation proposal - FIXED with better error handling
  const sendNegotiationMessage = async (proposal: any) => {
    if (!user || !currentUser) {
      Alert.alert('Error', 'User or current user not found');
      return;
    }

    const chatId = [currentUser.uid, user.id].sort().join('_');
    
    console.log('📤 Sending negotiation proposal:', proposal);
    console.log('📤 Chat ID:', chatId);
    
    try {
      // First, ensure the chat exists
      await chatService.createChatIfNotExists(chatId, currentUser.uid, user.id);
      
      // Send the negotiation message
      await chatService.sendMessage(
        chatId,
        currentUser.uid,
        currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        '',
        user.id,
        messages,
        'negotiation',
        {
          negotiationId: proposal.id,
          artworkId: proposal.artworkId,
          artworkTitle: proposal.artworkTitle,
          artworkImageUri: proposal.artworkImageUri,
          proposal: proposal,
        }
      );
      
      setShowNewNegotiationForm(false);
      setNegotiationArtwork(null);
      Alert.alert('Success', `Negotiation proposal sent successfully!\nFinal Price: ₱${proposal.finalPrice.toFixed(2)}`);
    } catch (error) {
      console.error('Error sending negotiation:', error);
      Alert.alert('Error', 'Failed to send negotiation proposal: ' + (error as any).message);
    }
  };

  const handleSendMessage = () => {
    sendMessage(messageText);
  };

  // ========================================
  // RENDER MESSAGE - WITH RICH NEGOTIATION CARDS
  // ========================================
  const renderMessage = ({ item }: { item: ChatMessage }) => {
    if (item.contract) return <ProposalCard contract={item.contract} onChange={refreshContracts} onRevise={setRevision} />;
    const isSent = item.senderId === currentUser?.uid;
    
    // Check if it's a negotiation message
    if (item.type === 'negotiation') {
      const negotiationData = item.negotiationData?.proposal || item.negotiationData || {};
      const finalPrice = negotiationData.finalPrice || item.negotiationData?.finalPrice || 0;
      const artworkTitle = item.artworkTitle || negotiationData.artworkTitle || 'Artwork';
      const status = negotiationData.status || 'pending';
      const note = negotiationData.note || '';
      
      // Determine status color and icon
      const getStatusInfo = () => {
        switch(status) {
          case 'accepted':
          case 'ACCEPTED':
            return { 
              color: '#4CAF50', 
              bgColor: '#E8F5E9',
              icon: '✅',
              label: 'ACCEPTED'
            };
          case 'rejected':
          case 'REJECTED':
            return { 
              color: '#F44336', 
              bgColor: '#FFEBEE',
              icon: '❌',
              label: 'REJECTED'
            };
          case 'counter':
          case 'COUNTER':
            return { 
              color: '#FF9800', 
              bgColor: '#FFF3E0',
              icon: '↩️',
              label: 'COUNTER OFFER'
            };
          default:
            return { 
              color: '#D48C62', 
              bgColor: '#FDF6F0',
              icon: '📝',
              label: 'PENDING'
            };
        }
      };
      
      const statusInfo = getStatusInfo();
      
      return (
        <View style={[
          styles.messageBubble, 
          styles.negotiationBubble,
          isSent ? styles.messageBubbleSent : styles.messageBubbleReceived
        ]}>
          <View style={styles.negotiationCard}>
            {/* Header */}
            <View style={styles.negotiationHeader}>
              <Text style={styles.negotiationIcon}>📝</Text>
              <Text style={styles.negotiationTitle}>Negotiation Proposal</Text>
            </View>
            
            {/* Artwork Info */}
            <Text style={styles.negotiationArtworkTitle}>{artworkTitle}</Text>
            
            {/* Price */}
            <View style={styles.negotiationPriceContainer}>
              <Text style={styles.negotiationPriceLabel}>Final Price</Text>
              <Text style={styles.negotiationPrice}>₱{finalPrice.toFixed(2)}</Text>
            </View>
            
            {/* Status Badge */}
            <View style={[styles.negotiationStatusBadge, { backgroundColor: statusInfo.bgColor }]}>
              <Text style={[styles.negotiationStatusText, { color: statusInfo.color }]}>
                {statusInfo.icon} {statusInfo.label}
              </Text>
            </View>
            
            {/* Note if exists */}
            {note && (
              <Text style={styles.negotiationNote}>"{note}"</Text>
            )}
            
            {/* Timestamp */}
            <Text style={styles.negotiationTime}>
              {item.timestamp
                ? new Date(item.timestamp).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''}
            </Text>
          </View>
        </View>
      );
    }

    // Regular text message
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

  // Helper function to render messages list
  const renderMessagesList = () => {
    if (loading) {
      return (
        <View style={styles.chatLoadingContainer}>
          <ActivityIndicator size="large" color="#E8A066" />
        </View>
      );
    }

    return (
      <FlatList
        data={[...messages, ...contracts.map(c => ({ id: `contract-${c.id}`, text: '', senderId: c.buyer_uid, senderName: c.buyer, timestamp: c.created_at, read: true, contract: c }))].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        inverted={false}
        ListEmptyComponent={
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: '#8E8E93' }}>No messages yet</Text>
            <Text style={{ color: '#8E8E93', fontSize: 12 }}>
              {showNewNegotiationForm ? 'Send a negotiation proposal above' : `Say hello to ${user?.displayName}!`}
            </Text>
          </View>
        }
      />
    );
  };

  if (!user) {
    return (
      <View style={styles.chatLoadingContainer}>
        <Text>No user selected</Text>
      </View>
    );
  }

  return (
    <View style={styles.chatWindowContainer}>
      {revision && <ContractPanel artworkId={String(revision.artwork_id)} revision={revision} onClose={() => { setRevision(null); refreshContracts(); }} />}
      {/* Chat Header */}
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

      {/* Main content with 70/30 split when negotiation form is visible */}
      <View style={styles.mainContent}>
        {showNewNegotiationForm && negotiationArtwork && !isArtist ? (
          // 70% Negotiation Form / 30% Messages
          <>
            <View style={styles.negotiationFormContainer}>
              <NegotiationForm
                artwork={negotiationArtwork}
                buyerId={currentUser?.uid || ''}
                buyerName={currentUser?.displayName || 'Buyer'}
                artistId={user?.id || ''}
                artistName={user?.displayName || 'Artist'}
                chatId={[currentUser?.uid, user?.id].sort().join('_')}
                onSend={sendNegotiationMessage}
                onCancel={() => {
                  setShowNewNegotiationForm(false);
                  setNegotiationArtwork(null);
                }}
              />
            </View>
            
            <View style={styles.messagesContainer}>
              {renderMessagesList()}
            </View>
          </>
        ) : (
          // 100% Messages when no negotiation form
          <View style={styles.messagesFullContainer}>
            {renderMessagesList()}
          </View>
        )}
      </View>

      {/* Message Input - only show when negotiation form is not visible */}
      {!showNewNegotiationForm && (
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
      )}
    </View>
  );
}

// ========================================
// V. STYLES
// ========================================

const styles = StyleSheet.create({
  chatWindowContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

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

  chatUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },

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

  chatCloseButton: {
    padding: 4,
  },

  chatLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Main content container
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },

  // Negotiation form takes 70%
  negotiationFormContainer: {
    flex: 7,  // 70% of the space
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },

  // Messages take 30%
  messagesContainer: {
    flex: 3,  // 30% of the space
    backgroundColor: '#FFFFFF',
  },

  // Full messages when no form
  messagesFullContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },

  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 16,
    marginBottom: 8,
  },

  messageBubbleSent: {
    backgroundColor: '#E8A066',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },

  messageBubbleReceived: {
    backgroundColor: '#F2F2F7',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },

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

  messageTime: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 4,
    alignSelf: 'flex-end',
  },

  // Negotiation Card Styles
  negotiationBubble: {
    backgroundColor: 'transparent',
    maxWidth: '85%',
    alignSelf: 'center',
    marginVertical: 4,
    padding: 0,
  },

  negotiationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    width: 280,
  },

  negotiationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  negotiationIcon: {
    fontSize: 18,
    marginRight: 8,
  },

  negotiationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D48C62',
  },

  negotiationArtworkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },

  negotiationPriceContainer: {
    backgroundColor: '#FDF6F0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },

  negotiationPriceLabel: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },

  negotiationPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#D48C62',
    textAlign: 'center',
  },

  negotiationStatusBadge: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },

  negotiationStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },

  negotiationNote: {
    fontSize: 13,
    color: '#555',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 6,
  },

  negotiationTime: {
    fontSize: 10,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
  },

  // Message Input Styles
  messageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },

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

  sendButton: {
    marginLeft: 8,
    padding: 8,
  },

  sendButtonDisabled: {
    opacity: 0.5,
  },

  negotiationFormWrapper: {
    maxHeight: '60%',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
});

export default ChatWindow;
