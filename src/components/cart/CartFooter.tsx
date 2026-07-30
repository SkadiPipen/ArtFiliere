import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  isAllSelected: boolean;
  selectedCount: number;
  totalPrice: number;
  onToggleSelectAll: () => void;
}

export default function CartFooter({
  isAllSelected,
  selectedCount,
  totalPrice,
  onToggleSelectAll,
}: Props) {
  const handleCheckout = () => {
    if (selectedCount === 0) return;
    const msg = `Proceeding to checkout with ${selectedCount} items.`;
    if (Platform.OS === 'web') alert(msg);
    else Alert.alert('Checkout', msg);
  };

  return (
    <View style={styles.bottomStickyFooter}>
      <View style={styles.selectAllContainer}>
        <TouchableOpacity
          style={[styles.checkboxSquare, isAllSelected && styles.checkboxSquareChecked]}
          onPress={onToggleSelectAll}
        />
        <Text style={styles.selectAllLabel}>Select All</Text>
      </View>

      <View style={styles.pricingSummaryArea}>
        <Text style={styles.totalLabelMuted}>Total: </Text>
        <Text style={styles.calculatedTotalPrice}>
          ₱{totalPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.solidCheckoutBtn, selectedCount === 0 && { backgroundColor: '#A0A0A0' }]}
        disabled={selectedCount === 0}
        onPress={handleCheckout}
      >
        <Text style={styles.checkoutBtnText}>Checkout ({selectedCount})</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomStickyFooter: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    elevation: 8,
  },
  selectAllContainer: { flexDirection: 'row', alignItems: 'center' },
  selectAllLabel: { marginLeft: 8, fontSize: 13, fontWeight: 'bold', color: '#000' },
  pricingSummaryArea: { flexDirection: 'row', alignItems: 'center' },
  totalLabelMuted: { color: '#C15656', fontSize: 14, fontWeight: 'bold' },
  calculatedTotalPrice: { fontSize: 15, fontWeight: 'bold', color: '#C15656' },
  solidCheckoutBtn: { backgroundColor: '#C15656', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6 },
  checkoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  checkboxSquare: { width: 14, height: 14, borderWidth: 1, borderColor: '#888', backgroundColor: '#fff', borderRadius: 2 },
  checkboxSquareChecked: { backgroundColor: '#C15656', borderColor: '#C15656' },
});