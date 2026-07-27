import { useRouter } from 'expo-router';
import { Bell, Folder, Menu, Search, Settings } from 'lucide-react-native';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CATEGORIES } from './types';

interface HeaderProps {
  activeCategory: string;
  onSelectCategory: (category: string) => void;
}

export default function Header({ activeCategory, onSelectCategory }: HeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <View style={styles.innerContainer}>
        <View style={styles.topRow}>
          <View style={styles.searchBox}>
            <TextInput style={styles.input} placeholder="Search Artwork..." placeholderTextColor="#888" />
            <Search size={18} color="#555" />
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={() => Alert.alert('Cart', 'Opening Cart...')}>
              <Folder color="#fff" size={22} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Alert.alert('Notifications', 'No new alerts')}>
              <Bell color="#fff" size={22} style={{ marginHorizontal: 12 }} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(home)/settings')}>
              <Settings color="#fff" size={22} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.categoryRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 10 }}>
            {CATEGORIES.map((cat, i) => (
              <TouchableOpacity key={i} onPress={() => onSelectCategory(cat)}>
                <Text
                  style={[
                    styles.catText,
                    activeCategory === cat && styles.activeCatText,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.verticalDivider} />
          <TouchableOpacity onPress={() => Alert.alert('Filter', 'Opening advanced filters...')}>
            <Menu color="#fff" size={22} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: '#C15656', width: '100%', alignItems: 'center', paddingVertical: 12 },
  innerContainer: { width: '100%', maxWidth: 1200, paddingHorizontal: 15 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  searchBox: { flex: 1, backgroundColor: '#fff', borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 38 },
  input: { flex: 1, fontSize: 14, color: '#000', paddingVertical: 0 },
  headerIcons: { flexDirection: 'row', marginLeft: 15, alignItems: 'center' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  catText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginRight: 20, fontWeight: '500', paddingBottom: 4 },
  activeCatText: { color: '#fff', fontWeight: 'bold', borderBottomWidth: 2, borderBottomColor: '#fff' },
  verticalDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.4)', marginRight: 12 },
});