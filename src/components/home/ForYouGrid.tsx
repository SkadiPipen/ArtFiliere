import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ArtItem, FOR_YOU_DATA } from './types';

interface ForYouGridProps {
  activeCategory: string;
  onSelect: (item: ArtItem, type: string) => void;
}

export default function ForYouGrid({ activeCategory, onSelect }: ForYouGridProps) {
  const { width } = useWindowDimensions();
  const [gridPage, setGridPage] = useState(1);

  // Responsive column count for web/desktop vs mobile
  const numColumns = width > 768 ? 4 : 2;
  const itemsPerPage = numColumns * 2;

  const filteredForYou = activeCategory === 'All'
    ? FOR_YOU_DATA
    : FOR_YOU_DATA.filter((item) => item.type === activeCategory);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>For You</Text>
      <View style={styles.grid}>
        {filteredForYou
          .slice((gridPage - 1) * itemsPerPage, gridPage * itemsPerPage)
          .map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.gridCard, { width: `${100 / numColumns - 2}%` }]}
              onPress={() => onSelect(item, item.type)}
            >
              <Image source={{ uri: item.image }} style={styles.gridImg} resizeMode="cover" />
              <View style={styles.gridContent}>
                <Text style={styles.gridName} numberOfLines={1}>{item.artist}</Text>
                <Text style={styles.gridPrice}>₱ {item.price}</Text>
              </View>
            </TouchableOpacity>
          ))}
      </View>

      {/* PAGINATION */}
      <View style={styles.pagination}>
        <TouchableOpacity onPress={() => setGridPage(Math.max(1, gridPage - 1))}>
          <Text style={styles.pageArrow}>◀ prev</Text>
        </TouchableOpacity>
        {[1, 2, 3, 4, 5].map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.pageDot, gridPage === p && styles.activePageDot]}
            onPress={() => setGridPage(p)}
          >
            <Text style={[styles.pageNum, gridPage === p && { color: '#fff' }]}>{p}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => setGridPage(Math.min(5, gridPage + 1))}>
          <Text style={styles.pageArrow}>next ▶</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#C15656', marginHorizontal: 15, marginBottom: 12, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 15 },
  gridCard: {
    marginBottom: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  gridImg: { width: '100%', aspectRatio: 1 },
  gridContent: { padding: 10 },
  gridName: { fontSize: 13, fontWeight: '500', color: '#333' },
  gridPrice: { fontWeight: 'bold', color: '#C15656', marginTop: 2 },
  pagination: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 20 },
  pageArrow: { color: '#C15656', marginHorizontal: 12, fontWeight: 'bold', fontSize: 13 },
  pageDot: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginHorizontal: 4 },
  activePageDot: { backgroundColor: '#C15656' },
  pageNum: { fontSize: 13, fontWeight: 'bold', color: '#555' },
});