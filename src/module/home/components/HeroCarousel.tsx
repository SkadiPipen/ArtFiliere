import { Text } from '@/components/Typography';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import API_URL from '@/services/api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';
import { auctionCountdown } from './AuctionSection';

type Slide = { id: string; kind: 'welcome' | 'popular' | 'artist' | 'auction'; badge: string; title: string; subtitle: string; artist_id?: number; ends_at?: string; artwork?: any };
const welcome: Slide = { id: 'welcome', kind: 'welcome', badge: 'A SPACE FOR ART', title: 'Welcome to ArtFiliere', subtitle: 'Discover original work. Meet artists. Bring your ideas to life.' };

export default function HeroCarousel({ onSelect }: { onSelect: (item: any, type: string) => void }) {
  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(Math.min(width, 1200));
  const [featured, setFeatured] = useState<Slide[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [paused, setPaused] = useState(false);
  const flatListRef = useRef<FlatList<Slide>>(null);
  const physicalIndex = useRef(0);
  const moving = useRef(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTransitionTimer = () => {
    if (transitionTimer.current !== null) clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
  };
  useEffect(() => () => clearTransitionTimer(), []);
  const isDesktop = width >= 768;
  const heroHeight = isDesktop ? 300 : 240;
  const slides = [...featured.filter(slide => slide.kind !== 'auction' || Date.parse(slide.ends_at || '') > now), welcome];
  // A second copy lets the last slide advance left into the first slide.
  // Once settled, reset to its identical original without an animation.
  const loopSlides = slides.length > 1 ? [...slides, ...slides] : slides;
  const slideKey = slides.map(slide => slide.id).join('|');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await readApiResponse(await fetch(`${API_URL}/api/users/artworks/featured/`));
        if (active && Array.isArray(result.slides)) setFeatured(result.slides);
      } catch { /* Keep the welcome slide, or the last successfully loaded artwork. */ }
    };
    void load();
    const refresh = setInterval(load, 60000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; clearInterval(refresh); clearInterval(tick); };
  }, []);

  const goTo = (index: number) => {
    if (moving.current || index === heroIndex) return;
    const steps = (index - heroIndex + slides.length) % slides.length;
    physicalIndex.current += steps;
    moving.current = true;
    setHeroIndex(index);
    const targetOffset = containerWidth * physicalIndex.current;
    flatListRef.current?.scrollToOffset({ offset: targetOffset, animated: true });
    clearTransitionTimer();
    // Some browsers omit momentum-end for programmatic smooth scrolling.
    transitionTimer.current = setTimeout(() => settle(targetOffset), 1200);
  };
  const settle = (offset: number) => {
    clearTransitionTimer();
    const page = Math.max(0, Math.min(loopSlides.length - 1, Math.round(offset / containerWidth)));
    const index = page % slides.length;
    physicalIndex.current = index;
    moving.current = false;
    setHeroIndex(index);
    if (page !== index) flatListRef.current?.scrollToOffset({ offset: containerWidth * index, animated: false });
  };
  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = setTimeout(() => goTo((heroIndex + 1) % slides.length), 4500);
    return () => clearTimeout(timer);
  }, [heroIndex, slides.length, paused, containerWidth]);
  useEffect(() => {
    clearTransitionTimer();
    const index = Math.min(heroIndex, slides.length - 1);
    physicalIndex.current = index;
    moving.current = false;
    setHeroIndex(index);
    flatListRef.current?.scrollToOffset({ offset: containerWidth * index, animated: false });
  }, [containerWidth, slideKey]);

  const openSlide = (slide: Slide) => {
    if (slide.kind === 'welcome') return;
    if (slide.kind === 'artist') { router.push({ pathname: '/artist-profile', params: { artistId: String(slide.artist_id) } }); return; }
    const artwork = slide.artwork;
    if (artwork) onSelect({ ...artwork, image: artwork.image_data, artistName: artwork.artist_name, artistId: artwork.artist_id }, slide.kind === 'auction' ? 'Auction' : 'Direct Sell');
  };

  return <View style={{ height: heroHeight, width: '100%', marginTop: 10, marginBottom: isDesktop ? 0 : 10 }}
    onLayout={event => setContainerWidth(Math.max(1, event.nativeEvent.layout.width))}>
    <FlatList ref={flatListRef} data={loopSlides} keyExtractor={(item, index) => `${item.id}-${index}`} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
      onScrollBeginDrag={() => { clearTransitionTimer(); moving.current = false; setPaused(true); }} onScrollEndDrag={() => setPaused(false)}
      onMomentumScrollEnd={event => settle(event.nativeEvent.contentOffset.x)}
      getItemLayout={(_, index) => ({ length: containerWidth, offset: containerWidth * index, index })}
      renderItem={({ item }) => <Pressable disabled={item.kind === 'welcome'} accessibilityRole={item.kind === 'welcome' ? undefined : 'button'} accessibilityLabel={`${item.badge}: ${item.title}. ${item.kind === 'artist' ? 'View artist' : item.kind === 'welcome' ? 'A space for art' : 'View artwork'}`}
        style={{ width: containerWidth, height: heroHeight, backgroundColor: '#F1E4DE', borderRadius: 12, overflow: 'hidden' }} onPress={() => openSlide(item)}>
        {item.artwork?.image_data ? <Image source={{ uri: item.artwork.image_data }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <><LinearGradient colors={['#E7C6BD', '#F9F1EB', '#F8F9FA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Image source={require('../../../../assets/images/logo.png')} resizeMode="contain" style={{ position: 'absolute', right: '5%', top: '8%', height: '76%', width: '30%', opacity: 0.7 }} /></>}
        <LinearGradient pointerEvents="none" colors={['rgba(248,249,250,0)', 'rgba(248,249,250,0.4)', '#F8F9FA']} locations={[0, 0.5, 1]} style={s.bottomFade} />
        <View style={[s.caption, { bottom: isDesktop ? 84 : 40, maxWidth: containerWidth - 48 }]}>
          <Text style={s.badge}>{item.badge}</Text>
          {item.kind === 'artist' && <Text style={s.artist} numberOfLines={1}>{item.subtitle}</Text>}
          <Text style={s.title} numberOfLines={2}>{item.title}</Text>
          {item.kind !== 'artist' && <Text style={s.subtitle} numberOfLines={2}>{item.subtitle}</Text>}
          {item.kind === 'auction' && <Text style={s.countdown}>{auctionCountdown(item.ends_at!, now)}</Text>}
          {item.kind !== 'welcome' && <Text style={s.action}>{item.kind === 'artist' ? 'Explore artist \u2192' : item.kind === 'auction' ? 'View auction \u2192' : 'View artwork \u2192'}</Text>}
        </View>
      </Pressable>} />
    {slides.length > 1 && <View style={s.dots}>{slides.map((slide, index) => <TouchableOpacity key={slide.id} accessibilityRole="button" accessibilityLabel={`Show ${slide.badge.toLowerCase()} slide`} accessibilityState={{ selected: index === heroIndex }} onPress={() => goTo(index)} style={s.dotTarget}><View style={[s.dot, index === heroIndex && s.activeDot]} /></TouchableOpacity>)}</View>}
  </View>;
}

const s = StyleSheet.create({
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
  caption: { position: 'absolute', left: 24, backgroundColor: 'rgba(255,255,255,0.92)', padding: 14, borderRadius: 12, gap: 4 },
  badge: { color: '#C15656', fontWeight: '700', fontSize: 10, letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: '700', color: '#382C26' },
  artist: { color: '#A24F41', fontWeight: '700', fontSize: 14 },
  subtitle: { color: '#65574E', fontSize: 12, lineHeight: 17 },
  countdown: { color: '#A33F45', fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  action: { color: '#A33F45', fontSize: 12, fontWeight: '700', marginTop: 3 },
  dots: { position: 'absolute', right: 24, bottom: 64, flexDirection: 'row' },
  dotTarget: { padding: 7 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#B5A6A0' },
  activeDot: { backgroundColor: '#BC5454', width: 20 },
});
