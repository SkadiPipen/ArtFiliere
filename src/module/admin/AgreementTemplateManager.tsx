import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { FileText, Pencil, X } from 'lucide-react-native';
import { Text, TextInput } from '@/components/Typography';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { useAdminRefresh } from './AdminRefresh';
import { adminType as type, adminSurfaces as surface } from './adminDesign';
import AdminTabs from './AdminTabs';

type Section = { key: string; label: string; body: string };
type Template = { id: number; name: string; sections: Section[]; is_active: boolean };
export default function AgreementTemplateManager() {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Template | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const request = async (body?: object) => {
    await auth.authStateReady();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw Error('Please sign in again.');
    const response = await fetch(`${API_URL}/api/users/admin/agreement-templates/`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Unable to update license wording.');
    return result;
  };
  const load = async () => {
    setLoading(true);
    try { setItems(await request()); setError(''); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useAdminRefresh(load);
  useEffect(() => { void load(); }, []);
  const open = (item: Template) => {
    setEditing(item); setDraft(Object.fromEntries(item.sections.map(section => [section.key, section.body])));
    setFormError(''); setMode('edit'); setNotice('');
  };
  const save = async () => {
    if (!editing || saving) return;
    if (editing.sections.some(section => !draft[section.key]?.trim())) { setFormError('Enter wording for every section before saving.'); return; }
    setSaving(true); setFormError('');
    try { await request({ id: editing.id, sections: draft }); setEditing(null); setNotice('Default wording saved for new agreements.'); await load(); }
    catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  };
  return <View style={{ gap: 24 }}>
    <View style={{ gap: 12 }}><Text style={type.pageTitle}>License wording</Text><Text style={type.body}>Adjust the default clauses included in new artwork and commission licenses.</Text></View>
    <View style={s.notice}><Text style={type.muted}>Each clause has its own editor. Prices, parties, selected permissions, royalty calculations, and delivery details are filled from the agreement. Existing agreements keep their recorded wording.</Text></View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: '#477452' }}>{notice}</Text>}
    {loading ? <ActivityIndicator color="#B65B50" /> : items.map(item => <View key={item.id} style={[surface.card, s.row]}>
      <FileText size={23} color="#B65B50" /><View style={{ flex: 1, gap: 6 }}><Text style={type.cardTitle}>{item.name}</Text><Text style={type.muted}>{item.sections.length} editable clauses | {item.is_active ? 'Active' : 'Inactive'}</Text><Text numberOfLines={2} style={type.muted}>{item.sections.map(section => section.label).join(', ')}</Text></View>
      <Pressable accessibilityRole="button" style={[surface.button, s.secondary]} onPress={() => open(item)}><Pencil size={16} color="#A74646" /><Text style={[type.button, s.accent]}>Edit wording</Text></Pressable>
    </View>)}
    {!loading && !error && !items.length && <Text style={type.muted}>No license templates are configured.</Text>}
    <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => { if (!saving) setEditing(null); }}>
      <View style={s.overlay}><View accessibilityViewIsModal style={s.dialog}>
        <View style={s.dialogHeader}><View style={{ flex: 1, gap: 6 }}><Text style={type.sectionTitle}>{editing?.name}</Text><Text style={type.muted}>Edit individual default clauses</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close wording editor" disabled={saving} onPress={() => setEditing(null)} style={{ padding: 10 }}><X size={22} color="#81756D" /></Pressable></View>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
          <AdminTabs items={[{ id: 'edit', label: 'Edit clauses' }, { id: 'preview', label: 'Wording preview' }]} value={mode} onChange={setMode} />
          <Text style={type.muted}>These sections are inserted into the full license alongside the agreed transaction details. Keep the {'{{exclusivity}}'} placeholder where shown. Review changes before saving.</Text>
          {editing?.sections.map((section, index) => <View key={section.key} style={{ gap: 10 }}><Text style={type.cardTitle}>{index + 1}. {section.label}</Text>{mode === 'edit' ? <TextInput accessibilityLabel={`${section.label} default wording`} editable={!saving} value={draft[section.key] || ''} onChangeText={value => setDraft(old => ({ ...old, [section.key]: value }))} multiline maxLength={10000} textAlignVertical="top" style={[surface.input, type.body, { minHeight: 120 }]} /> : <Text selectable style={type.body}>{draft[section.key]}</Text>}</View>)}
        </ScrollView>
        {!!formError && <Text accessibilityRole="alert" style={[s.error, { paddingHorizontal: 24 }]}>{formError}</Text>}
        <View style={s.footer}><Pressable accessibilityRole="button" disabled={saving} onPress={() => setEditing(null)} style={[surface.button, s.secondary]}><Text style={[type.button, s.accent]}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[surface.button, { backgroundColor: '#B95353', opacity: saving ? .5 : 1 }]}><Text style={[type.button, { color: '#FFFFFF' }]}>{saving ? 'Saving...' : 'Save default wording'}</Text></Pressable></View>
      </View></View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }, notice: { padding: 20, backgroundColor: '#F5E8E3', borderRadius: 16 },
  secondary: { flexDirection: 'row', gap: 8, backgroundColor: '#F5E8E3' }, accent: { color: '#A74646' }, error: { color: '#B42318' },
  overlay: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(43,35,32,.4)' },
  dialog: { width: '100%', maxWidth: 960, maxHeight: '92%', backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden' },
  dialogHeader: { padding: 24, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: '#E5DAD3' },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 12, padding: 20, borderTopWidth: 1, borderColor: '#E5DAD3' },
});
