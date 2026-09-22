// ========================================
// FILE: chatModal.tsx
// PURPOSE: Switches between chatList(group) view to chatWindow(pm).
//          Referenced in: index.tsx (home screen) and profile.tsx
// ========================================

import ContractPanel from './ContractPanel';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Artwork } from './types';
import { ChatList } from './chatList';
import { ChatWindow } from './chats';

//I. Props Interface
interface ChatModalProps {
  visible: boolean;
  onClose: () => void;
  currentUser: any;
  initialArtist?: any;
  initialNegotiationArtwork?: Artwork | null;
}

//II. Main Component
export function ChatModal({ 
  visible, 
  onClose, 
  currentUser, 
  initialArtist,
  initialNegotiationArtwork,
}: ChatModalProps) {
  const [showContracts, setShowContracts] = useState(false);
  //II.1. State: show chat list if null, chat box if there's a selected chat
  const [selectedChat, setSelectedChat] = useState<{ id: string; user: any } | null>(null);

  //II.2. Effect: Open chatbox if artist is clicked or negotiation is started
  useEffect(() => {
    //II.2.A. Handle artist click (message button)
    if (initialArtist && visible && currentUser) {
      // Use firebase_uid or id (both should be Firebase UID now)
      const artistUid = initialArtist.firebase_uid || initialArtist.id;
      if (!artistUid) {
        console.warn('⚠️ No Firebase UID found for artist:', initialArtist);
        return;
      }
      
      const sortedParticipants = [currentUser.uid, artistUid].sort();
      const chatId = sortedParticipants.join('_');
      
      // Use displayName or username for the chat name
      const displayName = initialArtist.username || 
                         initialArtist.displayName || 
                         `${initialArtist.first_name} ${initialArtist.last_name}` || 
                         'Artist';
      
      const chatUser = {
        id: artistUid,
        displayName: displayName, // This is what shows in the chat header
        photoURL: initialArtist.photoURL || '',
        email: initialArtist.email || '',
        role: 'artist',
      };
      
      console.log('📱 Opening chat with artist:', chatUser.displayName);
      console.log('📱 Chat ID:', chatId);
      
      setSelectedChat({
        id: chatId,
        user: chatUser,
      });
    }
  }, [initialArtist, visible, currentUser]);

  //II.3. Handle chat selection from ChatList
  const handleChatSelect = (chatId: string, otherUser: any) => {
    setSelectedChat({ id: chatId, user: otherUser });
  };

  //II.4. Close individual chat view (returns to chat list)
  const handleCloseChat = () => {
    setSelectedChat(null);
  };

  //II.5. Close the entire modal
  const handleCloseModal = () => {
    setSelectedChat(null);
    onClose();
  };

  //III. Render
  if (!visible) return null;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleCloseModal}
    >
      <SafeAreaView style={styles.modalContainer}>
        <TouchableOpacity onPress={() => setShowContracts(true)} style={{ padding: 14 }}><Text style={{ color: "#C15656", fontWeight: "700" }}>Contracts ? review and accept proposals</Text></TouchableOpacity>
        {showContracts && <ContractPanel onClose={() => setShowContracts(false)} />}
        {selectedChat ? (
          <ChatWindow
            user={selectedChat.user}
            currentUser={currentUser}
            onClose={handleCloseChat}
            initialNegotiationArtwork={initialNegotiationArtwork}
            isArtist={currentUser?.role === 'artist' || currentUser?.user_type === 'A'}
          />
        ) : (
          <>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Messages</Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <X size={24} color="#000" />
              </TouchableOpacity>
            </View>
            <ChatList
              currentUser={currentUser}
              onChatSelect={handleChatSelect}
            />
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// IV. Styles
const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F8F8FC',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
});

export default ChatModal;
