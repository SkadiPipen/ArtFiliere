import { Text } from '@/components/Typography';
import ProfileCover from '@/components/ProfileCover';
import * as Linking from 'expo-linking';
import { Copy, Share2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Artist = { id: number | string; name?: string; username: string; bio?: string; cover_image?: string };
export default function ArtistShareCard({ artist, avatarUri, onClose }: { artist: Artist; avatarUri: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const url = Linking.createURL(`/artist/${encodeURIComponent(artist.username)}`);
  const copy = async () => {
    setFeedback('');
    try {
      if (!navigator.clipboard?.writeText) throw Error('Select and copy the profile link below.');
      await navigator.clipboard.writeText(url);
      setFeedback('Profile link copied.');
    } catch { setFeedback('Select and copy the profile link below.'); }
  };
  const share = async () => {
    setBusy(true); setFeedback('');
    try {
      const title = `${artist.name || artist.username} on ArtFiliere`;
      if (Platform.OS === 'web') {
        if (navigator.share) await navigator.share({ title, text: `Explore @${artist.username} on ArtFiliere`, url });
        else await copy();
      } else await Share.share({ title, message: `${title}\n${url}`, ...(Platform.OS === 'ios' ? { url } : {}) });
    } catch (error: any) { if (error.name !== 'AbortError') setFeedback('Unable to share. You can use the profile link below.'); }
    finally { setBusy(false); }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={s.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close artist share card" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[s.card, { width: Math.min(350, width - 32), top: insets.top + 72, right: 16, maxHeight: Math.max(180, height - insets.top - insets.bottom - 96) }]}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.cover}><ProfileCover uri={artist.cover_image} /><Pressable accessibilityRole="button" accessibilityLabel="Close share card" onPress={onClose} style={s.close}><X size={18} color="#62493E" /></Pressable></View>
          <View style={s.identity}>
            <Image source={{ uri: avatarUri }} accessibilityLabel={`${artist.name || artist.username} profile photo`} style={s.avatar} />
            <Text style={s.name}>{artist.name || artist.username}</Text>
            <Text style={s.handle}>@{artist.username}</Text>
            <Text style={s.bio}>{artist.bio?.trim() || 'This artist has not added a bio yet.'}</Text>
          </View>
          <View style={s.footer}>
            <Text style={s.label}>Share Artist Profile</Text>
            <Text selectable accessibilityLabel="Artist profile link" style={s.url}>{url}</Text>
            <View style={s.actions}>
              {Platform.OS === 'web' && <Pressable accessibilityRole="button" disabled={busy} onPress={copy} style={s.copy}><Copy size={16} color="#A84B46" /><Text style={s.copyText}>Copy Link</Text></Pressable>}
              <Pressable accessibilityRole="button" disabled={busy} onPress={share} style={[s.share, busy && { opacity: 0.5 }]}><Share2 size={16} color="#FFF" /><Text style={s.shareText}>{busy ? 'Sharing...' : 'Share'}</Text></Pressable>
            </View>
            {!!feedback && <Text accessibilityLiveRegion="polite" style={s.feedback}>{feedback}</Text>}
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(50,35,30,0.12)' },
  card: { position: 'absolute', backgroundColor: '#FFFCFA', borderRadius: 16, borderWidth: 1, borderColor: '#E5DAD3', overflow: 'hidden', shadowColor: '#3A2D2A', shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  content: { paddingBottom: 18 }, cover: { height: 78, backgroundColor: '#F5E8E3' }, close: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  identity: { paddingHorizontal: 20, gap: 5 }, avatar: { width: 66, height: 66, borderRadius: 33, borderWidth: 3, borderColor: '#FFFFFF', marginTop: -28, marginBottom: 3, backgroundColor: '#F5E8E3' },
  name: { fontSize: 20, fontFamily: 'LoraSemiBold', fontWeight: '600', color: '#3A2D2A' }, handle: { fontSize: 13, fontWeight: '600', color: '#A84B46' }, bio: { fontSize: 13, lineHeight: 19, color: '#786862', marginTop: 3 },
  footer: { marginTop: 16, marginHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EFE1DC', gap: 10 }, label: { fontSize: 12, fontWeight: '700', color: '#5A4944' }, url: { fontSize: 12, lineHeight: 18, color: '#A84B46', backgroundColor: '#F5E8E3', padding: 10, borderRadius: 8 },
  actions: { flexDirection: 'row', gap: 8 }, copy: { flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 8, backgroundColor: '#F5E8E3' }, copyText: { fontSize: 12, fontWeight: '700', color: '#A84B46' }, share: { flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 8, backgroundColor: '#BC5555' }, shareText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' }, feedback: { fontSize: 12, color: '#786862' },
});
