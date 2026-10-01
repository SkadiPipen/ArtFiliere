import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import AgreementDocument from "./components/AgreementDocument";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, FileText, Send } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
type A = {
  id: number;
  price: string;
  terms: string;
  buyer_accepted_at: string | null;
  artist_accepted_at: string | null;
  license_type: string;
  exclusivity: string;
  delivery_type: string;
  compensation_type: string;
};
type M = {
  id: number;
  sender_id: number | null;
  body: string;
  type: string;
  agreement: A | null;
};
type C = {
  id: number;
  current_user_id: number;
  artwork_id: number | null;
  messages: M[];
};
const explain: Record<string, string> = {
  personal: "Private, non-business use only.",
  commercial: "Business, marketing, product, or income-related use is allowed.",
  non_exclusive: "The artist may license the artwork to others.",
  exclusive: "Only this buyer may use it for the agreed purpose.",
  sole: "Buyer has exclusive use; artist may still show it in a portfolio.",
  digital: "Buyer receives a downloadable file.",
  physical: "A physical item is delivered; agree shipping in chat.",
  one_time: "The listed price is the complete payment.",
  royalty: "Artist receives an agreed percentage from future sales.",
};
export default function DirectMessageScreen() {
  const q = useLocalSearchParams<{
      artistId: string;
      artistName: string;
      artworkId: string;
      conversationId: string;
    }>(),
    router = useRouter();
  const [chat, setChat] = useState<C | null>(null),
    [body, setBody] = useState(""),
    [loading, setLoading] = useState(true),
    [form, setForm] = useState(false),
    [guide, setGuide] = useState(false),
    [view, setView] = useState<A | null>(null),
    [price, setPrice] = useState(""),
    [license, setLicense] = useState("personal"),
    [exclusive, setExclusive] = useState("non_exclusive"),
    [delivery, setDelivery] = useState("digital"),
    [comp, setComp] = useState("one_time");
  const h = async () => ({
    Authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
    "Content-Type": "application/json",
  });
  const load = async () => {
    try {
      setLoading(true);
      let id = q.conversationId,
        heads = await h();
      if (!id) {
        const r = await fetch(`${API_URL}/api/users/conversations/`, {
            headers: heads,
          }),
          x = await r.json();
        id = x.find(
          (i: any) => String(i.artwork_id || "") === String(q.artworkId || ""),
        )?.id;
        if (!id) {
          const c = await fetch(`${API_URL}/api/users/conversations/`, {
              method: "POST",
              headers: heads,
              body: JSON.stringify({
                artist_id: Number(q.artistId),
                artwork_id: q.artworkId ? Number(q.artworkId) : undefined,
              }),
            }),
            d = await c.json();
          id = d.id;
        }
      }
      const r = await fetch(`${API_URL}/api/users/conversations/${id}/`, {
          headers: heads,
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setChat(d);
    } catch (e: any) {
      Alert.alert("Messages", e.message || "Unable to open.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (q.artistId || q.conversationId) load();
  }, [q.artistId, q.conversationId]);
  const send = async () => {
    if (!body || !chat) return;
    const r = await fetch(
        `${API_URL}/api/users/conversations/${chat.id}/messages/`,
        { method: "POST", headers: await h(), body: JSON.stringify({ body }) },
      ),
      d = await r.json();
    setChat({ ...chat, messages: [...chat.messages, d] });
    setBody("");
  };
  const propose = async () => {
    if (!price || !chat) return;
    const r = await fetch(
      `${API_URL}/api/users/conversations/${chat.id}/agreements/`,
      {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({
          price,
          artwork_id: chat.artwork_id,
          license_type: license,
          exclusivity: exclusive,
          delivery_type: delivery,
          compensation_type: comp,
        }),
      },
    );
    if (!r.ok) return Alert.alert("Agreement", "Unable to send.");
    setForm(false);
    load();
  };
  const accept = async (a: A) => {
    await fetch(`${API_URL}/api/users/agreements/${a.id}/`, {
      method: "PATCH",
      headers: await h(),
    });
    setView(null);
    load();
  };
  if (loading)
    return (
      <View style={s.center}>
        <ActivityIndicator color="#C15656" />
      </View>
    );
  return (
    <SafeAreaView style={s.page}>
      <View style={s.head}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color="#C15656" />
        </TouchableOpacity>
        <Text style={s.name}>{q.artistName || "Conversation"}</Text>
        <TouchableOpacity onPress={() => setForm(true)} style={s.doc}>
          <FileText color="#fff" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={chat?.messages || []}
        keyExtractor={(x) => String(x.id)}
        contentContainerStyle={s.list}
        renderItem={({ item }) =>
          item.agreement ? (
            <TouchableOpacity
              style={s.agree}
              onPress={() => setView(item.agreement)}
            >
              <FileText size={16} color="#fff" />
              <Text style={s.white}>License and Agreement</Text>
            </TouchableOpacity>
          ) : (
            <View
              style={[
                s.bubble,
                item.sender_id === chat?.current_user_id ? s.mine : s.theirs,
              ]}
            >
              <Text>{item.body}</Text>
            </View>
          )
        }
      />
      <View style={s.compose}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write a message..."
          style={s.input}
        />
        <TouchableOpacity onPress={send} style={s.send}>
          <Send size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      <Modal visible={form} transparent onRequestClose={() => setForm(false)}>
        <Pressable style={s.overlay} onPress={() => setForm(false)}>
          <Pressable style={s.modal} onPress={(e) => e.stopPropagation()}>
            <ScrollView>
              <Text style={s.title}>Create license agreement</Text>
              <TouchableOpacity onPress={() => setGuide(true)}>
                <Text style={s.learn}>Learn more about license terms</Text>
              </TouchableOpacity>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="Agreed price"
                keyboardType="decimal-pad"
                style={s.field}
              />
              <Pick
                title="License"
                value={license}
                set={setLicense}
                choices={[
                  ["personal", "Personal use"],
                  ["commercial", "Commercial use"],
                ]}
              />
              <Pick
                title="Exclusivity"
                value={exclusive}
                set={setExclusive}
                choices={[
                  ["non_exclusive", "Non-exclusive"],
                  ["exclusive", "Exclusive"],
                  ["sole", "Sole"],
                ]}
              />
              <Pick
                title="Delivery"
                value={delivery}
                set={setDelivery}
                choices={[
                  ["digital", "Digital"],
                  ["physical", "Physical"],
                ]}
              />
              <Pick
                title="Compensation"
                value={comp}
                set={setComp}
                choices={[
                  ["one_time", "One-time"],
                  ["royalty", "Royalty"],
                ]}
              />
              <TouchableOpacity onPress={propose} style={s.red}>
                <Text style={s.white}>Send agreement</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={guide} transparent onRequestClose={() => setGuide(false)}>
        <Pressable style={s.overlay} onPress={() => setGuide(false)}>
          <Pressable style={s.modal} onPress={(e) => e.stopPropagation()}>
            <ScrollView>
              <Text style={s.title}>License terms guide</Text>
              {Object.entries(explain).map(([k, v]) => (
                <View key={k}>
                  <Text style={s.label}>{k.replace(/_/g, " ")}</Text>
                  <Text style={s.meaning}>{v}</Text>
                </View>
              ))}
              <TouchableOpacity onPress={() => setGuide(false)} style={s.red}>
                <Text style={s.white}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={!!view} transparent onRequestClose={() => setView(null)}>
        {view && (
          <Pressable style={s.overlay} onPress={() => setView(null)}>
            <Pressable style={s.modal} onPress={(e) => e.stopPropagation()}>
              <AgreementDocument
                terms={{
                  terms: view.terms,
                  licenseType: view.license_type,
                  exclusivity: view.exclusivity,
                  deliveryType: view.delivery_type,
                  compensationType: view.compensation_type,
                }}
              />
              <Text style={s.amount}>₱{view.price}</Text>
              {!(view.buyer_accepted_at && view.artist_accepted_at) && (
                <TouchableOpacity onPress={() => accept(view)} style={s.red}>
                  <Text style={s.white}>I understand and accept</Text>
                </TouchableOpacity>
              )}
            </Pressable>
          </Pressable>
        )}
      </Modal>
    </SafeAreaView>
  );
}
function Pick({
  title,
  value,
  set,
  choices,
}: {
  title: string;
  value: string;
  set: (x: string) => void;
  choices: string[][];
}) {
  return (
    <View>
      <Text style={s.label}>{title}</Text>
      {choices.map(([v, t]) => (
        <TouchableOpacity key={v} onPress={() => set(v)} style={s.pick}>
          <Text style={value === v ? s.selected : s.normal}>●</Text>
          <View>
            <Text>{t}</Text>
            <Text style={s.meaning}>{explain[v]}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}
function Info({ k, v }: { k: string; v: string }) {
  return (
    <View>
      <Text style={s.label}>{k}</Text>
      <Text>{v.replace(/_/g, " ")}</Text>
      <Text style={s.meaning}>{explain[v]}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FBF7E8" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  head: {
    height: 64,
    backgroundColor: "#fff",
    padding: 16,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  name: { flex: 1, fontWeight: "800" },
  doc: { backgroundColor: "#C15656", padding: 9, borderRadius: 20 },
  list: { padding: 14, gap: 8 },
  bubble: { padding: 10, borderRadius: 12, maxWidth: "78%" },
  mine: { alignSelf: "flex-end", backgroundColor: "#EFD7CD" },
  theirs: { alignSelf: "flex-start", backgroundColor: "#fff" },
  agree: {
    alignSelf: "flex-start",
    backgroundColor: "#D75A5D",
    padding: 11,
    borderRadius: 13,
    flexDirection: "row",
    gap: 7,
  },
  white: { color: "#fff", fontWeight: "800" },
  compose: { flexDirection: "row", padding: 10, backgroundColor: "#fff" },
  input: {
    flex: 1,
    backgroundColor: "#F7EFEA",
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  send: {
    backgroundColor: "#C15656",
    padding: 10,
    borderRadius: 20,
    marginLeft: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modal: {
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: 500,
    maxHeight: "80%",
    borderRadius: 14,
    padding: 20,
  },
  title: { fontSize: 19, fontWeight: "800", color: "#C15656" },
  learn: { color: "#C15656", fontWeight: "800", fontSize: 12, marginTop: 7 },
  field: {
    borderWidth: 1,
    borderColor: "#E6D7CF",
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  label: {
    fontWeight: "800",
    fontSize: 12,
    color: "#D65B5B",
    marginTop: 12,
    textTransform: "uppercase",
  },
  pick: { flexDirection: "row", gap: 7, marginTop: 7 },
  meaning: { fontSize: 11, lineHeight: 15, color: "#75655F", marginTop: 2 },
  selected: { color: "#D65B5B" },
  normal: { color: "#D7A5A5" },
  red: {
    backgroundColor: "#D75A5D",
    alignSelf: "flex-end",
    padding: 11,
    borderRadius: 7,
    marginTop: 16,
  },
  amount: { fontSize: 20, fontWeight: "800", color: "#D75A5D", marginTop: 15 },
});
