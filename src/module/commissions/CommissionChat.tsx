import useChatAutoScroll from '@/hooks/useChatAutoScroll';
import { Text, TextInput } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import { ArrowLeft, Send } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View } from 'react-native';

export type CommissionConversation = {
  id: number; title: string; artist: string; buyer: string; artist_id: number; buyer_id: number;
  is_artist: boolean; can_work: boolean; status: string; created_at: string;
  messages: { id: number; sender: string; sender_id: number; body: string; created_at: string }[];
};

export default function CommissionChat({ id, onBack }: { id: number; onBack: () => void }) {
  const [conversation, setConversation] = useState<CommissionConversation | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const autoScroll = useChatAutoScroll<ScrollView>(id);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    setConversation(null); setMessage(''); setError('');
    const load = async () => {
      try {
        const rows: CommissionConversation[] = await purchaseRequest(`commissions/workspace/${id}/`);
        if (!rows.length) throw new Error('Commission conversation is unavailable for this account.');
        if (active) { setConversation(rows[0]); setError(''); }
      } catch (e: any) { if (active && generation.current === current) setError(e.message); }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => { active = false; generation.current++; clearInterval(timer); };
  }, [id]);
  const send = async () => {
    if (!message.trim() || sending || !conversation?.can_work) return;
    autoScroll.scrollToLatest();
    const current = generation.current;
    setSending(true); setError('');
    try {
      await purchaseRequest(`commissions/workspace/${id}/`, 'POST', { action: 'message', body: message.trim() });
      if (generation.current === current) setMessage('');
      const rows = await purchaseRequest(`commissions/workspace/${id}/`);
      if (generation.current === current) { setMessage(''); setConversation(rows[0]); }
    } catch (e: any) { if (generation.current === current) setError(e.message); }
    finally { if (generation.current === current) setSending(false); }
  };
  const ownId = conversation?.is_artist ? conversation.artist_id : conversation?.buyer_id;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#E8DED6', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <TouchableOpacity accessibilityLabel="Back to commission chats" onPress={onBack} style={{ padding: 8 }}><ArrowLeft color="#C15656" size={24} /></TouchableOpacity>
      <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', fontSize: 18 }}>{conversation ? conversation.is_artist ? conversation.buyer : conversation.artist : 'Commission chat'}</Text>
        <Text style={{ color: '#75655F', marginTop: 4 }}>{conversation?.title} · Commission</Text></View>
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ padding: 12, color: '#A13030' }}>{error}</Text>}
    {!conversation && !error && <ActivityIndicator style={{ margin: 24 }} color="#C15656" />}
    <ScrollView ref={autoScroll.ref} contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }} onContentSizeChange={autoScroll.onContentSizeChange} onLayout={autoScroll.onLayout} onScroll={autoScroll.onScroll} scrollEventThrottle={16}>
      {conversation && !conversation.messages.length && <Text style={{ textAlign: 'center', color: '#75655F', padding: 24 }}>No commission messages yet. Start the conversation below.</Text>}
      {conversation?.messages.map(item => <View key={item.id} style={{ alignSelf: item.sender_id === ownId ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: 12, borderRadius: 14, backgroundColor: item.sender_id === ownId ? '#F3E0D3' : '#F4F4F6', gap: 5 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#75655F' }}>{item.sender}</Text><Text selectable style={{ fontSize: 15, color: '#302B28' }}>{item.body}</Text>
        <Text style={{ fontSize: 11, color: '#75655F' }}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>)}
    </ScrollView>
    {!autoScroll.atLatest && <TouchableOpacity onPress={autoScroll.scrollToLatest}><Text style={{ color: '#A33F45', textAlign: 'center', padding: 10 }}>Latest messages</Text></TouchableOpacity>}
    {conversation?.can_work ? <View style={{ padding: 12, borderTopWidth: 1, borderColor: '#E8DED6', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <TextInput accessibilityLabel="Commission message" multiline maxLength={4000} placeholder="Message about this commission…" value={message} onChangeText={setMessage} editable={!sending} style={{ flex: 1, borderWidth: 1, borderColor: '#DDCEC7', borderRadius: 18, padding: 12, maxHeight: 140 }} />
      <TouchableOpacity accessibilityLabel="Send commission message" disabled={sending || !message.trim()} onPress={() => void send()} style={{ padding: 12, borderRadius: 20, backgroundColor: sending || !message.trim() ? '#DDD' : '#C15656' }}><Send color="#FFF" size={20} /></TouchableOpacity>
    </View> : conversation && <Text style={{ padding: 16, color: '#75655F' }}>Messaging is available while this commission is in progress and account access permits it. This conversation is currently read-only.</Text>}
  </KeyboardAvoidingView>;
}
