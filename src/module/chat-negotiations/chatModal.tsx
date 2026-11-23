import ContentModal from '@/components/ContentModal';
import { Text } from '@/components/Typography';
import { COLORS } from '@/constants/colors';
// ========================================
// FILE: chatModal.tsx
// PURPOSE: Switches between chatList(group) view to chatWindow(pm).
//          Referenced in: index.tsx (home screen) and profile.tsx
// ========================================

import DirectMessageScreen from '@/module/messages/DirectMessageScreen';
import CommissionChat from '@/module/commissions/CommissionChat';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useId, useState } from 'react';
import { SafeAreaView, StyleSheet, TouchableOpacity, View } from 'react-native';
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
  initialCommissionId?: number;
}

//II. Main Component
export function ChatModal({ 
  visible, 
  onClose, 
  currentUser, 
  initialArtist,
  initialNegotiationArtwork,
  initialCommissionId,
}: ChatModalProps) {
  const chatId = useId();
  const [selectedDriver, setSelectedDriver] = useState<{ id: number; name: string } | null>(null);
  const [driverTab, setDriverTab] = useState(false);
  //II.1. State: show chat list if null, chat box if there's a selected chat
  const [selectedChat, setSelectedChat] = useState<{ id: string; user: any } | null>(null);
  const [selectedCommission, setSelectedCommission] = useState<number | null>(null);
  const [commissionFilter, setCommissionFilter] = useState(false);
  useEffect(() => {
    setSelectedChat(null); setSelectedCommission(null); setSelectedDriver(null); setDriverTab(false);
  }, [currentUser?.uid]);
  useEffect(() => {
    if (visible && initialCommissionId) {
      setSelectedChat(null);
      setSelectedCommission(initialCommissionId); setCommissionFilter(true);
    }
  }, [visible, initialCommissionId]);

  //II.2. Effect: Open chatbox if artist is clicked or negotiation is started
  useEffect(() => {
    //II.2.A. Handle artist click (message button)
    if (initialArtist && !initialCommissionId && visible && currentUser) {
      // Use firebase_uid or id (both should be Firebase UID now)
      const artistUid = initialArtist.firebase_uid || initialArtist.id;
      if (!artistUid) {

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




      setSelectedChat({
        id: chatId,
        user: chatUser,
      });
    }
  }, [initialArtist, initialCommissionId, visible, currentUser]);

  //II.3. Handle chat selection from ChatList
  const handleChatSelect = (chatId: string, otherUser: any) => {
    setSelectedDriver(null); setDriverTab(false);
    setSelectedCommission(null);
    setSelectedChat({ id: chatId, user: otherUser });
  };

  //II.4. Close individual chat view (returns to chat list)
  const handleCloseChat = () => {
    setSelectedChat(null);
  };

  //II.5. Close the entire modal
  const handleCloseModal = () => {
    setSelectedChat(null);
    setSelectedCommission(null);
    setCommissionFilter(false); setSelectedDriver(null); setDriverTab(false);
    onClose();
  };

  //III. Render
  if (!visible) return null;
  return (
    <ContentModal
      accessibilityLabel="Messages"
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleCloseModal}
    >
      <SafeAreaView nativeID={`artfilier-chat-open-${chatId}`} style={styles.modalContainer}>
        {selectedDriver ? <DirectMessageScreen key={selectedDriver.id} conversationId={selectedDriver.id} title={selectedDriver.name} onBack={() => { setSelectedDriver(null); setDriverTab(true); }} /> : selectedCommission !== null ? <CommissionChat key={selectedCommission} id={selectedCommission} onBack={() => { setSelectedCommission(null); setCommissionFilter(true); }} /> : selectedChat ? (
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
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back from messages" onPress={handleCloseModal} hitSlop={8}>
                <ArrowLeft size={24} color={COLORS.redDark} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Messages</Text>
            </View>
            <ChatList
              currentUser={currentUser}
              initialTab={driverTab ? 'drivers' : 'artists'}
              onDriverSelect={(id, name) => { setSelectedDriver({ id, name }); setDriverTab(true); }}
              onChatSelect={handleChatSelect}
              onCommissionSelect={id => { setSelectedChat(null); setSelectedCommission(id); setCommissionFilter(true); }}
              initialArtworkFilter={commissionFilter ? 'commission' : 'all'}
            />
          </>
        )}
      </SafeAreaView>
    </ContentModal>
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
    alignItems: 'center',
    gap: 12,
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
