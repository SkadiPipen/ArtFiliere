import PlatformGate from '@/components/PlatformGate';
import AdminPerformanceScreen from '@/module/admin/AdminPerformanceScreen';

export default function AdminPerformance() {
  return <PlatformGate platform="web" roles={['platform_admin']}><AdminPerformanceScreen /></PlatformGate>;
}
