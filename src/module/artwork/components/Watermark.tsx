import { Image, StyleSheet, Text, View } from "react-native";

interface WatermarkProps {
  uri: string;
  height?: number;
  onImageError?: () => void;
}

export function Watermark({ uri, height = 400, onImageError }: WatermarkProps) {
  return (
    <View style={[styles.container, { height }]}>
      <Image source={{ uri }} style={styles.image} resizeMode="cover" onError={onImageError} />
      {/* Overlayed watermark */}
      <View style={styles.watermarkOverlay} pointerEvents="none">
        <Text style={styles.watermarkText}>ARTFILIER</Text>
        <Text style={styles.watermarkText}>ARTFILIER</Text>
        <Text style={styles.watermarkText}>ARTFILIER</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", position: "relative", overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  watermarkOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-around",
    alignItems: "center",
    opacity: 0.15,
  },
  watermarkText: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 8,
    transform: [{ rotate: "-25deg" }],
  },
});
