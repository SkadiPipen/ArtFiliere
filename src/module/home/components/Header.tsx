import { CATEGORY_FILTERS } from '@/services/artworkCategories';
import { Text, TextInput } from '@/components/Typography';
import { useCart } from '@/context/CartContext';
import { CATEGORIES } from '@/module/home/types';
import { useRouter } from 'expo-router';
import { Bell, ChevronDown, Folder, Menu, Search, Settings, ShoppingCart, SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import useAccountHeaderPanels from './useAccountHeaderPanels';

interface HeaderProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  activeCategory: string;
  onSelectCategory: (category: string) => void;
}


export default function Header({ activeCategory, onSelectCategory, searchQuery, onSearchChange }: HeaderProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const webDesktop = Platform.OS === 'web' && isDesktop;
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const { openFiles, openNotifications, unreadCount, panels } = useAccountHeaderPanels();
  const [browseOpen, setBrowseOpen] = useState(false);
  const animValue = useState(() => new Animated.Value(0))[0];

  const handlePointerEnter = () => {
    setBrowseOpen(true);
    Animated.timing(animValue, {
      toValue: 1,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const handlePointerLeave = () => {
    Animated.timing(animValue, {
      toValue: 0,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) {
        setBrowseOpen(false);
      }
    });
  };

  const { cartItems } = useCart();
  const cartCount = cartItems.length;
  const searchSection = (
          <View style={[styles.searchSectionWrapper, !isDesktop && styles.mobileSearchWrapper]}>
          {webDesktop && (
            <View
              style={styles.browseDropdownContainer}
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeave}
            >
              <TouchableOpacity
                style={[styles.browseButton, browseOpen && styles.browseButtonActive]}
                activeOpacity={0.85}
              >
                <SlidersHorizontal size={15} color="#FFFFFF" />
                <Text style={styles.browseButtonText}>Browse art</Text>
                <ChevronDown
                  size={14}
                  color="#FFFFFF"
                  style={{
                    transform: [
                      {
                        rotate: animValue.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '180deg'],
                        }) as any,
                      },
                    ],
                  }}
                />
              </TouchableOpacity>

              {browseOpen && (
                <Animated.View
                  style={[
                    styles.browsePopover,
                    {
                      opacity: animValue,
                      transform: [
                        {
                          translateY: animValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-8, 0],
                          }),
                        },
                      ],
                      pointerEvents: browseOpen ? 'auto' : 'none',
                    } as any,
                  ]}
                >
                  <Text style={styles.popoverSectionLabel}>CATEGORIES</Text>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
                  {CATEGORY_FILTERS.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={styles.popoverItem}
                      onPress={() => {
                        onSelectCategory(cat);
                        handlePointerLeave();
                      }}
                    >
                      <Text
                        style={[
                          styles.popoverItemText,
                          activeCategory === (cat) && styles.popoverItemTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  </ScrollView>

                  <View style={styles.popoverDivider} />

                  <Text style={styles.popoverSectionLabel}>FILTERS</Text>
                  {["Digital", "Physical", "Trending"].map((filterName) => (
                    <TouchableOpacity
                      key={filterName}
                      style={styles.popoverItem}
                      onPress={() => { onSelectCategory(filterName); handlePointerLeave(); }}
                    >
                      <Text style={styles.popoverItemText}>{filterName}</Text>
                    </TouchableOpacity>
                  ))}
                </Animated.View>
              )}
            </View>
          )}

            <View id="marketplace-tour-search" style={[styles.searchBox, !isDesktop && styles.mobileSearchBox, webDesktop && styles.desktopSearchBox]}>
              <TextInput
                style={styles.input}
                placeholder="Search Artwork..."
                placeholderTextColor="#888"
                underlineColorAndroid="transparent"
                value={onSearchChange ? (searchQuery ?? '') : localSearchQuery}
                onChangeText={(query) => {
                  setLocalSearchQuery(query);
                  onSearchChange?.(query);
                }}
                accessibilityLabel="Search artwork by title, artist or tag"
              />
              <Search size={18} color="#555" />
            </View>
          </View>
  );

  return (
    <View style={[styles.header, isDesktop && styles.desktopHeader, webDesktop && styles.fullWidthHeader]}>
      <View style={[styles.innerContainer, isDesktop && styles.desktopInnerContainer, webDesktop && styles.fullWidthInnerContainer]}>
        <View style={[styles.topRow, !isDesktop && styles.mobileTopRow, webDesktop && styles.desktopRowSpacing]}>
          {!isDesktop && <Text style={styles.mobileBrand}>ArtFilier</Text>}
          {isDesktop && searchSection}

          <View style={[styles.headerIcons, !isDesktop && styles.mobileHeaderIcons]}>
            <TouchableOpacity id="marketplace-tour-files" accessibilityLabel="Your licenses and agreements" onPress={openFiles} style={!isDesktop ? styles.mobileIcon : undefined}>
              <Folder color="#fff" size={22} />
            </TouchableOpacity>

            {!webDesktop && isDesktop &&
            <TouchableOpacity onPress={() => router.push('/(home)/cart')} style={styles.notificationButton}>
              <ShoppingCart color="#fff" size={22} style={{ marginHorizontal: 12 }} />
              {cartCount > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text></View>}
            </TouchableOpacity>}

            <TouchableOpacity accessibilityLabel="Notifications" onPress={openNotifications} style={[styles.notificationButton, !isDesktop && styles.mobileIcon]}>
              <Bell color="#fff" size={22} style={{ marginHorizontal: isDesktop ? 12 : 0 }} />
              {unreadCount > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View>}
            </TouchableOpacity>

            {!webDesktop &&
            <TouchableOpacity accessibilityLabel="Settings" style={!isDesktop ? styles.mobileIcon : undefined} onPress={() => router.push('/(home)/settings')}>
              <Settings color="#fff" size={22} />
            </TouchableOpacity>}
          </View>
          {!isDesktop && searchSection}
        </View>

        <View style={[styles.categoryRow, isDesktop && styles.desktopCategoryRow, webDesktop && styles.desktopRowSpacing]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ paddingRight: 10 }}>
            {CATEGORIES.map((cat, i) => (
              <TouchableOpacity key={i} accessibilityRole="button" accessibilityState={{ selected: activeCategory === cat }} style={!isDesktop ? styles.mobileCategory : undefined} onPress={() => onSelectCategory(cat)}>
                <Text
                  style={[
                    styles.catText,
                    isDesktop && styles.desktopCatText,
                    activeCategory === cat && styles.activeCatText,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>


        </View>
      </View>

      {panels}
    </View>
  );
}


const styles = StyleSheet.create({
  mobileTopRow: { flexWrap: 'wrap', gap: 8 },
  mobileBrand: { flex: 1, color: '#FFFFFF', fontSize: 21, fontFamily: 'LoraSemiBold', fontWeight: '600' },
  mobileSearchWrapper: { flexBasis: '100%', width: '100%', flexGrow: 1, minWidth: 0 },
  mobileSearchBox: { height: 44, borderRadius: 22, minWidth: 0 },
  mobileHeaderIcons: { marginLeft: 0, gap: 2, flexShrink: 0 },
  mobileIcon: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  mobileCategory: { minHeight: 44, justifyContent: 'center' },
  header: { backgroundColor: '#C15656', width: '100%', alignItems: 'center', paddingVertical: 12, zIndex: 1000 },
  desktopHeader: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E9DDD6', paddingTop: 0, zIndex: 1000 },
  innerContainer: { width: '100%', maxWidth: 1200, paddingHorizontal: 15, zIndex: 1000 },
  desktopInnerContainer: { maxWidth: 1160, paddingHorizontal: 24, alignSelf: 'center' },
  fullWidthHeader: { paddingVertical: 0 },
  fullWidthInnerContainer: { maxWidth: '100%', paddingHorizontal: 0 },
  desktopNav: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#C15656', fontSize: 18, fontWeight: '800' },
  desktopLinks: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  desktopLink: { color: '#8A7C76', fontSize: 13, fontWeight: '600' },
  activeLink: { color: '#C15656', fontSize: 13, fontWeight: '800' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#463532', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#C15656',
    marginHorizontal: -15,
    paddingHorizontal: 15,
    paddingVertical: 8,
    zIndex: 1001,
  },
  searchBox: { flex: 1, backgroundColor: '#fff', borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 38, borderWidth: 0 },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: '#000',
    paddingVertical: 0,
    borderWidth: 0,
    ...Platform.select({
      web: {
        outlineWidth: 0,
      },
    }),
  },
  notificationButton: { position: 'relative' },
  notificationBadge: { position: 'absolute', top: -5, right: 5, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1, borderColor: '#FFFFFF' },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  desktopCategoryRow: {
    marginTop: 0,
    paddingVertical: 8,
    backgroundColor: '#F8EEE9',
    marginHorizontal: -15,
    paddingHorizontal: 15,
  },
  desktopRowSpacing: { marginHorizontal: 0, paddingHorizontal: 16 },
  catText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginRight: 20, fontWeight: '500', paddingBottom: 4 },
  desktopCatText: { color: '#A45B52', backgroundColor: '#EADBD4', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 4, marginRight: 8, fontSize: 12 },
  activeCatText: { color: '#fff', fontWeight: 'bold', borderBottomWidth: 2, borderBottomColor: '#fff' },
  verticalDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.4)', marginRight: 12 },
  searchSectionWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2000,
  },
  browseDropdownContainer: {
    position: 'relative',
    marginLeft: 0,
    zIndex: 3000,
    paddingBottom: 8,
    marginBottom: -8,
  },
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    paddingLeft: 0, // Keeps icon and text flush to the container start
    paddingRight: 10,
    height: 44,
    borderWidth: 0,
    cursor: Platform.OS === 'web' ? ('pointer' as any) : undefined,
  },
  headerIcons: {
    flexDirection: 'row',
    marginLeft: 16,
    marginRight: 0, // Sits flush with the carousel's right edge
    alignItems: 'center',
  },
  browseButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  browseButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  browsePopover: {
    position: 'absolute',
    top: 40,
    left: 0,
    width: 250,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#EFE3DC',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9999,
    zIndex: 9999,
    ...Platform.select({
      web: {
        boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.18)',
      },
    }),
  },
  popoverSectionLabel: {
    color: '#A08E88',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  popoverItem: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    cursor: Platform.OS === 'web' ? ('pointer' as any) : undefined,
  },
  popoverItemText: {
    color: '#3A2E2B',
    fontSize: 13,
    fontWeight: '500',
  },
  popoverItemTextActive: {
    color: '#C15656',
    fontWeight: '700',
  },
  popoverDivider: {
    height: 1,
    backgroundColor: '#F3EAE4',
    marginVertical: 8,
    marginHorizontal: 4,
  },
  desktopSearchBox: {
    flexGrow: 0,
    flexShrink: 0,
    width: 320,
    minWidth: 400,
    height: 42,
    borderRadius: 21,
    marginRight: 16,
  },
});

