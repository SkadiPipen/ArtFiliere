import PlatformGate from '@/components/PlatformGate';
import { ScrollView, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import RoyaltyApprovals from '@/module/admin/RoyaltyApprovals';

export default function RoyaltyApprovalsPage() {
  return <PlatformGate platform="web" roles={['platform_admin']}><SafeAreaView style={{ flex: 1, backgroundColor: '#fffaf5' }}><ScrollView contentContainerStyle={{ padding: 24, gap: 20, width: '100%', maxWidth: 1000, alignSelf: 'center' }}><Pressable onPress={() => router.replace('/admin-dashboard')}><Text style={{ color: '#C15656' }}>Back to admin</Text></Pressable><RoyaltyApprovals /></ScrollView></SafeAreaView></PlatformGate>;
}
