import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { FileText, Pencil, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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
  const h = async () => {
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
  useEffect(() => {
    load();
  }, []);
  const open = (x?: T) => {
    setEdit(x || null);
    setName(x?.name || "ArtFiliere standard agreement");
    setBody(x?.body || standard);
    setActive(x?.is_active ?? true);
    setShow(true);
  };
  const close = () => {
    setShow(false);
    setEdit(null);
  };
  const save = async () => {
    if (!name || !body)
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
    <View style={s.panel}>
      <View style={s.top}>
        <View>
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
      <Modal
        visible={show}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={s.overlay}>
          <ScrollView contentContainerStyle={s.modal}>
            <Text style={s.modalTitle}>
              {edit ? "Edit" : "New"} agreement template
            </Text>
            <Text style={s.help}>
              Use the placeholders buyer name, artist name, and amount by
              keeping their double curly-brace format from the default template.
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={s.field}
              placeholder="Template name"
            />
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              textAlignVertical="top"
              style={[s.field, s.body]}
            />
            <View style={s.switch}>
              <Text>Available for new agreements</Text>
              <Switch
                value={active}
                onValueChange={setActive}
                trackColor={{ true: "#C15656" }}
              />
            </View>
            <View style={s.actions}>
              <TouchableOpacity onPress={close}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} style={s.save}>
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E3D8CC",
    marginTop: 22,
    overflow: "hidden",
  },
  top: {
    padding: 17,
    borderBottomWidth: 1,
    borderColor: "#EEE4DA",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: "800", color: "#433633" },
  lead: { fontSize: 11, color: "#7C6A64", marginTop: 3 },
  new: {
    backgroundColor: "#C15656",
    borderRadius: 7,
    padding: 9,
    flexDirection: "row",
    gap: 4,
  },
  white: { color: "#fff", fontSize: 11, fontWeight: "800" },
  row: {
    padding: 14,
    borderBottomWidth: 1,
    borderColor: "#F0E8E2",
    flexDirection: "row",
    gap: 10,
  },
  name: { fontWeight: "800", fontSize: 13 },
  preview: { fontSize: 11, color: "#7C6A64", marginTop: 3 },
  state: { fontSize: 10, fontWeight: "800", marginTop: 5 },
  on: { color: "#5D8A63" },
  off: { color: "#A86868" },
  edit: {
    padding: 7,
    backgroundColor: "#FFF3E5",
    borderRadius: 6,
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
    maxWidth: 600,
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: { fontSize: 19, fontWeight: "800" },
  help: { fontSize: 12, color: "#75655F", marginVertical: 10 },
  field: {
    borderWidth: 1,
    borderColor: "#E6D7CF",
    borderRadius: 8,
    padding: 11,
    marginBottom: 10,
  },
  body: { height: 245 },
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
  save: { backgroundColor: "#C15656", borderRadius: 7, padding: 10 },
});
