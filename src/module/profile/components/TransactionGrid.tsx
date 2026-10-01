import OngoingNegotiations from "@/module/chat-negotiations/OngoingNegotiations";
import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { useRouter } from "expo-router";
import {
  Handshake,
  Paintbrush,
  ShieldCheck,
  Star,
  Truck,
  Wallet,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MyPurchases from "../MyPurchases";

export default function TransactionGrid({ role }: { role?: string }) {
  const router = useRouter();
  const [purchaseFilter, setPurchaseFilter] = useState<
    "all" | "receive" | "rate" | "pay" | null
  >(null);
  const [showNegotiations, setShowNegotiations] = useState(false);
  const [unreadCommissionCount, setUnreadCommissionCount] = useState(0);
  const [activeCommissionCount, setActiveCommissionCount] = useState(0);

  const loadCommissionNotifications = async () => {
    if (!auth.currentUser) return;
    try {
      const response = await fetch(`${API_URL}/api/users/notifications/`, {
        headers: {
          Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setUnreadCommissionCount(
          (data.notifications || []).filter(
            (item: any) => item.commission_id && !item.is_read,
          ).length,
        );
      }
    } catch {
      /* The commissions screen remains available if notifications are offline. */
    }
  };

  const loadActiveCommissions = async () => {
    if (!auth.currentUser) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const email = auth.currentUser.email || "";
      const roleName = role?.toLowerCase() === "artist" ? "artist" : "buyer";
      const response = await fetch(
        `${API_URL}/api/commissions/requests/?role=${roleName}&user_email=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setActiveCommissionCount(
          data.filter(
            (item: any) =>
              !["CANCELLED", "COMPLETE", "REJECTED"].includes(item.status),
          ).length,
        );
      }
    } catch {
      /* Keep the unread notification count available if commissions are offline. */
    }
  };

  useEffect(() => {
    loadCommissionNotifications();
    loadActiveCommissions();
    const refreshInterval = setInterval(() => {
      loadCommissionNotifications();
      loadActiveCommissions();
    }, 15000);
    return () => clearInterval(refreshInterval);
  }, [role]);

  const openCommissions = async () => {
    router.push("/commissions" as any);
    if (!auth.currentUser || !unreadCommissionCount) return;
    setUnreadCommissionCount(0);
    try {
      await fetch(`${API_URL}/api/users/notifications/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ commission_only: true }),
      });
    } catch {
      loadCommissionNotifications();
    }
  };

  const commissionBadgeCount = Math.max(
    unreadCommissionCount,
    activeCommissionCount,
  );

  return (
    <View style={styles.container}>
      {purchaseFilter && (
        <MyPurchases
          filter={purchaseFilter}
          onClose={() => setPurchaseFilter(null)}
        />
      )}
      {showNegotiations && (
        <OngoingNegotiations onClose={() => setShowNegotiations(false)} />
      )}
      {role?.toLowerCase() === "driver" && (
        <TouchableOpacity onPress={() => router.push("/rider/(tabs)" as any)}>
          <Text style={styles.viewMore}>Manage delivery orders</Text>
        </TouchableOpacity>
      )}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Transactions</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push("/verify-record" as any)}
          >
            <Text style={styles.verifyLink}>Verify record</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPurchaseFilter("all")}>
            <Text style={styles.viewMore}>My Purchases {">>"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.iconGrid}>
        <TouchableOpacity
          style={styles.iconItem}
          onPress={() => setShowNegotiations(true)}
        >
          <Handshake color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Negotiate</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconItem}
          onPress={() => setPurchaseFilter("pay")}
        >
          <Wallet color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Pay</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconItem}
          onPress={() => setPurchaseFilter("receive")}
        >
          <Truck color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Receive</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconItem}
          onPress={() => setPurchaseFilter("rate")}
        >
          <Star color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Rate</Text>
        </TouchableOpacity>

        {/* 5th Action: Commissions */}
        <TouchableOpacity style={styles.iconItem} onPress={openCommissions}>
          <View style={styles.commissionIconWrap}>
            <Paintbrush color="#C15656" size={28} />
            {commissionBadgeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {commissionBadgeCount > 9 ? "9+" : commissionBadgeCount}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.iconLabel}>Commissions</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconItem}
          onPress={() => router.push("/verify-record" as any)}
        >
          <ShieldCheck color="#5D8A63" size={28} />
          <Text style={styles.iconLabel}>Verify</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 24, width: "100%" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#C15656" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  verifyLink: { fontSize: 12, color: "#5D8A63", fontWeight: "800" },
  viewMore: { fontSize: 12, color: "#C15656", opacity: 0.75 },
  iconGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#fff",
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eee",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  iconItem: { alignItems: "center", flex: 1 },
  commissionIconWrap: { position: "relative" },
  badge: {
    position: "absolute",
    right: -11,
    top: -9,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#C15656",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  iconLabel: {
    fontSize: 11,
    color: "#C15656",
    marginTop: 8,
    fontWeight: "600",
    textAlign: "center",
  },
});
