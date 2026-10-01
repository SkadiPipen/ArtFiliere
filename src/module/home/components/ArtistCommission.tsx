import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ArtistCommission() {
  const router = useRouter();

  return (
    <View>
      <Text style={styles.sectionTitle}>Commission an Artist</Text>
      <TouchableOpacity
        style={styles.artistRow}
        onPress={() => router.push("/artists")}
      >
        <View style={styles.artistDetails}>
          <Text style={styles.artistNameText}>
            Browse artists accepting commissions
          </Text>
          <Text style={styles.ratingText}>
            Filter by rating, completed work, newest artists, or hourly rate.
          </Text>
        </View>
        <Text style={styles.rulesLink}>Explore →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#C15656",
    margin: 15,
  },
  artistRow: {
    flexDirection: "row",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    alignItems: "center",
  },
  artistDetails: { flex: 1 },
  artistNameText: { fontWeight: "bold", fontSize: 15 },
  ratingText: { color: "#C15656", fontSize: 12, marginVertical: 2 },
  rulesLink: { color: "#C15656", fontSize: 10, fontStyle: "italic" },
});
