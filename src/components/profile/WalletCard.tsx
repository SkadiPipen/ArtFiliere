import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function WalletCard() {
  return (
    <View style={styles.walletCard}>
      <Text style={styles.walletTitle}>Wallet</Text>
      <View style={styles.walletRow}>
        <Text style={styles.currency}>
          ₱ <Text style={styles.amount}>11,230.00</Text>
        </Text>
        <TouchableOpacity style={styles.viewWalletBtn} onPress={() => Alert.alert('Wallet', 'Opening Wallet details...')}>
          <Text style={styles.viewWalletText}>View Wallet {'>>'}</Text>
        </TouchableOpacity>
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
  viewWalletBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  viewWalletText: { color: '#E67E22', fontSize: 12, fontWeight: 'bold' },
});