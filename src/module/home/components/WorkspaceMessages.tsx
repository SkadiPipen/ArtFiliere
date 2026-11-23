import { AuthContext } from '@/context/AuthContext';
import MessageLauncher from '@/module/chat-negotiations/MessageLauncher';
import { ChatModal } from '@/module/chat-negotiations/chatModal';
import { useContext, useState } from 'react';
import { Alert, useWindowDimensions } from 'react-native';

export default function WorkspaceMessages() {
  const { user } = useContext(AuthContext);
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const compact = width < 480;

  return <>
    <MessageLauncher id="workspace" uid={user?.uid} size={compact ? 44 : 52} right={compact ? 12 : 20} bottom={24} onPress={() => {
      if (user) setOpen(true);
      else Alert.alert('Messages', 'Please sign in to open your messages.');
    }} />
    {open && user && <ChatModal visible currentUser={user} onClose={() => setOpen(false)} />}
  </>;
}
