import Skeleton from '@/components/Skeleton';
import { Text } from '@/components/Typography';
import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import { useFocusEffect } from 'expo-router';
import { useOpenArtistEarnings } from '../ArtistEarningsPanel';
import { useCallback, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

export default function WalletCard() {
  const openEarnings = useOpenArtistEarnings();
  const [totalEarnings, setTotalEarnings] = useState('0.00');
  const [pending, setPending] = useState('0.00');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    let inFlight = false;
    const loadWallet = async () => {
      if (inFlight) return;
      inFlight = true;
      setError('');
      try {
        const user = auth.currentUser;
        if (!user) return;
        const response = await fetch(`${API_URL}/api/artist/earnings/?period=all`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        });
        if (!response.ok) throw new Error("Unable to load wallet.");
        const data = await response.json();
        if (controller.signal.aborted) return;
        const total = ['received', 'available', 'pending', 'processing', 'failed']
          .reduce((sum, key) => sum + Math.round(Number(data.summary[key] || 0) * 100), 0);
        setTotalEarnings((total / 100).toFixed(2));
        setPending(data.summary.pending || '0.00');
      } catch {
        if (!controller.signal.aborted) setError("Earnings are unavailable. Open Details to retry.");
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadWallet();
    const timer = setInterval(loadWallet, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []));

  return (
    <View style={styles.walletCard}>
      <Text style={styles.walletTitle}>Artist earnings</Text>
      <View style={styles.walletRow}>
        {loading ? (
          <Skeleton layout="list" count={1} style={{ padding: 0 }} />
        ) : error ? <Text style={styles.pending}>{error}</Text> : (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityLabel={`Total artist earnings, ${totalEarnings} pesos`} style={styles.currency}>
              {'\u20B1'} <Text style={styles.amount}>{totalEarnings}</Text>
            </Text>
            <Text style={styles.pending}>{'\u20B1'} {pending} pending release</Text>
            {!!error && <Text style={styles.pending}>{error}</Text>}
          </View>
        )}
        <TouchableOpacity
          style={styles.viewWalletBtn}
          onPress={openEarnings}
        >
          <Text style={styles.viewWalletText}>Details {">>"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  walletCard: {
    backgroundColor: "#C15656",
    borderRadius: 16,
    padding: 20,
    marginTop: -30,
    width: "100%",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  walletTitle: { color: "#fff", fontSize: 16, fontWeight: "600", opacity: 0.9 },
  walletRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8,
    flexWrap: "nowrap",
    gap: 12,
  },
  currency: { color: "#fff", fontSize: 20, fontWeight: "500" },
  amount: { fontSize: 30, fontWeight: "bold" },
  pending: { color: "#FFF5F5", fontSize: 11, marginTop: 3 },
  viewWalletBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexShrink: 0,
  },
  viewWalletText: { color: "#C15656", fontSize: 12, fontWeight: "bold" },
});
