import AdminTabs from './AdminTabs';
import { useState } from 'react';
import { View } from 'react-native';
import { Flag, RotateCcw, UserCog, Banknote } from 'lucide-react-native';
import { Text } from '@/components/Typography';
import { adminWorkspaceStyles as s } from './adminDesign';
import ReportManagementScreen from '@/module/reports/ReportManagementScreen';
import AdminPage from './AdminPage';

const sections = [
  { id: 'reports', title: 'Report reviews', detail: 'Review incidents and disputes, examine evidence, and record resolutions.', icon: Flag },
  { id: 'requests', title: 'Transaction requests', detail: 'Review cancellation and return requests and record admin decisions.', icon: RotateCcw },
  { id: 'actions', title: 'Account approvals', detail: 'Approve or reject account restrictions recommended by support.', icon: UserCog },
  { id: 'finance', title: 'Refunds & wallet credits', detail: 'Track financial authorizations and their processing status.', icon: Banknote },
] as const;
type Section = typeof sections[number]['id'];

export default function AdminReportsScreen() {
  const [section, setSection] = useState<Section>('reports');
  const header = <>
    <View style={s.hero}><View style={s.titleRow}><Flag size={30} color="#B65B50" /><Text style={s.title}>Reports & Transactions</Text></View><Text style={s.intro}>Review member concerns, resolve transaction requests, and oversee account and financial decisions.</Text></View>
    <AdminTabs items={sections.map(({ id, title, icon }) => ({ id, label: title, icon }))} value={section} onChange={setSection} />
  </>;
  return <AdminPage activeTab="reports"><ReportManagementScreen key={section} embedded initialTab={section} header={header} /></AdminPage>;
}
