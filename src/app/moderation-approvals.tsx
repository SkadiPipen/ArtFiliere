import PlatformGate from '@/components/PlatformGate';
import { useContext } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { AccountActions } from '@/module/moderation/ModeratorDashboard';
import { Action, styles as s } from '@/module/moderation/ui';
export default function Approvals() { const { user, loading } = useContext(AuthContext); return <PlatformGate platform="web" roles={['platform_admin']}><SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}><Action label="Back to admin" onPress={() => router.replace('/admin-dashboard')} />{!loading && user && <AccountActions approvals />}{!loading && !user && <Action label="Sign in" onPress={() => router.replace('/login')} />}</ScrollView></SafeAreaView></PlatformGate>; }
