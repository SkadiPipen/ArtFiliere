import { View, Text, StyleSheet } from "react-native";

type CardProps = {
    title: string;
    description: string;
    price: number;
    type: string;
};

export default function Card(artwork : CardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{artwork.title}</Text>
      <Text style={styles.description}>
        {artwork.description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 300,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,

    // Shadow (iOS)
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,

    // Shadow (Android)
    elevation: 5,
  },

  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },

  description: {
    fontSize: 16,
    color: "#555",
  },
});