import PlatformGate from '@/components/PlatformGate';
import CustomerSupportDashboard from '@/module/support/CustomerSupportDashboard';

export default function CustomerServiceDashboard() {
  return <PlatformGate platform="web" roles={['customer_support']}><CustomerSupportDashboard /></PlatformGate>;
}
