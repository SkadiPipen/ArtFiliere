import { Text } from '@/components/Typography';
import { marketplaceHeading } from '@/constants/marketplaceTypography';
import { Clock } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArtItem } from "@/module/home/types";
import ArtworkBorder from '@/components/ArtworkBorder';

interface AuctionSectionProps {
  onSelect: (item: ArtItem, type: string) => void;
  items: ArtItem[];
}

export function auctionCountdown(target: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(target) - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days ? `${days}d ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function AuctionSection({ onSelect, items }: AuctionSectionProps) {
  const [now, setNow] = useState(Date.now);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const auctions = items.filter(item => String(item.sale_type || '').toUpperCase() === 'AUCTION'
    && Date.parse(item.end_time || '') > now && !item.is_sold);
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.sectionTitle}>Auctions</Text>
      {!auctions.length && <Text style={{ marginHorizontal: 15, color: '#766C66' }}>No current auctions.</Text>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 12 }}
      >
        {auctions.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.artCard, hoveredId === item.id && styles.artCardHovered]}
            onHoverIn={() => setHoveredId(item.id)}
            onHoverOut={() => setHoveredId(null)}
            accessibilityRole="button"
            accessibilityLabel={`View auction: ${item.artist}`}
            onPress={() => onSelect(item, "Auction")}
          >
            <View style={styles.imageWrapper}>
              <Image source={{ uri: item.image }} style={styles.cardImg} />
              {hoveredId === item.id && <LinearGradient
                colors={['transparent', 'rgba(20, 16, 16, 0.6)', 'rgba(20, 16, 16, 0.78)']}
                locations={[0, 0.4, 1]}
                style={styles.hoverCaptionContainer}
              >
                <Text style={styles.hoverCaptionText} numberOfLines={2}>
                  {item.description || 'Authentic Philippine visual artwork piece.'}
                </Text>
              </LinearGradient>}
            </View>
            <View style={styles.timeBadge}>
              <Clock size={10} color="#fff" />
              <Text style={styles.timeText}> {item.starting_time && Date.parse(item.starting_time) > now
                ? `Starts in ${auctionCountdown(item.starting_time, now)}`
                : `Ends in ${auctionCountdown(item.end_time!, now)}`}</Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName} numberOfLines={1}>{item.artist}</Text>
              <Text style={styles.cardPrice}>₱ {Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            </View>
            <ArtworkBorder artType={item.artType || item.type} imageHeight={190} />
          </Pressable>
        ))}
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
    width: 220,
    marginRight: 28,
    backgroundColor: "#fff",
    borderRadius: 20,
    elevation: 3,
    paddingBottom: 10,
    borderWidth: 1.5,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    cursor: Platform.OS === 'web' ? 'pointer' : undefined,
    transition: Platform.OS === 'web' ? 'all 0.2s ease-in-out' : undefined,
  } as any,
  artCardHovered: {
    borderColor: '#F1948A',
    shadowColor: '#E74C3C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    transform: Platform.OS === 'web' ? [{ translateY: -3 }] : undefined,
  },
  imageWrapper: { position: 'relative', overflow: 'hidden', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  hoverCaptionContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 10, paddingTop: 18, paddingBottom: 8, alignItems: 'center', justifyContent: 'center' },
  hoverCaptionText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '500', textAlign: 'center' },
  cardImg: {
    width: "100%",
    height: 190,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  timeBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 4,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  timeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  cardInfo: { padding: 8 },
  cardName: { fontWeight: "bold", fontSize: 12 },
  cardPrice: { color: "#C15656", fontWeight: "bold" },
});
