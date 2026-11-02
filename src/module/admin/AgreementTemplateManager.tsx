import { adminType, adminSurfaces } from './adminDesign';
import { useAdminRefresh } from './AdminRefresh';
import { Text, TextInput } from '@/components/Typography';
import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import AgreementPaper from '@/module/messages/components/AgreementPaper';
import { FileText, Pencil, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from "react-native";
type T = { id: number; name: string; body: string; is_active: boolean };
const standard =
  "ARTFILIERE ART LICENSE AGREEMENT\n\nBuyer: {{buyer_name}}\nArtist: {{artist_name}}\nAgreed price: PHP {{amount}}\n\nDescribe the permitted use, exclusivity, delivery requirements, and other conditions here.";
export default function AgreementTemplateManager() {
  const [items, setItems] = useState<T[]>([]),
    [loading, setLoading] = useState(true),
    [show, setShow] = useState(false),
    [edit, setEdit] = useState<T | null>(null),
    [name, setName] = useState(""),
    [body, setBody] = useState(standard),
    [active, setActive] = useState(true),
    [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const h = async () => {
    await auth.authStateReady();
    if (!auth.currentUser) throw Error("Please log in again.");
    return {
      Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      "Content-Type": "application/json",
    };
  };
  const load = async () => {
    try {
      setLoading(true);
      const r = await fetch(`${API_URL}/api/users/admin/agreement-templates/`, {
          headers: await h(),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setItems(d);
    } catch (e: any) {
      Alert.alert(
        "Agreement templates",
        e.message || "Unable to load templates.",
      );
    } finally {
      setLoading(false);
    }
  };
  const adminWorkspace = useAdminRefresh(load);
  useEffect(() => {
    load();
  }, []);
  const open = (x?: T) => {
    setEdit(x || null);
    setName(x?.name || "ArtFiliere standard agreement");
    setBody(x?.body || standard);
    setActive(x?.is_active ?? true);
    setMode('edit');
    setShow(true);
  };
  const close = () => {
    setShow(false);
    setEdit(null);
  };
  const save = async () => {
    if (!name.trim() || !body.trim())
      return Alert.alert(
        "Agreement template",
        "Name and wording are required.",
      );
    try {
      setSaving(true);
      const r = await fetch(`${API_URL}/api/users/admin/agreement-templates/`, {
          method: "POST",
          headers: await h(),
          body: JSON.stringify({ id: edit?.id, name, body, is_active: active }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      close();
      load();
    } catch (e: any) {
      Alert.alert(
        "Agreement template",
        e.message || "Unable to save template.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={{ gap: 24 }}>
      <View style={s.top}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={s.title}>Agreement templates</Text>
          <Text style={s.lead}>
            Edit the wording users see before accepting an agreement.
          </Text>
        </View>
        <TouchableOpacity onPress={() => open()} style={s.new}>
          <Plus size={15} color="#fff" />
          <Text style={s.white}>New template</Text>
        </TouchableOpacity>
      </View>
      <View style={s.panel}>
      {loading ? (
        <ActivityIndicator color="#C15656" style={{ padding: 20 }} />
      ) : (
        items.map((x) => (
          <View style={s.row} key={x.id}>
            <FileText size={19} color="#C15656" />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{x.name}</Text>
              <Text numberOfLines={2} style={s.preview}>
                {x.body}
              </Text>
              <Text style={[s.state, x.is_active ? s.on : s.off]}>
                {x.is_active ? "Active" : "Inactive"}
              </Text>
            </View>
            <TouchableOpacity onPress={() => open(x)} style={s.edit}>
              <Pencil size={15} color="#8A6258" />
              <Text>Edit</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
      </View>
      <Modal
        visible={show}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={s.overlay}>
          <ScrollView style={s.modalScroll} contentContainerStyle={s.modal}>
            <Text style={s.modalTitle}>
              {edit ? "Edit" : "New"} agreement template
            </Text>
            <Text style={s.help}>
              Edit the wording and paragraph spacing, then preview the full document before saving. Keep placeholders such as {'{{buyer_name}}'}, {'{{artist_name}}'} and {'{{amount}}'} for the actual agreement details.
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={s.field}
              placeholder="Template name"
              accessibilityLabel="Agreement template name"
              editable={!saving}
            />
            <View style={s.tabs}>{(['edit', 'preview'] as const).map(tab => <TouchableOpacity key={tab} accessibilityRole="button" accessibilityState={{ selected: mode === tab }} style={[s.tab, mode === tab && s.selectedTab]} onPress={() => setMode(tab)}><Text style={s.tabText}>{tab === 'edit' ? 'Edit agreement' : 'Document preview'}</Text></TouchableOpacity>)}</View>
            {mode === 'edit' ? <View style={s.documentEditor}><Text style={s.documentTitle}>Art Licensing Agreement</Text><TextInput
              value={body}
              onChangeText={setBody}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Full agreement wording"
              editable={!saving}
              style={s.body}
            /></View> : <AgreementPaper document={body} />}
            <Text style={s.help}>The preview preserves your exact wording. Buyer, artist and amount placeholders are filled when an agreement is created.</Text>
            <View style={s.switch}>
              <Text>Available for new agreements</Text>
              <Switch
                value={active}
                disabled={saving}
                onValueChange={setActive}
                trackColor={{ true: "#C15656" }}
              />
            </View>
            <View style={s.actions}>
              <TouchableOpacity onPress={close} disabled={saving}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} disabled={saving} style={s.save}>
                <Text style={s.white}>
                  {saving ? "Saving…" : "Save template"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  panel: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5DAD3",
    marginTop: 0,
    overflow: "hidden",
  },
  top: {
    flexWrap: "wrap",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  title: { ...adminType.pageTitle, },
  lead: { ...adminType.muted, marginTop: 3 },
  new: {
    ...adminSurfaces.button,
    marginLeft: "auto",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    backgroundColor: "#C15656",
    borderRadius: 12,
    flexDirection: "row",
    gap: 4,
  },
  white: { ...adminType.button,  color: "#fff", },
  row: {
    padding: 14,
    borderBottomWidth: 1,
    borderColor: "#F0E8E2",
    flexDirection: "row",
    gap: 10,
  },
  name: { ...adminType.cardTitle, },
  preview: { ...adminType.muted, marginTop: 3 },
  state: { ...adminType.label,  marginTop: 5 },
  on: { color: "#5D8A63" },
  off: { color: "#A86868" },
  edit: {
    ...adminSurfaces.button,
    alignSelf: "center",
    minHeight: 44,
    padding: 12,
    backgroundColor: "#F5E8E3",
    borderRadius: 12,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(43,35,32,.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modal: {
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: 1000,
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: { ...adminType.sectionTitle, },
  help: { ...adminType.muted, marginVertical: 10 },
  field: {
    borderWidth: 1,
    borderColor: "#E6D7CF",
    borderRadius: 8,
    padding: 11,
    marginBottom: 10,
  },
  modalScroll: { width: '100%', maxWidth: 1000, maxHeight: '92%' },
  tabs: { flexDirection: 'row', gap: 10, marginVertical: 16 },
  tab: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#DDD4CF' },
  selectedTab: { backgroundColor: '#FFF0E9', borderColor: '#C15656' },
  tabText: { ...adminType.button,  color: '#704F46', },
  documentEditor: { backgroundColor: '#FFFFFF', padding: 28, borderWidth: 1, borderColor: '#ECE7E2' },
  documentTitle: { fontSize: 28, fontWeight: '700', color: '#111111', marginBottom: 26 },
  body: { minHeight: 650, fontSize: 16, lineHeight: 29, color: '#171717', padding: 0 },
  switch: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 18,
    alignItems: "center",
    marginTop: 16,
  },
  save: { ...adminSurfaces.button, backgroundColor: "#C15656" },
});
