import PlatformGate from '@/components/PlatformGate';
import AdminReportsScreen from '@/module/admin/AdminReportsScreen';

export default function AdminReports() {
  return <PlatformGate platform="web" roles={['platform_admin']}><AdminReportsScreen /></PlatformGate>;
}
