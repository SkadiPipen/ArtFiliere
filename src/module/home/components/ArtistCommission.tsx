import { useRouter } from "expo-router";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ARTIST_DATA } from "@/module/home/types";

export default function ArtistCommission() {
  const router = useRouter();

  return (
    <View>
      <Text style={styles.sectionTitle}>Commission an Artist</Text>
      {ARTIST_DATA.map((artist) => (
        <TouchableOpacity
          key={artist.id}
          style={styles.artistRow}
          onPress={() => router.push("/(home)/profile")}
        >
          <Image source={{ uri: artist.avatar }} style={styles.artistAvatar} />
          <View style={styles.artistDetails}>
            <Text style={styles.artistNameText}>{artist.name}</Text>
            <Text style={styles.ratingText}>Ratings: ★★★★☆</Text>
            <Text style={styles.rulesLink}>View Commission Rules {">>"}</Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.rateLabel}>Hourly Rate:</Text>
            <Text style={styles.rateValue}>₱ {artist.rate}</Text>
          </View>
        </TouchableOpacity>
      ))}
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
  artistAvatar: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: "#eee",
  },
  artistDetails: { flex: 1, marginLeft: 15 },
  artistNameText: { fontWeight: "bold", fontSize: 15 },
  ratingText: { color: "#C15656", fontSize: 12, marginVertical: 2 },
  rulesLink: { color: "#C15656", fontSize: 10, fontStyle: "italic" },
  priceContainer: { alignItems: "flex-end" },
  rateLabel: { fontSize: 10, color: "#999" },
  rateValue: { fontSize: 18, fontWeight: "bold" },
});
