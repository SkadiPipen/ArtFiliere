// ========================================
// FILE: chatModal.tsx
// PURPOSE: Switches between chatList(group) view to chatWindow(pm).
//          Referenced in: index.tsx (home screen) and profile.tsx
// ========================================


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
import { ChatList } from './chatList';
import { ChatWindow } from './chats';

//I. Props Interface (Basically just stating main variables)
interface ChatModalProps {
  visible: boolean;
  onClose: () => void;
  //1. currentUser = Logged-in user 
  currentUser: any;
  //2. initialArtist = artist data to open chat directly
  initialArtist?: any;
}

//II. Main Component
export function ChatModal({ visible, onClose, currentUser, initialArtist }: ChatModalProps) {
  //II.1. (Var) show chat list if null: chat box if there's a selected chat
  const [selectedChat, setSelectedChat] = useState<{ id: string; user: any } | null>(null);

  //II.2. (Nested Func) Open chatbox if artist is clicked( user must be logged in and chat triggered
  //      Reference: ArtistList.tsx - "Message" button
  useEffect(() => {
    //2.1. IF TRUE, open chat 
    if (initialArtist && visible && currentUser) {      
      //2.1.A (Var)Create consistent chat ID: {uid1}_{uid2} sorted alphabetically
      const sortedParticipants = [currentUser.uid, initialArtist.firebase_uid].sort();
      //2.1.B (Var)Merge both user's UID to make chat ID (their messages henceforth will be in this chat)
      const chatId = sortedParticipants.join('_');
      
      //2.1.C (Var)Format artist data to match ChatWindow's header basically
      const chatUser = {
        id: initialArtist.firebase_uid,
        //basically if username exists(or can be retrieved) it's prio, if not use full name.
        displayName: initialArtist.displayName || `${initialArtist.first_name} ${initialArtist.last_name}`,
        photoURL: initialArtist.photoURL || '',
        email: initialArtist.email || '',
        role: 'artist',
      };
      
      //2.2. Set selected chat to open ChatWindow 
      setSelectedChat({
        //2.2.A (Var)Chat ID(the one from the merged UIDs)
        id: chatId,
        //2.2.B (Var)Chat user data (the artist- or the one we talkin to)
        user: chatUser,
      });
    }
  }, [initialArtist, visible, currentUser]); //return to this effect if any of these change

  
  //II.3. (Var)Handles user selecting a chat from the ChatList
  //      Called from: ChatList.tsx when a conversation is tapped
  const handleChatSelect = (chatId: string, otherUser: any) => {
    setSelectedChat({ id: chatId, user: otherUser });
  };

  //II.4. (Var)Closes the individual chat view (returns to chat list)
  const handleCloseChat = () => {
    setSelectedChat(null);
  };

  //II.5. (Var) Closes the entire modal
  //      Resets selectedChat so next time it opens, it shows chat list first
  const handleCloseModal = () => {
    setSelectedChat(null);
    onClose();
  };

  //III. Render
  return (
    //III.1. React Native Modal - slides up from bottom
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleCloseModal}
    >
      <SafeAreaView style={styles.modalContainer}>
        {/*III.1.1. If a chat is selected, show ChatWindow */}
        {selectedChat ? (
          <ChatWindow
            user={selectedChat.user}
            currentUser={currentUser}
            onClose={handleCloseChat}
          />
        ) : (
          //III.1.2. Otherwise, show ChatList with header
          <>
            {/*III.1.2.1. Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Messages</Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <X size={24} color="#000" />
              </TouchableOpacity>
            </View>
            {/*III.1.2.2. ChatList - shows all conversations */}
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