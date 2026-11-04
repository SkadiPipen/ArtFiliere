import PlatformGate from '@/components/PlatformGate';
import CreativeWorkspace from '@/module/creative/CreativeWorkspace';

export default function CreativeDashboard() {
  return <PlatformGate platform="web" roles={['creative_moderator']}><CreativeWorkspace /></PlatformGate>;
}
