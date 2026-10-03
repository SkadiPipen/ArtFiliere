import PlatformGate from '@/components/PlatformGate';
import Screen from '@/module/moderation/ModeratorDashboard';
export default function ModeratorDashboard() { return <PlatformGate platform="web" roles={['creative_moderator', 'customer_support']}><Screen /></PlatformGate>; }
