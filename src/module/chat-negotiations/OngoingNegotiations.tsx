import TransactionHeader from '@/components/TransactionHeader';
import { Text } from '@/components/Typography';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '@/firebase/config';
import { Contract, contractRequest } from './contracts';
import { ChatWindow } from './chats';

export default function OngoingNegotiations({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Contract[]>([]);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await contractRequest();
        if (active) { setRows(data.contracts.filter((c: Contract) => c.status === 'proposed')); setError(''); }
      } catch (e: any) { if (active) setError(e.message); }
      finally { if (active) setLoading(false); }
    };
    load(); const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [revision]);
  const buying = selected?.buyer_uid === auth.currentUser?.uid;
  return <Modal visible animationType="slide" onRequestClose={selected ? () => setSelected(null) : onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF7F3' }}>
      {selected ? <ChatWindow currentUser={auth.currentUser} user={{ id: buying ? selected.artist_uid : selected.buyer_uid, displayName: buying ? selected.artist : selected.buyer, role: buying ? 'artist' : 'buyer', email: '', photoURL: '' }} onClose={() => setSelected(null)} /> : <>
        <TransactionHeader title="Ongoing Negotiations" onBack={onClose} onRefresh={() => { setLoading(true); setRevision(value => value + 1); }} refreshing={loading} />
        <FlatList data={loading ? [] : rows} keyExtractor={item => String(item.id)} style={{ flex: 1 }} contentContainerStyle={s.content}
          ListHeaderComponent={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
          ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: 24 }} color="#BC5555" /> : <View style={s.empty}><Text style={s.emptyTitle}>{error ? 'Unable to load negotiations.' : 'No ongoing negotiations.'}</Text></View>}
          renderItem={({ item }) => <TouchableOpacity accessibilityRole="button" onPress={() => setSelected(item)} style={s.card}>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{item.title}</Text>
          <Text>{item.buyer} / {item.artist}</Text>
          <Text>PHP {item.price} - Awaiting agreement</Text>
          <Text style={{ color: '#C15656', marginTop: 8 }}>View negotiation</Text>
        </TouchableOpacity>} />
      </>}
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  content: { padding: 20, gap: 16, width: '100%', maxWidth: 1280, alignSelf: 'center' },
  card: { padding: 20, gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2D6CD', borderRadius: 14 },
  empty: { padding: 32, minHeight: 140, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2D6CD', borderRadius: 14 },
  emptyTitle: { color: '#786862', textAlign: 'center', fontSize: 16 },
  error: { color: '#b00020' },
});
