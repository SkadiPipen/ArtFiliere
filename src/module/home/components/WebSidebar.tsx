import { AuthContext } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import API_URL from '@/services/api';
import { Link, usePathname, type Href } from 'expo-router';
import { Clock, Compass, Flag, Home, PanelLeftClose, PanelLeftOpen, Plus, Settings, ShoppingCart, User, type LucideIcon } from 'lucide-react-native';
import { useContext, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

function NavItem({ label, href, icon: Icon, active, compact, count }: {
  label: string; href: Href; icon: LucideIcon; active: boolean; compact: boolean; count?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return <Link href={href} asChild>
    <Pressable accessibilityRole="link" accessibilityLabel={count ? `${label}, ${count} items` : label}
      accessibilityState={{ selected: active }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
      style={StyleSheet.flatten([s.item, compact && s.compactItem, active && s.activeItem,
        hovered && !active && s.hoverItem, focused && s.focusItem])}>
      <View><Icon size={21} strokeWidth={active ? 2.3 : 1.8} color={active ? '#A74646' : '#766C66'} />
        {compact && !!count && <View style={s.dot} />}</View>
      {!compact && <><Text style={[s.label, active && s.activeLabel]}>{label}</Text>
        {!!count && <View style={s.badge}><Text style={s.badgeText}>{count > 99 ? '99+' : count}</Text></View>}
        {active && !count && <View style={s.activeDot} />}</>}
    </Pressable>
  </Link>;
}

export default function WebSidebar({ compact: collapsed, onToggle }: { compact: boolean; onToggle: () => void }) {
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const minimized = collapsed && !sidebarHovered;
  const [compact, setCompact] = useState(collapsed);
  useEffect(() => {
    if (!minimized) { setCompact(false); return; }
    // Keep labels mounted while the panel closes, then restore the icon layout.
    const timer = setTimeout(() => setCompact(true), 180);
    return () => clearTimeout(timer);
  }, [minimized]);
  const pathname = usePathname();
  const { user } = useContext(AuthContext);
  const { cartItems } = useCart();
  const [profile, setProfile] = useState<{ role?: string; username?: string; first_name?: string } | null>(null);
  useEffect(() => {
    let active = true;
    setProfile(null);
    if (user) (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me/`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        if (response.ok) { const data = await response.json(); if (active) setProfile(data); }
      } catch { /* Basic navigation remains available while the API is offline. */ }
    })();
    return () => { active = false; };
  }, [user]);
  const artist = profile?.role === 'artist';
  const name = profile?.first_name || profile?.username || user?.displayName || 'Your account';
  const home = pathname === '/' || pathname === '/(home)';
  const item = (label: string, href: Href, icon: LucideIcon, active: boolean, count?: number) =>
    <NavItem key={label} {...{ label, href, icon, active, compact, count }} />;
  // Keep the page's reserved width stable while hover expansion overlays it.
  return <View style={{ width: collapsed ? 84 : 256, height: '100%', flexShrink: 0, zIndex: 20 }}>
  <Pressable onHoverIn={() => setSidebarHovered(true)} onHoverOut={() => setSidebarHovered(false)} style={[s.sidebar, { position: 'absolute', top: 0, bottom: 0, left: 0, width: minimized ? 84 : 256, overflow: 'hidden' }, { transitionProperty: 'width, box-shadow', transitionDuration: '180ms', transitionTimingFunction: 'ease-out' } as any, collapsed && sidebarHovered && { boxShadow: '8px 0 24px rgba(60,48,42,0.12)' }]} accessibilityLabel="Main navigation">
    <Link href="/(home)" asChild><Pressable accessibilityLabel="ArtFiliere home" style={StyleSheet.flatten([s.brand, { width: compact ? 84 : 256 }, compact && { justifyContent: 'center', paddingHorizontal: 0 }])}>
      <Image source={require('../../../../assets/images/logo.png')} style={s.brandMark} resizeMode="contain" accessibilityLabel="ArtFiliere logo" />
      {!compact && <View><Text style={s.brandName}>ArtFiliere</Text><Text style={s.brandCaption}>A space for art.</Text></View>}
    </Pressable></Link>
    <ScrollView style={{ flex: 1, width: compact ? 84 : 256 }} contentContainerStyle={s.links} showsVerticalScrollIndicator={false}>
      {!compact && <Text style={s.section}>DISCOVER</Text>}
      {item('Home', '/(home)', Home, home)}
      {item('Activities', '/(home)/activities', Clock, pathname === '/activities')}
      {item('Auctions', '/auction-dashboard', Compass, pathname === '/auction-dashboard')}
      <View style={s.divider} />
      {!compact && <Text style={s.section}>YOUR SPACE</Text>}
      {item('Cart', '/(home)/cart', ShoppingCart, pathname === '/cart', cartItems.length)}
      {item('Profile', '/(home)/profile', User, pathname === '/profile' || pathname === '/edit-profile')}
      {item('Settings', '/(home)/settings', Settings, pathname === '/settings')}
      {item('Reports & disputes', '/report-management', Flag, pathname === '/report-management')}
      {artist && <Link href="/artist-post" asChild><Pressable accessibilityLabel="Create an artwork listing"
        style={StyleSheet.flatten([s.create, compact && { paddingHorizontal: 0 }])}>
        <Plus size={21} color="#fff" />{!compact && <Text style={s.createLabel}>Create artwork</Text>}
      </Pressable></Link>}
    </ScrollView>
    <View style={[s.footer, { width: compact ? 84 : 256 }]}>
      <Link href="/(home)/profile" asChild><Pressable accessibilityLabel={`Open profile for ${name}`} style={StyleSheet.flatten([s.account, compact && { justifyContent: 'center' }])}>
        <View style={s.avatar}><Text style={s.initial}>{name.slice(0, 1).toUpperCase()}</Text></View>
        {!compact && <View style={{ flex: 1 }}><Text numberOfLines={1} style={s.accountName}>{name}</Text>
          <Text style={s.accountRole}>{artist ? 'Artist account' : 'Art enthusiast'}</Text></View>}
      </Pressable></Link>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={collapsed ? 'Keep navigation expanded' : 'Collapse navigation'}
        style={({ hovered }) => [s.collapse, hovered && s.hoverItem]}>
        {compact ? <PanelLeftOpen size={18} color="#766C66" /> : <>{collapsed ? <PanelLeftOpen size={18} color="#766C66" /> : <PanelLeftClose size={18} color="#766C66" />}<Text style={s.collapseLabel}>{collapsed ? 'Keep sidebar expanded' : 'Collapse sidebar'}</Text></>}
      </Pressable>
    </View>
  </Pressable></View>;
}

const s = StyleSheet.create({
  sidebar: { height: '100%', backgroundColor: '#FFFCF9', borderRightWidth: 1, borderRightColor: '#EEE5DE', flexShrink: 0 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingVertical: 30 },
  brandMark: { width: 40, height: 40 },
  brandName: { fontSize: 22, fontWeight: '800', color: '#3C302A', letterSpacing: -0.6 },
  brandCaption: { fontSize: 11, color: '#9C8678', marginTop: 3 },
  links: { paddingHorizontal: 14, paddingTop: 12, gap: 7, paddingBottom: 20 },
  section: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6, color: '#A29388', marginLeft: 13, marginBottom: 8 },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  compactItem: { justifyContent: 'center', paddingHorizontal: 0 },
  activeItem: { backgroundColor: '#F6E8E1' },
  hoverItem: { backgroundColor: '#F4EFEA' },
  focusItem: { borderColor: '#B65B50' },
  label: { flex: 1, fontSize: 14, fontWeight: '500', color: '#766C66' },
  activeLabel: { color: '#A74646', fontWeight: '700' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#B65B50' },
  dot: { position: 'absolute', right: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#B65B50', borderWidth: 1, borderColor: '#FFFCF9' },
  badge: { borderRadius: 8, minWidth: 24, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: '#B65B50', alignItems: 'center' },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  divider: { height: 1, backgroundColor: '#EEE5DE', marginHorizontal: 12, marginVertical: 16 },
  create: { minHeight: 46, marginTop: 22, flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#B65B50', borderRadius: 12, paddingHorizontal: 16 },
  createLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  footer: { borderTopWidth: 1, borderTopColor: '#EEE5DE', padding: 14, gap: 10 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0DED1', justifyContent: 'center', alignItems: 'center' },
  initial: { fontSize: 14, fontWeight: '700', color: '#8A5946' },
  accountName: { color: '#463A32', fontSize: 12, fontWeight: '700' },
  accountRole: { color: '#9C8678', fontSize: 11, marginTop: 3 },
  collapse: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', minHeight: 38, borderRadius: 8 },
  collapseLabel: { fontSize: 11, color: '#766C66' },
});
