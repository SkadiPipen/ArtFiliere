import ArtworkBorder from '@/components/ArtworkBorder';
import ProductImage from '@/components/ProductImage';
import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

type AuctionCardItem = {
  title?: string;
  artist_name?: string;
  description?: string;
  is_physical?: boolean;
  current_bid?: number | string;
};

export default function AuctionArtworkCard({ item, image, countdown, ended = false, compact = false, style, onPress }: {
  item: AuctionCardItem;
  image: ImageSourcePropType;
  countdown: string;
  ended?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const preview = hovered || focused;
  const imageHeight = compact ? 96 : 190;
  const description = item.description?.trim() || 'Explore this artwork and its published auction terms.';
  return <Pressable accessibilityRole="button" accessibilityLabel={`View auction: ${item.title || 'Untitled artwork'}`} accessibilityHint={description}
    onPress={onPress} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={[s.card, style, preview && s.hovered]}>
    <View style={s.imageWrapper}>
      <ProductImage source={image} style={{ width: '100%', height: imageHeight }} resizeMode="cover" />
      {!compact && <View style={[s.timer, ended && s.timerEnded]}>
        <Ionicons name="time-outline" size={12} color={ended ? '#B74F50' : '#4A403B'} />
        <Text style={[s.timerText, ended && { color: '#B74F50' }]}>{ended ? 'Ended' : countdown}</Text>
      </View>}
      {preview && <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(20,16,16,0.6)', 'rgba(20,16,16,0.78)']} locations={[0, 0.4, 1]} style={s.caption}>
        <Text style={[s.captionText, compact && { fontSize: 10, lineHeight: 13 }]} numberOfLines={2}>{description}</Text>
      </LinearGradient>}
      <View pointerEvents="none" style={[s.typeBadge, compact ? s.compactTypeBadge : s.regularTypeBadge, !compact && preview && { bottom: 62 }]}>
        <Text style={s.typeText}>{item.is_physical ? 'Physical' : 'Digital'}</Text>
      </View>
    </View>
    <View style={[s.body, compact && s.compactBody]}>
      {compact ? <>
        <View style={s.countdown}><Ionicons name="time-outline" size={12} color="#B74F50" /><Text style={s.countdownText}>{countdown}</Text></View>
        <Text style={s.compactArtist} numberOfLines={1}>{item.artist_name || 'Artist'}</Text>
        <Text style={s.compactPrice}>₱ {Number(item.current_bid || 0).toLocaleString()}</Text>
      </> : <>
        <Text style={s.title} numberOfLines={1}>{item.title}</Text>
        <Text style={s.priceLabel}>{ended ? 'Final bid' : 'Current bid'}</Text>
        <Text style={s.price}>₱ {Number(item.current_bid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
        <View style={s.artistRow}><Text style={s.artist} numberOfLines={1}>{item.artist_name || 'Artist'}</Text></View>
      </>}
    </View>
    <ArtworkBorder artType={item.is_physical ? 'physical' : 'digital'} imageHeight={imageHeight} />
  </Pressable>;
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'visible', borderWidth: 1.5, borderColor: '#EEEEEE', elevation: 2,
    shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 180ms ease-out, box-shadow 180ms ease-out' } : {}),
  } as ViewStyle,
  hovered: { borderColor: '#F1948A', shadowColor: '#E74C3C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
    ...(Platform.OS === 'web' ? { transform: [{ translateY: -3 }] } : {}),
  },
  imageWrapper: { position: 'relative', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', backgroundColor: '#F0F0F0' },
  timer: { position: 'absolute', left: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 0.5, borderColor: '#E5E5E5' },
  timerEnded: { backgroundColor: '#FFF0F0', borderColor: '#F5C6CB' },
  timerText: { color: '#4A403B', fontSize: 10, fontWeight: '700' },
  typeBadge: { position: 'absolute', alignSelf: 'flex-start', backgroundColor: '#C15656', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  regularTypeBadge: { bottom: 12, left: 12 },
  compactTypeBadge: { top: 8, left: 8, paddingHorizontal: 5, paddingVertical: 2 },
  typeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  caption: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 22, paddingBottom: 9, paddingHorizontal: 10 },
  captionText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  body: { padding: 12, gap: 5 },
  title: { fontSize: 18, fontWeight: '700', color: '#34475A' },
  priceLabel: { fontSize: 9, color: '#88746B', textTransform: 'uppercase', marginTop: 4 },
  price: { fontSize: 18, fontWeight: '700', color: '#C15656' },
  artistRow: { marginTop: 7, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F2ECE8' },
  artist: { color: '#849294', fontSize: 12 },
  compactBody: { padding: 8, gap: 3 },
  countdown: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, backgroundColor: '#FBE9E5', borderWidth: 1, borderColor: '#E8C3B8', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 4, marginBottom: 3 },
  countdownText: { color: '#B74F50', fontSize: 11, fontWeight: '700' },
  compactArtist: { color: '#75655F', fontSize: 11 },
  compactPrice: { color: '#C15656', fontSize: 12, fontWeight: '700' },
});
