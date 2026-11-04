import { StyleSheet } from 'react-native';
import { staffWorkspaceStyles } from '@/components/staffWorkspaceStyles';

export const adminType = StyleSheet.create({
  pageTitle: { fontFamily: 'LoraSemiBold', fontWeight: '600', fontSize: 28, lineHeight: 38, color: '#3A2D2A' },
  sectionTitle: { fontFamily: 'LoraSemiBold', fontWeight: '600', fontSize: 20, lineHeight: 28, color: '#3A2D2A' },
  cardTitle: { fontFamily: 'NunitoSansSemiBold', fontWeight: '600', fontSize: 16, lineHeight: 24, color: '#59453D' },
  body: { fontSize: 14, lineHeight: 22, color: '#59453D' },
  muted: { fontSize: 13, lineHeight: 20, color: '#81756D' },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#81756D' },
  button: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  metric: { fontFamily: 'NunitoSansSemiBold', fontWeight: '600', fontSize: 26, lineHeight: 34, color: '#3A2D2A' },
  input: { fontSize: 14, color: '#59453D' },
});
export const adminSurfaces = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 16, padding: 20, gap: 16 },
  button: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 12, padding: 12, backgroundColor: '#FFFFFF' },
});
export const adminWorkspaceStyles = {
  ...staffWorkspaceStyles,
  title: { ...staffWorkspaceStyles.title, ...adminType.pageTitle },
  intro: { ...adminType.body, color: '#81756D' },
  muted: adminType.muted,
  quickTitle: adminType.cardTitle,
  navLabel: { ...adminType.button, color: '#786862' },
  workspace: { ...staffWorkspaceStyles.workspace, ...adminType.button },
};

export const adminControls = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 8 },
  tab: { minHeight: 56, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: '#E5DAD3', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  tabSelected: { backgroundColor: '#F5E8E3', borderColor: '#DAB5AA' },
});
