import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';

interface Props {
  isAllSelected: boolean;
  selectedCount: number;
  totalPrice: number;
  onToggleSelectAll: () => void;
  onCheckout: () => void;
  checkingOut: boolean;
  agreementRequired: boolean;
  signaturesRequired: boolean;
  onSign: () => void;
}

export default function CartFooter({
  isAllSelected,
  selectedCount,
  totalPrice,
  onToggleSelectAll, onCheckout, checkingOut, agreementRequired, signaturesRequired, onSign,
}: Props) {
  const { width } = useWindowDimensions();
  const { readOnly } = useContext(AuthContext);
  const desktop = Platform.OS === 'web' && width >= 768;
  return (
    <View style={[styles.bottomStickyFooter, desktop && { bottom: 0 }]}>
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

      <View style={{ alignItems: 'center', gap: 4 }}>
      {signaturesRequired && !agreementRequired && selectedCount === 1 && <TouchableOpacity onPress={onSign}><Text style={{ color: '#C15656', fontWeight: '600' }}>Sign / view signatures</Text></TouchableOpacity>}
      <TouchableOpacity
        style={[styles.solidCheckoutBtn, (readOnly || selectedCount !== 1 || agreementRequired || signaturesRequired) && { backgroundColor: '#A0A0A0' }]}
        disabled={readOnly || selectedCount !== 1 || checkingOut || agreementRequired || signaturesRequired}
        onPress={onCheckout}
      >
        <Text style={styles.checkoutBtnText}>{readOnly ? 'View-only access' : checkingOut ? 'Opening checkout...' : agreementRequired ? 'Agreement required' : signaturesRequired ? 'Both signatures required' : `Checkout (${selectedCount})`}</Text>
      </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomStickyFooter: {
    position: 'absolute',
    // The home layout renders its navigation over screen content.
    bottom: 75,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
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
