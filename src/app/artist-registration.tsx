import ArtistRegistrationScreen from '@/module/artist-registration/ArtistRegistrationScreen';
import WebSidebar from '@/module/home/components/WebSidebar';
import { Platform, useWindowDimensions, View } from 'react-native';

export default function ArtistRegistrationPage() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 768;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#FAF7F3' }}>
      {desktop && <WebSidebar />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <ArtistRegistrationScreen />
      </View>
    </View>
  );
}
