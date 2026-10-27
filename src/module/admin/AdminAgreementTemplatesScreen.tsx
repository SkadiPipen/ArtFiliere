import { ScrollView } from 'react-native';
import AdminPage from './AdminPage';
import AgreementTemplateManager from './AgreementTemplateManager';

export default function AdminAgreementTemplatesScreen() {
  return <AdminPage activeTab="templates"><ScrollView contentContainerStyle={{ maxWidth: 1100, width: '100%', alignSelf: 'center', padding: 24, paddingBottom: 60 }}>
    <AgreementTemplateManager />
  </ScrollView></AdminPage>;
}
