import { goBackToWorkspace } from '@/services/navigation';
import PlatformGate from '@/components/PlatformGate';
import { Text } from '@/components/Typography';
import ResellerApprovals from '@/module/admin/ResellerApprovals';
import { router } from 'expo-router';
import { ScrollView, TouchableOpacity } from 'react-native';

export default function ResellerApprovalsPage() {
  return <PlatformGate platform="web" roles={['platform_admin', 'hr']}>
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80, gap: 20, width: '100%', maxWidth: 1100, alignSelf: 'center' }}>
      <TouchableOpacity onPress={() => void goBackToWorkspace()}><Text style={{ color: '#A74646' }}>← Back</Text></TouchableOpacity>
      <ResellerApprovals />
    </ScrollView>
  </PlatformGate>;
}
