import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Contract, contractRequest } from './contracts';

export default function UnreadMessageBadge({ uid }: { uid?: string }) {
  const [messages, setMessages] = useState(0);
  const [proposals, setProposals] = useState(0);
  useEffect(() => {
    setMessages(0); setProposals(0);
    if (!uid) return;
    let active = true;
    const unsubscribe = onSnapshot(query(collection(db, 'chats'), where('participants', 'array-contains', uid)), snapshot => {
      setMessages(snapshot.docs.reduce((sum, doc) => sum + Math.max(0, Number(doc.data().participantData?.[uid]?.unreadCount) || 0), 0));
    }, () => setMessages(0));
    const load = async () => {
      try {
        const data = await contractRequest();
        if (active) setProposals(data.contracts.reduce((sum: number, c: Contract) => sum + (c.unread_count || 0), 0));
      } catch { /* Keep the last confirmed count during temporary network failures. */ }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { active = false; unsubscribe(); clearInterval(timer); };
  }, [uid]);
  const count = messages + proposals;
  if (!count || !uid) return null;
  return <View accessibilityLabel={`${count} unread messages`} style={{ position: 'absolute', right: -3, top: -3, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: '#DC2626', borderWidth: 1, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{count > 99 ? '99+' : count}</Text>
  </View>;
}
