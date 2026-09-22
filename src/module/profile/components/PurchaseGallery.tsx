import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { purchaseRequest } from '@/services/purchases';
import MyPurchases from '../MyPurchases';

export default function PurchaseGallery() {
  const [items, setItems] = useState<{ id: number; image: string; title: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      try {
        const rows = await purchaseRequest('purchases/');
        if (active) { setItems(rows.filter((p: any) => p.status === 'paid').slice(0, 4)); setError(''); }
      } catch (e: any) { if (active) setError(e.message); }
    };
    load(); const timer = setInterval(load, 10000);
    return () => { active = false; clearInterval(timer); };
  }, []));
  return <View style={{ marginTop: 24, width: '100%', gap: 12 }}>
    {open && <MyPurchases onClose={() => setOpen(false)} />}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#C15656' }}>My Purchases</Text>
      <TouchableOpacity onPress={() => setOpen(true)}><Text style={{ color: '#C15656' }}>View all</Text></TouchableOpacity>
    </View>
    {!!error && <Text style={{ color: '#b00020' }}>{error}</Text>}
    {!items.length && !error && <Text>Your paid artworks will appear here.</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {items.map(item => <TouchableOpacity key={item.id} style={{ width: 150, gap: 6 }} onPress={() => setOpen(true)}>
        {!!item.image && <Image source={{ uri: item.image }} style={{ width: 150, height: 150, borderRadius: 10 }} resizeMode="cover" />}
        <Text numberOfLines={2}>{item.title}</Text>
      </TouchableOpacity>)}
    </View>
  </View>;
}
