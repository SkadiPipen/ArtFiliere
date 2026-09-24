import OngoingNegotiations from '@/module/chat-negotiations/OngoingNegotiations';
import { useRouter } from 'expo-router';
import { Handshake, Paintbrush, Star, Truck, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MyPurchases from '../MyPurchases';

export default function TransactionGrid({ role }: { role?: string }) {
  const router = useRouter();
  const [purchaseFilter, setPurchaseFilter] = useState<'all' | 'receive' | 'rate' | 'pay' | null>(null);
  const [showNegotiations, setShowNegotiations] = useState(false);

  return (
    <View style={styles.container}>
      {purchaseFilter && <MyPurchases filter={purchaseFilter} onClose={() => setPurchaseFilter(null)} />}
      {showNegotiations && <OngoingNegotiations onClose={() => setShowNegotiations(false)} />}
      {role?.toLowerCase() === 'driver' && (
        <TouchableOpacity onPress={() => router.push('/rider/(tabs)' as any)}>
          <Text style={styles.viewMore}>Manage delivery orders</Text>
        </TouchableOpacity>
      )}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Transactions</Text>
        <TouchableOpacity onPress={() => setPurchaseFilter('all')}>
          <Text style={styles.viewMore}>My Purchases {'>>'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.iconGrid}>
        <TouchableOpacity style={styles.iconItem} onPress={() => setShowNegotiations(true)}>
          <Handshake color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Negotiate</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconItem} onPress={() => setPurchaseFilter('pay')}>
          <Wallet color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Pay</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconItem} onPress={() => setPurchaseFilter('receive')}>
          <Truck color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Receive</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconItem} onPress={() => setPurchaseFilter('rate')}>
          <Star color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Rate</Text>
        </TouchableOpacity>

        {/* 5th Action: Commissions */}
        <TouchableOpacity style={styles.iconItem} onPress={() => router.push('/commissions' as any)}>
          <Paintbrush color="#C15656" size={28} />
          <Text style={styles.iconLabel}>Commissions</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 24, width: '100%' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#C15656' },
  viewMore: { fontSize: 12, color: '#C15656', opacity: 0.75 },
  iconGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  iconItem: { alignItems: 'center', flex: 1 },
  iconLabel: { fontSize: 11, color: '#C15656', marginTop: 8, fontWeight: '600', textAlign: 'center' },
});