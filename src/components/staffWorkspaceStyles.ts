import { StyleSheet } from 'react-native';

export const staffWorkspaceStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FAF7F3' }, shell: { flex: 1 },
  sidebar: { width: 260, backgroundColor: '#FFFCF9', borderRightWidth: 1, borderColor: '#E8DAD2', padding: 18, gap: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 }, logo: { width: 42, height: 48 }, brand: { fontFamily: 'LoraSemiBold', fontSize: 24, color: '#382C26' }, role: { fontSize: 9, color: '#A17B68', letterSpacing: 1, marginTop: 5 },
  navigation: { gap: 8 }, navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 }, navActive: { backgroundColor: '#F5E8E3' }, navLabel: { color: '#786862', fontSize: 13 }, logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#DAB5AA' },
  main: { flex: 1, minWidth: 0 }, topbar: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#E8DAD2', padding: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }, workspace: { flex: 1, fontSize: 14, color: '#70482F', fontWeight: '600' },
  content: { width: '100%', maxWidth: 1360, alignSelf: 'center', padding: 28, gap: 24, paddingBottom: 60 }, hero: { gap: 12 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 }, title: { flex: 1, fontFamily: 'LoraSemiBold', fontSize: 29, color: '#3A2D2A' }, intro: { color: '#786862', fontSize: 14, lineHeight: 23 }, muted: { color: '#8B8078', fontSize: 12, lineHeight: 21 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, quickCard: { flex: 1, minWidth: 230, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5DAD3' }, iconTile: { padding: 14, backgroundColor: '#F5E8E3', borderRadius: 16 }, quickTitle: { fontSize: 15, fontWeight: '700', color: '#674B40' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 20, backgroundColor: '#F5E8E3', borderRadius: 14 }, reviewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 }, reviewColumn: { flex: 1, minWidth: 280 }, error: { color: '#B42318', padding: 16 },
});
