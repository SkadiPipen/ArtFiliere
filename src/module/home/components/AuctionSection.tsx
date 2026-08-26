import { Clock } from 'lucide-react-native';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArtItem, AUCTION_DATA } from '@/module/home/types';

interface AuctionSectionProps {
  onSelect: (item: ArtItem, type: string) => void;
}

export default function AuctionSection({ onSelect }: AuctionSectionProps) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Auctions</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 15 }}>
        {AUCTION_DATA.map((item) => (
          <TouchableOpacity key={item.id} style={styles.artCard} onPress={() => onSelect(item, 'Auction')}>
            <Image source={{ uri: item.image }} style={styles.cardImg} />
            <View style={styles.timeBadge}>
              <Clock size={10} color="#fff" />
              <Text style={styles.timeText}> {item.time}</Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{item.artist}</Text>
              <Text style={styles.cardPrice}>₱ {item.price}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#C15656', margin: 15 },
  artCard: { width: 140, marginRight: 15, backgroundColor: '#fff', borderRadius: 10, elevation: 3, paddingBottom: 10 },
  cardImg: { width: '100%', height: 140, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  timeBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 5, flexDirection: 'row', alignItems: 'center' },
  timeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  cardInfo: { padding: 8 },
  cardName: { fontWeight: 'bold', fontSize: 12 },
  cardPrice: { color: '#C15656', fontWeight: 'bold' },
});
