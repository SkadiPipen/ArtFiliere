import { Handshake, Star, Truck, Wallet } from "lucide-react-native";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function TransactionGrid() {
  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Transactions</Text>
        <TouchableOpacity
          onPress={() => Alert.alert("History", "Purchase history...")}
        >
          <Text style={styles.viewMore}>View Purchase History {">>"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.iconGrid}>
        <TouchableOpacity
          style={styles.iconItem}
          onPress={() => Alert.alert("Status", "Negotiations...")}
        >
          <Handshake color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Negotiate</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconItem}
          onPress={() => Alert.alert("Status", "Pending Payments...")}
        >
          <Wallet color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Pay</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconItem}
          onPress={() => Alert.alert("Status", "Deliveries...")}
        >
          <Truck color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Receive</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconItem}
          onPress={() => Alert.alert("Status", "Reviews...")}
        >
          <Star color="#C15656" size={28} />
          <Text style={styles.iconLabel}>To Rate</Text>
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
  iconItem: { alignItems: "center" },
  iconLabel: {
    fontSize: 11,
    color: "#C15656",
    marginTop: 8,
    fontWeight: "600",
  },
});
