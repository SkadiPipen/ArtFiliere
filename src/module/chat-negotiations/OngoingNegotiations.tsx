import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '@/firebase/config';
import { Contract, contractRequest } from './contracts';
import { ChatWindow } from './chats';

export default function OngoingNegotiations({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Contract[]>([]);
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
  }, []);
  const buying = selected?.buyer_uid === auth.currentUser?.uid;
  return <Modal visible animationType="slide" onRequestClose={selected ? () => setSelected(null) : onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {selected ? <ChatWindow currentUser={auth.currentUser} user={{ id: buying ? selected.artist_uid : selected.buyer_uid, displayName: buying ? selected.artist : selected.buyer, role: buying ? 'artist' : 'buyer', email: '', photoURL: '' }} onClose={() => setSelected(null)} /> : <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 20 }}><Text style={{ fontSize: 20, fontWeight: '700', color: '#C15656' }}>Ongoing negotiations</Text><TouchableOpacity onPress={onClose}><Text>Close</Text></TouchableOpacity></View>
        {!!error && <Text accessibilityRole="alert" style={{ padding: 16, color: '#b00020' }}>{error}</Text>}
        {loading ? <ActivityIndicator /> : <FlatList data={rows} keyExtractor={item => String(item.id)} contentContainerStyle={{ padding: 16 }} ListEmptyComponent={<Text>{error ? 'Unable to load negotiations.' : 'No ongoing negotiations.'}</Text>} renderItem={({ item }) => <TouchableOpacity accessibilityRole="button" onPress={() => setSelected(item)} style={{ padding: 16, borderWidth: 1, borderColor: '#E8D8D0', borderRadius: 10, marginBottom: 10 }}>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{item.title}</Text>
          <Text>{item.buyer} / {item.artist}</Text>
          <Text>PHP {item.price} - Awaiting agreement</Text>
          <Text style={{ color: '#C15656', marginTop: 8 }}>View negotiation</Text>
        </TouchableOpacity>} />}
      </>}
    </SafeAreaView>
  </Modal>;
}
