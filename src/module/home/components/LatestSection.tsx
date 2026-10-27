import ProductImage from '@/components/ProductImage';
import { marketplaceHeading } from '@/constants/marketplaceTypography';
import { matchesArtworkCategory } from '@/services/artworkCategories';
import { Text } from '@/components/Typography';
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { ArtItem } from "@/module/home/types";
import ArtworkBorder from '@/components/ArtworkBorder';

interface LatestSectionProps {
  items: ArtItem[];
  activeCategory: string;
  onSelect: (item: ArtItem, type: string) => void;
}

export default function LatestSection({
  items,
  activeCategory,
  onSelect,
}: LatestSectionProps) {
  const filteredLatest =
    activeCategory === "All"
      ? items.filter(item => String(item.sale_type || '').toUpperCase() !== 'AUCTION')
      : items.filter((item) => String(item.sale_type || '').toUpperCase() !== 'AUCTION' && matchesArtworkCategory(item, activeCategory));

  return (
    <View>
      <Text style={styles.sectionTitle}>Latest Arts</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ paddingLeft: 15 }}
        contentContainerStyle={{ paddingTop: 22, paddingLeft: 8, paddingRight: 20, paddingBottom: 12 }}
      >
        {filteredLatest.length > 0 ? (
          filteredLatest.slice(0, 5).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.artCard}
              onPress={() => onSelect(item, item.type)}
            >
              <ProductImage source={{ uri: item.image }} style={styles.cardImg} />
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.artist}</Text>
                <Text style={styles.cardPrice}>₱ {item.price}</Text>
              </View>
              <ArtworkBorder artType={item.artType || item.type} imageHeight={140} />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>No arts in this category</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...marketplaceHeading,
    margin: 15,
  },
  artCard: {
    width: 140,
    marginRight: 28,
    backgroundColor: "#fff",
    borderRadius: 20,
    elevation: 3,
    paddingBottom: 10,
  },
  cardImg: {
    width: "100%",
    height: 140,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  cardInfo: { padding: 8 },
  cardName: { fontWeight: "bold", fontSize: 12 },
  cardPrice: { color: "#C15656", fontWeight: "bold" },
  emptyText: { paddingLeft: 15, color: "#999", fontStyle: "italic" },
});
