import { CartItem } from '@/module/cart/types';
import { ChevronDown, Handshake } from 'lucide-react-native';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  item: CartItem;
  showArtistHeader: boolean;
  isItemSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleArtistSelect: (artistName: string) => void;
  onNegotiate: (id: string) => void;
  contractStatus: string;
  isAgreed: boolean;
  isOngoing: boolean;
  onRemove: (id: string) => void;
}

export default function CartItemRow({
  item,
  showArtistHeader,
  isItemSelected,
  onToggleSelect,
  onToggleArtistSelect,
  onRemove, onNegotiate, contractStatus, isAgreed, isOngoing,
}: Props) {
  return (
    <View>
      {/* Artist header */}
      {showArtistHeader && (
        <View style={styles.artistHeaderRow}>
          <TouchableOpacity
            style={[styles.checkboxCircle, isItemSelected && styles.checkboxChecked]}
            onPress={() => onToggleArtistSelect(item.artistName)}
          />
          <View style={styles.artistAvatarPlaceholder} />
          <Text style={styles.artistNameText}>{item.artistName || 'Unknown Artist'}</Text>
        </View>
      )}

      {/* Aartwork card details */}
      <View style={styles.artRow}>
        <TouchableOpacity
          style={[styles.checkboxSquare, isItemSelected && styles.checkboxSquareChecked]}
          onPress={() => onToggleSelect(item.id)}
        />

        <Image 
          source={{ uri: item.image || 'https://via.placeholder.com/200' }} 
          style={styles.artImage} 
          defaultSource={{ uri: 'https://via.placeholder.com/200' }}
          resizeMode="cover"
        />

        <View style={styles.artDetailsBlock}>
          <Text style={styles.artNameTextMain} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.artTypeText}>
            Type: <Text style={{ color: '#C15656' }}>{item.type || 'Physical'}</Text>
          </Text>
        </View>

        <View style={styles.priceColumn}>
          <Text style={styles.priceText}>₱{item.price}</Text>
        </View>

        <View style={styles.quantityPickerContainer}><Text style={styles.squareQtyText}>1 artwork</Text></View>

        {/* Actions */}
        <View style={styles.actionsColumn}>
          <TouchableOpacity onPress={() => onRemove(item.id)}>
            <Text style={styles.deleteTextLink}>DELETE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.findSimilarRow}>
            <Text style={styles.findSimilarText}>Find Similar</Text>
            <ChevronDown size={12} color="#C15656" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.contractRow}>
        <Text style={styles.contractStatus}>{contractStatus}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${isAgreed ? 'Review contract for' : isOngoing ? 'View negotiation for' : 'Negotiate contract for'} ${item.title}`} onPress={() => onNegotiate(item.artworkId)} style={[styles.negotiateButton, isAgreed && styles.reviewButton]}>
          <Handshake color="#C15656" size={18} />
          <Text style={styles.negotiateText}>{isAgreed ? 'Review contract' : isOngoing ? 'View negotiation' : 'Negotiate'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contractRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 14, flexWrap: 'wrap' },
  contractStatus: { color: '#786963', fontSize: 12, flexShrink: 1 },
  negotiateButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#C15656', backgroundColor: '#FFF1EC', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 6 },
  reviewButton: { backgroundColor: '#fff' },
  negotiateText: { color: '#C15656', fontWeight: '700', fontSize: 12 },
  artistHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    marginTop: 10,
  },
  artistAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D9D9D9',
    marginHorizontal: 10,
  },
  artistNameText: { fontWeight: 'bold', fontSize: 14, color: '#000' },
  artRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#F0F0F0',
  },
  artImage: { width: 55, height: 55, borderRadius: 6, marginLeft: 10 },
  artDetailsBlock: { flex: 1, marginLeft: 10, justifyContent: 'center' },
  artNameTextMain: { fontWeight: 'bold', fontSize: 13, color: '#000' },
  artTypeText: { fontSize: 10, color: '#888', marginTop: 4 },
  priceColumn: { width: 70, alignItems: 'center', justifyContent: 'center' },
  priceText: { fontWeight: 'bold', color: '#C15656', fontSize: 13 },
  quantityPickerContainer: { flexDirection: 'row', alignItems: 'center', width: 65, justifyContent: 'center' },
  squareQtyBtn: { borderWidth: 0.5, borderColor: '#888', paddingHorizontal: 4, paddingVertical: 1 },
  squareQtyBtnText: { fontSize: 10, color: '#333' },
  squareQtyDisplay: { borderWidth: 0.5, borderColor: '#888', borderLeftWidth: 0, borderRightWidth: 0, paddingHorizontal: 6, paddingVertical: 1 },
  squareQtyText: { fontSize: 10, fontWeight: '600' },
  actionsColumn: { width: 75, alignItems: 'flex-end', justifyContent: 'center' },
  deleteTextLink: { color: '#C15656', fontSize: 11, fontWeight: 'bold' },
  findSimilarRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  findSimilarText: { color: '#888', fontSize: 9, marginRight: 2 },
  checkboxCircle: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#888', backgroundColor: '#fff' },
  checkboxChecked: { backgroundColor: '#C15656', borderColor: '#C15656' },
  checkboxSquare: { width: 14, height: 14, borderWidth: 1, borderColor: '#888', backgroundColor: '#fff', borderRadius: 2 },
  checkboxSquareChecked: { backgroundColor: '#C15656', borderColor: '#C15656' },
});
