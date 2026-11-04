import AdminTabs from './AdminTabs';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ShieldCheck, UserCog } from 'lucide-react-native';
import { Text } from '@/components/Typography';
import { adminWorkspaceStyles as s } from './adminDesign';
import { AccountActions } from '@/module/moderation/ModeratorDashboard';
import AppealReviews from '@/module/moderation/AppealReviews';

export default function AccountApprovalWorkspace() {
  const [tab, setTab] = useState<'requests' | 'appeals'>('requests');
  return <View style={{ gap: 24 }}>
    <View style={s.hero}><View style={s.titleRow}><UserCog size={30} color="#B65B50" /><Text style={s.title}>Account Action Approvals</Text></View><Text style={s.intro}>Review support recommendations and restriction appeals, then record the reason for your decision.</Text></View>
    <AdminTabs items={[{ id: 'requests', label: 'Restriction requests', icon: UserCog }, { id: 'appeals', label: 'Suspension & ban appeals', icon: ShieldCheck }]} value={tab} onChange={setTab} />
    {tab === 'requests' ? <AccountActions approvals /> : <AppealReviews admin />}
  </View>;
}
