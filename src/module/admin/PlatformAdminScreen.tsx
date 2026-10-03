import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { router } from "expo-router";
import {
  Banknote,
  Clock3,
  LogOut,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AgreementTemplateManager from "./AgreementTemplateManager";
type Payment = {
  id: number;
  status: string;
  artwork: string;
  artist: string;
  buyer: string;
  gross_amount: string;
  artist_amount: string;
  platform_fee: string;
  can_release: boolean;
};
type Dashboard = {
  summary: {
    held_artist_earnings: string;
    available_artist_earnings: string;
    platform_fees: string;
  };
  payments: Payment[];
};
const money = (x: string) =>
  `₱${Number(x).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
export default function PlatformAdminScreen() {
  const [data, setData] = useState<Dashboard | null>(null),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState<number | null>(null);
  const token = async () => {
    if (!auth.currentUser) throw Error("Please log in again.");
    return auth.currentUser.getIdToken();
  };
  const load = async () => {
    try {
      setLoading(true);
      const r = await fetch(`${API_URL}/api/admin/wallet/`, {
          headers: { Authorization: `Bearer ${await token()}` },
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d);
    } catch (e: any) {
      Alert.alert("Platform Admin", e.message || "Unable to load finances.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const act = async (p: Payment, action: "release" | "refund") => {
    try {
      setWorking(p.id);
      const r = await fetch(`${API_URL}/api/admin/wallet/payments/${p.id}/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await token()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      Alert.alert("Funds updated", d.message);
      load();
    } catch (e: any) {
      Alert.alert("Action failed", e.message || "Please try again.");
    } finally {
      setWorking(null);
    }
  };
  if (loading)
    return (
      <View style={s.loading}>
        <ActivityIndicator color="#C15656" size="large" />
      </View>
    );
  return (
    <View style={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.brand}>ArtFiliere</Text>
          <Text style={s.role}>PLATFORM ADMIN</Text>
        </View>
        <View style={s.headActions}>
          <TouchableOpacity onPress={() => router.push('/moderation-approvals' as any)} style={s.round}><Text>Account action approvals</Text></TouchableOpacity>
          <TouchableOpacity onPress={load} style={s.round}>
            <RefreshCcw size={16} color="#5A4039" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await auth.signOut();
              router.replace("/login");
            }}
            style={s.logout}
          >
            <LogOut size={15} color="#5A4039" />
            <Text>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Platform finances</Text>
        <Text style={s.lead}>
          Release artist funds only after delivery and dispute checks.
        </Text>
        <View style={s.metrics}>
          <Metric
            icon={<Clock3 color="#A86868" size={22} />}
            label="Held artist earnings"
            value={money(data?.summary.held_artist_earnings || "0")}
          />
          <Metric
            icon={<Banknote color="#5D8A63" size={22} />}
            label="Available for payout"
            value={money(data?.summary.available_artist_earnings || "0")}
          />
          <Metric
            icon={<ShieldCheck color="#C15656" size={22} />}
            label="Platform commission"
            value={money(data?.summary.platform_fees || "0")}
          />
        </View>
        <View style={s.panel}>
          <Text style={s.panelTitle}>Payment controls</Text>
          {data?.payments.length ? (
            data.payments.map((p) => (
              <View key={p.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.artwork}>{p.artwork}</Text>
                  <Text style={s.meta}>
                    Buyer: {p.buyer} · Artist: {p.artist}
                  </Text>
                  <Text style={s.meta}>
                    {money(p.gross_amount)} · Artist {money(p.artist_amount)} ·
                    Fee {money(p.platform_fee)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      s.status,
                      p.status === "paid" ? s.paid : s.refunded,
                    ]}
                  >
                    {p.status}
                  </Text>
                  {p.can_release && (
                    <View style={s.buttons}>
                      <TouchableOpacity
                        onPress={() => act(p, "refund")}
                        style={s.refund}
                      >
                        <Text style={s.buttonText}>Refund</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => act(p, "release")}
                        disabled={working === p.id}
                        style={s.release}
                      >
                        <Text style={s.buttonText}>
                          {working === p.id ? "Saving…" : "Release"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            ))
          ) : (
            <Text style={s.empty}>No payment records yet.</Text>
          )}
        </View>
        <AgreementTemplateManager />
      </ScrollView>
    </View>
  );
}
function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={s.metric}>
      <View style={s.metricIcon}>{icon}</View>
      <View>
        <Text style={s.metricLabel}>{label}</Text>
        <Text style={s.metricValue}>{value}</Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFDF5" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    height: 86,
    backgroundColor: "#FFF8D6",
    borderBottomWidth: 2,
    borderColor: "#D87964",
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { color: "#D45C5C", fontSize: 26, fontWeight: "800" },
  role: {
    color: "#8B6E49",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headActions: { flexDirection: "row", gap: 8 },
  round: { padding: 10, borderRadius: 18, backgroundColor: "#fff" },
  logout: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    padding: 10,
    borderRadius: 18,
    backgroundColor: "#fff",
  },
  content: { maxWidth: 1100, width: "100%", alignSelf: "center", padding: 24 },
  title: { fontSize: 25, fontWeight: "800", color: "#322B29" },
  lead: { fontSize: 13, color: "#746865", marginTop: 5, marginBottom: 20 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: {
    minWidth: 230,
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E3D8CC",
    flexDirection: "row",
    gap: 11,
  },
  metricIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFF3E5",
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: { fontSize: 11, color: "#746865", fontWeight: "700" },
  metricValue: {
    fontSize: 20,
    color: "#342B28",
    fontWeight: "800",
    marginTop: 3,
  },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E3D8CC",
    marginTop: 22,
    overflow: "hidden",
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#433633",
    padding: 17,
    borderBottomWidth: 1,
    borderColor: "#EEE4DA",
  },
  row: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#F0E8E2",
    flexDirection: "row",
    gap: 12,
  },
  artwork: { fontSize: 14, fontWeight: "800", color: "#443633" },
  meta: { fontSize: 11, color: "#7C6A64", marginTop: 4 },
  status: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  paid: { color: "#5D8A63" },
  refunded: { color: "#C15656" },
  buttons: { flexDirection: "row", gap: 7, marginTop: 9 },
  release: { backgroundColor: "#5D8A63", padding: 8, borderRadius: 6 },
  refund: { backgroundColor: "#A86868", padding: 8, borderRadius: 6 },
  buttonText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  empty: { color: "#7C6A64", padding: 28, textAlign: "center" },
});
