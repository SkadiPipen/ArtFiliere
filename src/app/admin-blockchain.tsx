import PlatformGate from '@/components/PlatformGate';
import AdminPage from '@/module/admin/AdminPage';
import ArtworkInvestigations from '@/module/admin/ArtworkInvestigations';

export default function AdminBlockchain() {
  return <PlatformGate platform="web" roles={['platform_admin']}><AdminPage activeTab="blockchain"><ArtworkInvestigations /></AdminPage></PlatformGate>;
}
