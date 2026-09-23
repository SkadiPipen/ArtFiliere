import { Linking, Text, View } from 'react-native';
import { Action, s } from './Portal';
export default function DeliveryMap({ address, title, onError }: { address: string; title: string; onError: (message: string) => void }) {
  return <View style={s.card}><Text>{title}</Text><Text>{address}</Text>
    <Action title="Open navigation in Maps" onPress={() => { Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`).catch(e => onError(e.message)); }} />
  </View>;
}
