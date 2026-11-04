import PlatformGate from '@/components/PlatformGate';
import HrDashboardScreen from '@/module/hr/HrDashboardScreen';

export default function HrDashboard() {
  return <PlatformGate platform="web" roles={['hr']}><HrDashboardScreen /></PlatformGate>;
}
