import RoyaltyApplicationScreen from '@/module/royalties/RoyaltyApplicationScreen';
import WebSidebar from '@/module/home/components/WebSidebar';
import { Platform, useWindowDimensions, View } from 'react-native';

export default function RoyaltyAccessPage() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 768;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#FAF7F3' }}>
      {desktop && <WebSidebar />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <RoyaltyApplicationScreen />
      </View>
    </View>
  );
}
