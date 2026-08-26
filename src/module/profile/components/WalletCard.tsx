import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function WalletCard() {
  const [available, setAvailable] = useState('0.00');
  const [pending, setPending] = useState('0.00');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const response = await fetch(`${API_URL}/api/wallet/`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        if (!response.ok) throw new Error('Unable to load wallet.');
        const data = await response.json();
        setAvailable(data.available_balance || '0.00');
        setPending(data.pending_balance || '0.00');
      } catch {
        // A wallet is optional for buyers and unavailable while the API is offline.
      } finally {
        setLoading(false);
      }
    };
    loadWallet();
  }, []);

  return (
    <View style={styles.walletCard}>
      <Text style={styles.walletTitle}>Artist earnings</Text>
      <View style={styles.walletRow}>
        {loading ? <ActivityIndicator color="#fff" /> : <View><Text style={styles.currency}>₱ <Text style={styles.amount}>{available}</Text></Text><Text style={styles.pending}>₱ {pending} pending release</Text></View>}
        <TouchableOpacity style={styles.viewWalletBtn} onPress={() => Alert.alert('Artist earnings', `Available: ₱ ${available}\nPending: ₱ ${pending}\n\nPayouts will be enabled after Xendit artist verification.`)}><Text style={styles.viewWalletText}>Details {'>>'}</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  walletCard: {
    backgroundColor: '#F28527',
    borderRadius: 16,
    padding: 22,
    marginTop: -30,
    width: '100%',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  walletTitle: { color: '#fff', fontSize: 16, fontWeight: '600', opacity: 0.9 },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 10,
  },
  currency: { color: '#fff', fontSize: 20, fontWeight: '500' },
  amount: { fontSize: 32, fontWeight: 'bold' },
  pending: { color: '#FFF7E9', fontSize: 11, marginTop: 3 },
  viewWalletBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  viewWalletText: { color: '#E67E22', fontSize: 12, fontWeight: 'bold' },
});
