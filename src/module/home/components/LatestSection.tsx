import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArtItem, LATEST_DATA } from '@/module/home/types';

interface LatestSectionProps {
  activeCategory: string;
  onSelect: (item: ArtItem, type: string) => void;
}

export default function LatestSection({ activeCategory, onSelect }: LatestSectionProps) {
  const filteredLatest = activeCategory === 'All'
    ? LATEST_DATA
    : LATEST_DATA.filter((item) => item.type === activeCategory);

  return (
    <View>
      <Text style={styles.sectionTitle}>Latest Arts</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 15 }}>
        {filteredLatest.length > 0 ? (
          filteredLatest.slice(0, 5).map((item) => (
            <TouchableOpacity key={item.id} style={styles.artCard} onPress={() => onSelect(item, item.type)}>
              <Image source={{ uri: item.image }} style={styles.cardImg} />
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.artist}</Text>
                <Text style={styles.cardPrice}>₱ {item.price}</Text>
              </View>
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
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#C15656', margin: 15 },
  artCard: { width: 140, marginRight: 15, backgroundColor: '#fff', borderRadius: 10, elevation: 3, paddingBottom: 10 },
  cardImg: { width: '100%', height: 140, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  cardInfo: { padding: 8 },
  cardName: { fontWeight: 'bold', fontSize: 12 },
  cardPrice: { color: '#C15656', fontWeight: 'bold' },
  emptyText: { paddingLeft: 15, color: '#999', fontStyle: 'italic' },
});
