import PlatformGate from '@/components/PlatformGate';
import PlatformAdminScreen from '@/module/admin/PlatformAdminScreen';

export default function AdminDashboard() {
  return <PlatformGate platform="web" roles={['platform_admin']}><PlatformAdminScreen /></PlatformGate>;
}
