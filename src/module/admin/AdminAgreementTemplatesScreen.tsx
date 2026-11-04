import { ScrollView } from 'react-native';
import AdminPage from './AdminPage';
import AgreementTemplateManager from './AgreementTemplateManager';

export default function AdminAgreementTemplatesScreen() {
  return <AdminPage activeTab="templates"><ScrollView contentContainerStyle={{ maxWidth: 1360, width: '100%', alignSelf: 'center', padding: 28, paddingBottom: 60 }}>
    <AgreementTemplateManager />
  </ScrollView></AdminPage>;
}
