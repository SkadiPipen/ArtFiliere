import { COLORS } from '@/constants/colors';
import ResellerVerificationScreen from '@/module/profile/ResellerVerificationScreen';
import WebSidebar from '@/module/home/components/WebSidebar';
import { Platform, useWindowDimensions, View } from 'react-native';

export default function ResellerVerificationPage() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 768;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: COLORS.pageBackground }}>
      {desktop && <WebSidebar />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <ResellerVerificationScreen />
      </View>
    </View>
  );
}
