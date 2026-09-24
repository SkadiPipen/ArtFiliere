import { ChevronDown } from "lucide-react-native";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CartItem } from "@/module/cart/types";

interface Props {
  item: CartItem;
  showArtistHeader: boolean;
  isItemSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleArtistSelect: (artistName: string) => void;
  onQuantityChange: (id: string, currentQty: number, change: number) => void;
  onRemove: (id: string) => void;
}

export default function CartItemRow({
  item,
  showArtistHeader,
  isItemSelected,
  onToggleSelect,
  onToggleArtistSelect,
  onQuantityChange,
  onRemove,
}: Props) {
  return (
    <View>
      {/* Artist header */}
      {showArtistHeader && (
        <View style={styles.artistHeaderRow}>
          <TouchableOpacity
            style={[
              styles.checkboxCircle,
              isItemSelected && styles.checkboxChecked,
            ]}
            onPress={() => onToggleArtistSelect(item.artistName)}
          />
          <View style={styles.artistAvatarPlaceholder} />
          <Text style={styles.artistNameText}>
            {item.artistName || "Unknown Artist"}
          </Text>
        </View>
      )}

      {/* Aartwork card details */}
      <View style={styles.artRow}>
        <TouchableOpacity
          style={[
            styles.checkboxSquare,
            isItemSelected && styles.checkboxSquareChecked,
          ]}
          onPress={() => onToggleSelect(item.id)}
        />

        <Image source={{ uri: item.image }} style={styles.artImage} />

        <View style={styles.artDetailsBlock}>
          <Text style={styles.artNameTextMain} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.artTypeText}>
            Type:{" "}
            <Text style={{ color: "#C15656" }}>{item.type || "Physical"}</Text>
          </Text>
        </View>

        <View style={styles.priceColumn}>
          <Text style={styles.priceText}>₱{item.price}</Text>
        </View>

        {/* Quantity picker */}
        <View style={styles.quantityPickerContainer}>
          <TouchableOpacity
            style={styles.squareQtyBtn}
            onPress={() => onQuantityChange(item.id, item.quantity, -1)}
          >
            <Text style={styles.squareQtyBtnText}>˂</Text>
          </TouchableOpacity>
          <View style={styles.squareQtyDisplay}>
            <Text style={styles.squareQtyText}>{item.quantity}</Text>
          </View>
          <TouchableOpacity
            style={styles.squareQtyBtn}
            onPress={() => onQuantityChange(item.id, item.quantity, 1)}
          >
            <Text style={styles.squareQtyBtnText}>˃</Text>
          </TouchableOpacity>
        </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  artistHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: 10,
  },
  artistAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#D9D9D9",
    marginHorizontal: 10,
  },
  artistNameText: { fontWeight: "bold", fontSize: 14, color: "#000" },
  artRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#F0F0F0",
  },
  artImage: { width: 55, height: 55, borderRadius: 6, marginLeft: 10 },
  artDetailsBlock: { flex: 1, marginLeft: 10, justifyContent: "center" },
  artNameTextMain: { fontWeight: "bold", fontSize: 13, color: "#000" },
  artTypeText: { fontSize: 10, color: "#888", marginTop: 4 },
  priceColumn: { width: 70, alignItems: "center", justifyContent: "center" },
  priceText: { fontWeight: "bold", color: "#C15656", fontSize: 13 },
  quantityPickerContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: 65,
    justifyContent: "center",
  },
  squareQtyBtn: {
    borderWidth: 0.5,
    borderColor: "#888",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  squareQtyBtnText: { fontSize: 10, color: "#333" },
  squareQtyDisplay: {
    borderWidth: 0.5,
    borderColor: "#888",
    borderLeftWidth: 0,
    borderRightWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  squareQtyText: { fontSize: 10, fontWeight: "600" },
  actionsColumn: {
    width: 75,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  deleteTextLink: { color: "#C15656", fontSize: 11, fontWeight: "bold" },
  findSimilarRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  findSimilarText: { color: "#888", fontSize: 9, marginRight: 2 },
  checkboxCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#888",
    backgroundColor: "#fff",
  },
  checkboxChecked: { backgroundColor: "#C15656", borderColor: "#C15656" },
  checkboxSquare: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: "#888",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  checkboxSquareChecked: { backgroundColor: "#C15656", borderColor: "#C15656" },
});
