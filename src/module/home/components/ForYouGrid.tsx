import { Text } from '@/components/Typography';
import { marketplaceHeading } from '@/constants/marketplaceTypography';
import { matchesArtworkCategory, artworkCategoryIds, categoryLabel } from '@/services/artworkCategories';

import { Watermark } from '@/module/artwork/components/Watermark';
import ArtworkBorder from '@/components/ArtworkBorder';
import { ArtItem, FOR_YOU_DATA } from '@/module/home/types';
import { LinearGradient } from 'expo-linear-gradient';
import { Star } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';

interface ForYouGridProps {
  activeCategory: string;
  onSelect: (item: ArtItem, type: string) => void;
  items?: ArtItem[];
  webFiltered?: boolean;
  showHeading?: boolean;
}

function ArtCardItem({
  item,
  widthPercent,
  onSelect,
}: {
  item: any;
  widthPercent: string;
  onSelect: (item: ArtItem, type: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const badgeLift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(badgeLift, {
      toValue: isHovered ? -58 : 0,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [isHovered, badgeLift]);
  const isSold = Boolean(item.is_sold);

  // Type: Physical, Digital, or Auction
  const isAuction = String(item.sale_type || '').toUpperCase() === 'AUCTION';
  const typeLabel = isAuction
    ? 'Auction'
    : item.artType
    ? item.artType.charAt(0).toUpperCase() + item.artType.slice(1).toLowerCase()
    : 'Physical';

  const titleText = item.title || item.artist || 'Untitled';
  const artistLabel = item.artistName || item.artist_name || 'ArtFiliere Artist';
  const ratingVal = item.rating || item.artistRating || '5.0';
  const tagsList = Array.isArray(item.tags) ? item.tags.slice(0, 3) : [];
  const workCategories = artworkCategoryIds(item).map(categoryLabel);

  return (
    <Pressable
      style={[
        styles.gridCard,
        { width: widthPercent as any },
        isHovered && styles.gridCardHovered,
      ]}
      onPress={() => onSelect(item, item.type)}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
    >
      {/* Image with Watermark and Hover Description Overlay */}
      <View style={styles.imageWrapper}>
        <Watermark uri={item.image} height={280} />

        {isSold && (
          <View style={styles.soldOverlay}>
            <View style={styles.soldBadge}>
              <Text style={styles.soldText}>SOLD</Text>
            </View>
          </View>
        )}

        {/* Description when hovered */}
        {isHovered && (
          <LinearGradient
            colors={['transparent', 'rgba(20, 16, 16, 0.6)', 'rgba(20, 16, 16, 0.78)']}
            locations={[0, 0.4, 1]}
            style={styles.hoverCaptionContainer}
          >
            <Text style={styles.hoverCaptionText} numberOfLines={2}>
              {item.description || 'Authentic Philippine visual artwork piece.'}
            </Text>
          </LinearGradient>
        )}
        <Animated.View pointerEvents="none" style={[styles.typeBadge, { transform: [{ translateY: badgeLift }] }]}>
          <Text style={styles.typeBadgeText}>{typeLabel}</Text>
        </Animated.View>
      </View>

      <View style={styles.gridContent}>
        <Text style={styles.titleBold} numberOfLines={1}>{titleText}</Text>

        {/* Price */}
        <Text style={styles.gridPrice}>
          ₱ {Number(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </Text>

        {/* Tags */}
        {!!workCategories.length && <Text style={{ color: '#75655F', fontSize: 11, lineHeight: 16 }} numberOfLines={2}>Categories: {workCategories.join(' · ')}</Text>}
        <View style={styles.tagRow}>
          {tagsList.map((tag: string, index: number) => (
            <View key={index} style={styles.tagBadge}>
              <Text style={styles.tagText}>{String(tag).replace(/_/g, ' ')}</Text>
            </View>
          ))}
        </View>

        {/* Artist Name & Rating */}
        <View style={styles.artistRow}>
          <Text style={styles.artistName} numberOfLines={1}>
            {artistLabel}
          </Text>
          <View style={styles.ratingBox}>
            <Star size={13} color="#E67E22" fill="#E67E22" />
            <Text style={styles.ratingText}>{ratingVal}</Text>
          </View>
        </View>
      </View>
      <ArtworkBorder artType={item.artType || item.art_type || item.type} imageHeight={280} />
    </Pressable>
  );
}

export default function ForYouGrid({
  activeCategory,
  onSelect,
  items,
  webFiltered = false,
  showHeading = true,
}: ForYouGridProps) {
  const { width } = useWindowDimensions();
  const [gridPage, setGridPage] = useState(1);

  const numColumns = width > 768 ? 2 : 2;
  const itemsPerPage = numColumns * 2;

  const sourceItems = items ?? (webFiltered ? [] : FOR_YOU_DATA);
  const availableItems = sourceItems.filter(item =>
    String(item.sale_type || '').toUpperCase() !== 'AUCTION'
  );
  const filteredForYou =
    activeCategory === "All"
      ? availableItems
      : availableItems.filter((item) => matchesArtworkCategory(item, activeCategory));

  const pageCount = webFiltered ? Math.max(1, Math.ceil(filteredForYou.length / itemsPerPage)) : 5;
  useEffect(() => { if (webFiltered) setGridPage(1); }, [items, activeCategory, webFiltered]);
  useEffect(() => { setGridPage(page => Math.min(page, pageCount)); }, [pageCount]);
  
  return (
    <View style={styles.container}>
      {showHeading && <Text style={styles.sectionTitle}>Artworks For You</Text>}
      {webFiltered && !filteredForYou.length && <Text style={{ padding: 16, color: '#766C66' }}>No artwork matches your search and filters.</Text>}
      <View style={styles.grid}>
        {filteredForYou
          .slice((gridPage - 1) * itemsPerPage, gridPage * itemsPerPage)
          .map((item) => (
            <ArtCardItem key={item.id} item={item} widthPercent={`${100 / numColumns - 4}%`} onSelect={onSelect} />
          ))}
      </View>

      {/* PAGINATION */}
      <View style={styles.pagination}>
        <TouchableOpacity
          onPress={() => setGridPage(Math.max(1, gridPage - 1))}
        >
          <Text style={styles.pageArrow}>◀ prev</Text>
        </TouchableOpacity>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.pageDot, gridPage === p && styles.activePageDot]}
            onPress={() => setGridPage(p)}
          >
            <Text style={[styles.pageNum, gridPage === p && { color: "#fff" }]}>
              {p}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => setGridPage(Math.min(pageCount, gridPage + 1))}
        >
          <Text style={styles.pageArrow}>next ▶</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 20, flex: 1 },
  sectionTitle: {
    ...marketplaceHeading,
    marginHorizontal: 15,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  gridCard: {
    marginBottom: 28,
    marginTop: 18,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'visible',
    borderWidth: 1.5,
    borderColor: '#eee',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    cursor: Platform.OS === 'web' ? 'pointer' : undefined,
    transition: Platform.OS === 'web' ? 'all 0.2s ease-in-out' : undefined,
  } as any,
  gridCardHovered: {
    borderColor: '#F1948A',
    shadowColor: '#E74C3C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    transform: Platform.OS === 'web' ? [{ translateY: -3 }] : undefined,
  } as any,
  imageWrapper: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    backgroundColor: '#F8F9FA',
  },
  hoverCaptionContainer: {
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingTop: 18,
    paddingBottom: 8,
  },
  hoverCaptionText: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  soldOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(193, 86, 86, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  soldBadge: {
    backgroundColor: '#C15656',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
  },
  soldText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  gridContent: {
    padding: 12,
    gap: 3,
  },
  typeBadge: {
    position: 'absolute',
    bottom: 12,
    left: 24,
    zIndex: 2,
    borderRadius: 4,
    backgroundColor: '#C15656',
    paddingHorizontal: 7,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  titleBold: {
    marginBottom: 4,
    fontWeight: '700',
    fontSize: 18,
    color: '#2C3E50',
  },
  gridPrice: {
    fontWeight: '700',
    color: '#C15656',
    fontSize: 18,
    marginTop: 2,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  tagBadge: {
    backgroundColor: '#FDF2E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 11,
    color: '#D35400',
    fontWeight: '600',
  },
  artistRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F4F6F6',
  },
  artistName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7F8C8D',
    flex: 1,
    marginRight: 8,
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5D6D7E',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  pageArrow: {
    color: '#C15656',
    marginHorizontal: 12,
    fontWeight: 'bold',
    fontSize: 13,
  },
  pageDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  activePageDot: { backgroundColor: '#C15656' },
  pageNum: { fontSize: 13, fontWeight: 'bold', color: '#555' },
});
