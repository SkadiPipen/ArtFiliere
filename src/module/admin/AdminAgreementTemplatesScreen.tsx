import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Settings2, FileText, SlidersHorizontal } from 'lucide-react-native';
import { Text } from '@/components/Typography';
import AdminPage from './AdminPage';
import AgreementTemplateManager from './AgreementTemplateManager';
import PlatformDefaultsEditor from './PlatformDefaultsEditor';
import AdminTabs from './AdminTabs';
import { adminWorkspaceStyles as s } from './adminDesign';

export default function AdminAgreementTemplatesScreen() {
  const [tab, setTab] = useState<'defaults' | 'wording'>('defaults');
  return <AdminPage activeTab="templates"><ScrollView contentContainerStyle={s.content}>
    <View style={s.hero}><View style={s.titleRow}><Settings2 size={30} color="#B65B50" /><Text style={s.title}>Platform Defaults</Text></View><Text style={s.intro}>Manage pricing defaults, platform fees, and standard license wording for new agreements.</Text></View>
    <AdminTabs items={[{ id: 'defaults', label: 'Pricing & fees', icon: SlidersHorizontal }, { id: 'wording', label: 'License wording', icon: FileText }]} value={tab} onChange={setTab} />
    {tab === 'defaults' ? <PlatformDefaultsEditor /> : <AgreementTemplateManager />}
  </ScrollView></AdminPage>;
}
