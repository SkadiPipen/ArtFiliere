import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { HERO_DATA } from '@/module/home/types';

interface Props {
  onSelect: (item: any, type: string) => void;
}

export default function HeroCarousel({ onSelect }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = Math.min(windowWidth, 1200);

  const [heroIndex, setHeroIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setHeroIndex((prevIndex) => {
        const next = (prevIndex + 1) % HERO_DATA.length;
        flatListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.heroWrap}>
      <FlatList
        ref={flatListRef}
        data={HERO_DATA}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setHeroIndex(Math.round(e.nativeEvent.contentOffset.x / containerWidth))}
        getItemLayout={(_, index) => ({ length: containerWidth, offset: containerWidth * index, index })}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.heroItem, { width: containerWidth }]}
            activeOpacity={0.9}
            onPress={() => onSelect(item, 'Digital')}
          >
            <Image source={{ uri: item.img }} style={styles.heroImg} resizeMode="cover" />
            <View style={styles.heroOverlay}>
              <Text style={styles.badgeLabel}>{item.badge}</Text>
              <Text style={styles.heroTitle}>{item.title}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrap: { height: 240, width: '100%', marginVertical: 10 },
  heroItem: { height: 240, position: 'relative' },
  heroImg: { width: '100%', height: '100%', borderRadius: 12 },
  heroOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  badgeLabel: { color: '#C15656', fontWeight: 'bold', fontSize: 11 },
  heroTitle: { fontSize: 16, fontWeight: 'bold', color: '#111' },
});
