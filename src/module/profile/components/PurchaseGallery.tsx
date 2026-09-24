import { useRouter } from "expo-router";
import { Edit3 } from "lucide-react-native";
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function PurchaseGallery() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.sectionTitle}>My Purchases</Text>
          <TouchableOpacity onPress={() => router.push("/(home)/edit-profile")}>
            <Edit3 color="#C15656" size={16} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => Alert.alert("Purchases", "Opening gallery...")}
        >
          <Text style={styles.viewMore}>view more {">>"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.purchaseGallery}>
        <Image
          source={{ uri: "https://picsum.photos/seed/p1/400/400" }}
          style={styles.mainPurchase}
          resizeMode="cover"
        />
        <View style={styles.sidePurchaseColumn}>
          <Image
            source={{ uri: "https://picsum.photos/seed/p2/200/200" }}
            style={styles.sidePurchase}
            resizeMode="cover"
          />
          <Image
            source={{ uri: "https://picsum.photos/seed/p3/200/200" }}
            style={styles.sidePurchase}
            resizeMode="cover"
          />
        </View>
        <Image
          source={{ uri: "https://picsum.photos/seed/p4/200/400" }}
          style={styles.tallPurchase}
          resizeMode="cover"
        />
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
  viewMore: { fontSize: 12, color: "#C15656", opacity: 0.75 },
  purchaseGallery: { flexDirection: "row", height: 200 },
  mainPurchase: { flex: 2, height: "100%", borderRadius: 12, marginRight: 8 },
  sidePurchaseColumn: { flex: 1, marginRight: 8 },
  sidePurchase: {
    width: "100%",
    height: "48%",
    borderRadius: 10,
    marginBottom: "4%",
  },
  tallPurchase: { flex: 1, height: "100%", borderRadius: 12 },
});
