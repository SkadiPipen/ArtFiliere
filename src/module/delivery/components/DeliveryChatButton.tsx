import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { openDeliveryChat } from '@/services/deliveryApi';
import { purchaseRequest } from '@/services/purchases';
import type { ActiveDelivery } from '../types/delivery';

export default function DeliveryChatButton({ delivery }: { delivery: ActiveDelivery | null }) {
  const [visible, setVisible] = useState(false);
  const [contact, setContact] = useState<'buyer' | 'artist' | null>(null);
  const [chat, setChat] = useState<any>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const enabled = !!delivery && delivery.step !== 'DELIVERED';
  useEffect(() => { setVisible(false); setContact(null); setChat(null); setBody(''); }, [delivery?.id, enabled]);
  useEffect(() => {
    if (!visible || !contact || !delivery || !enabled) return;
    let active = true, checking = false;
    let conversationId: number | undefined;
    const load = async () => {
      if (checking) return;
      checking = true;
      try {
        if (!conversationId) conversationId = (await openDeliveryChat(delivery.id, contact)).conversation_id;
        const result = await purchaseRequest(`users/conversations/${conversationId}/`);
        if (active) { setChat(result); setError(''); }
      } catch (e: any) { if (active) setError(e.message || 'Unable to load delivery chat.'); }
      finally { checking = false; }
    };
    setChat(null); setBody(''); setError(''); void load();
    const timer = setInterval(load, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [visible, contact, delivery?.id, enabled]);
  const send = async () => {
    if (!chat || chat.read_only || !body.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const message = await purchaseRequest(`users/conversations/${chat.id}/messages/`, 'POST', { body: body.trim() });
      setChat((current: any) => current?.id === chat.id ? { ...current, messages: [...current.messages.filter((m: any) => m.id !== message.id), message] } : current);
      setBody('');
    } catch (e: any) { setError(e.message || 'Message could not be sent.'); }
    finally { setBusy(false); }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Delivery chat" onPress={() => setVisible(true)} style={s.floating}>
      <Ionicons name="chatbubbles" size={27} color="#fff" />
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.panel}>
          <View style={s.row}><Text style={s.title}>Delivery chat</Text><Pressable accessibilityRole="button" accessibilityLabel="Close delivery chat" onPress={() => setVisible(false)}><Ionicons name="close" size={25} /></Pressable></View>
          {!enabled ? <Text>No ongoing delivery. Accept an order to chat with its buyer or artist.</Text> : <>
            <Text>Order #{String(delivery!.id).replace('verified-', '')} · {delivery!.items?.[0]?.name}</Text>
            <View style={s.row}>{(['buyer', 'artist'] as const).map(role => <Pressable key={role} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: contact === role }} style={[s.contact, contact === role && s.selected]} onPress={() => setContact(role)}><Text>{role === 'buyer' ? 'Buyer' : 'Artist'}: {delivery![role].name}</Text></Pressable>)}</View>
            {!contact && <Text>Choose who you want to message.</Text>}
            {!!error && <Text accessibilityRole="alert" style={{ color: '#B42318' }}>{error}</Text>}
            {contact && !chat && !error && <ActivityIndicator color="#BC5454" />}
            {chat && <>
              {chat.read_only && <Text>This delivery chat is now read-only.</Text>}
              <ScrollView style={s.messages} contentContainerStyle={{ gap: 10, paddingVertical: 12 }}>
                {chat.messages.map((message: any) => <View key={message.id} style={[s.message, message.sender_id === chat.current_user_id && s.mine]}><Text style={s.author}>{message.sender_id === chat.current_user_id ? 'You' : message.sender_id == null ? 'Delivery' : delivery![contact!].name}</Text><Text>{message.body}</Text></View>)}
              </ScrollView>
              <View style={s.row}><TextInput accessibilityLabel="Delivery message" placeholder="Write a message…" editable={!chat.read_only} multiline maxLength={2000} value={body} onChangeText={setBody} style={s.input} /><Pressable accessibilityRole="button" accessibilityLabel="Send delivery message" disabled={chat.read_only || busy || !body.trim()} onPress={send} style={{ padding: 12, opacity: chat.read_only || busy || !body.trim() ? 0.4 : 1 }}><Ionicons name="send" size={23} color="#BC5454" /></Pressable></View>
            </>}
          </>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
const s = StyleSheet.create({
  floating: { position: 'absolute', right: 22, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: '#BC5454', alignItems: 'center', justifyContent: 'center', elevation: 6, boxShadow: '0 3px 12px #0003' },
  overlay: { flex: 1, backgroundColor: '#0005', alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel: { backgroundColor: '#fff', borderRadius: 18, padding: 20, width: '100%', maxWidth: 520, maxHeight: '85%', gap: 14 },
  title: { fontSize: 20, fontWeight: '700', color: '#BC5454' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  contact: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F5F3F1', borderWidth: 1, borderColor: '#eee' },
  selected: { borderColor: '#BC5454', backgroundColor: '#FCEBEB' },
  messages: { maxHeight: 330, flexShrink: 1 },
  message: { backgroundColor: '#F3F3F3', padding: 12, borderRadius: 10, alignSelf: 'flex-start', maxWidth: '90%' },
  mine: { backgroundColor: '#FBE5E5', alignSelf: 'flex-end' },
  author: { fontSize: 11, color: '#766C66', marginBottom: 4 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, maxHeight: 100 },
});
