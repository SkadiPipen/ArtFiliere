import ProductImage from '@/components/ProductImage';
import { Text, TextInput } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import * as ImagePicker from 'expo-image-picker';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type Purchase = { id: number | string; title: string; artist: string; image?: string; is_commission?: boolean; commission_id?: number };
export default function PurchaseRatingCard({ purchase, onSaved }: { purchase: Purchase; onSaved: () => Promise<void> }) {
  const [artist, setArtist] = useState(0), [artwork, setArtwork] = useState(0);
  const [expanded, setExpanded] = useState(false), [comment, setComment] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [picking, setPicking] = useState(false), [error, setError] = useState('');
  const pick = async () => {
    setPicking(true); setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 3 - images.length, base64: true, quality: 0.6 });
      if (result.canceled) return;
      const selected = result.assets.map(asset => {
        if (!asset.base64 || asset.base64.length > 1400000) throw Error('Choose smaller photos (up to 1 MB each).');
        return `data:image/${asset.base64.startsWith('iVBOR') ? 'png' : 'jpeg'};base64,${asset.base64}`;
      });
      setImages(current => [...current, ...selected].slice(0, 3));
    } catch (e: any) { setError(e.message || 'Unable to select photos.'); }
    finally { setPicking(false); }
  };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await purchaseRequest(purchase.is_commission ? `commissions/${purchase.commission_id}/review/` : `purchases/${purchase.id}/review/`, 'POST', { artist_rating: artist, artwork_rating: artwork, comment, images });
      await onSaved();
    } catch (e: any) { setError(e.message || 'Unable to submit your review.'); }
    finally { setBusy(false); }
  };
  const stars = (label: string, value: number, change: (n: number) => void) => <View style={s.rating}>
    <Text style={s.label}>{label}</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={s.stars}>
      {[1, 2, 3, 4, 5].map(n => <TouchableOpacity key={n} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: value === n, disabled: busy }} accessibilityLabel={`${label}: ${n} ${n === 1 ? 'star' : 'stars'}`} onPress={() => change(n)} style={s.starTouch}>
        <Text style={[s.star, { color: n <= value ? '#BC5555' : '#B9ABA5' }]}>{n <= value ? '★' : '☆'}</Text>
      </TouchableOpacity>)}
    </View>
  </View>;
  return <View style={s.card}>
    <View style={s.summary}>
      {purchase.image ? <ProductImage accessibilityLabel={purchase.title} source={{ uri: purchase.image }} style={s.thumbnail} resizeMode="contain" /> : <View style={[s.thumbnail, s.placeholder]}><Text>No image</Text></View>}
      <View style={s.details}><Text style={s.title}>{purchase.title}</Text><Text style={s.artist}>by {purchase.artist}</Text></View>
    </View>
    {stars('Rate artist', artist, setArtist)}
    {stars('Rate artwork', artwork, setArtwork)}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} disabled={busy} onPress={() => setExpanded(value => !value)} style={s.reviewButton}><Text style={s.accent}>{expanded ? 'Hide review' : 'Review'}</Text></TouchableOpacity>
    {expanded && <View style={s.editor}>
      <Text style={s.label}>Write a review (optional)</Text>
      <TextInput accessibilityLabel={`Review for ${purchase.title}`} editable={!busy} multiline maxLength={2000} placeholder="Share your experience with the artist and artwork…" value={comment} onChangeText={setComment} style={s.input} />
      <Text style={s.artist}>Add up to 3 photos, 1 MB each (optional).</Text>
      <View style={s.photos}>{images.map((uri, index) => <View key={index} style={s.photo}><ProductImage source={{ uri }} style={s.preview} /><TouchableOpacity accessibilityRole="button" disabled={busy || picking} accessibilityLabel={`Remove photo ${index + 1}`} hitSlop={8} style={s.removePhoto} onPress={() => setImages(current => current.filter((_, i) => i !== index))}><X size={14} color="#FFFFFF" /></TouchableOpacity></View>)}</View>
      <TouchableOpacity accessibilityRole="button" disabled={busy || picking || images.length >= 3} onPress={pick} style={[s.reviewButton, (picking || images.length >= 3) && s.disabled]}><Text style={s.accent}>{picking ? 'Adding photos…' : 'Add photos'}</Text></TouchableOpacity>
      {images.length > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove all review photos" disabled={busy || picking} onPress={() => setImages([])} style={s.removeAll}><Text style={s.accent}>Remove all</Text></TouchableOpacity>}
    </View>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <TouchableOpacity accessibilityRole="button" disabled={busy || picking || !artist || !artwork} onPress={submit} style={[s.submit, (busy || picking || !artist || !artwork) && s.disabled]}><Text style={s.white}>{busy ? 'Submitting…' : 'Submit ratings'}</Text></TouchableOpacity>
  </View>;
}
const s = StyleSheet.create({
  card: { padding: 18, gap: 14, backgroundColor: '#FFFCFA', borderWidth: 1, borderColor: '#EFE1DC', borderRadius: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#EFE1DC' },
  thumbnail: { width: 76, height: 76, borderRadius: 8, backgroundColor: '#F5E8E3' },
  placeholder: { alignItems: 'center', justifyContent: 'center' }, details: { flex: 1, gap: 5 },
  title: { fontSize: 17, fontWeight: '700', color: '#3A2D2A' }, artist: { color: '#786862', fontSize: 13 },
  rating: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { color: '#3A2D2A', fontWeight: '600' }, stars: { flexDirection: 'row' }, starTouch: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, star: { fontSize: 30 },
  reviewButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#BC5555', paddingVertical: 9, paddingHorizontal: 18, borderRadius: 8 },
  accent: { color: '#A84B46', fontWeight: '600' }, editor: { gap: 12 },
  input: { minHeight: 110, textAlignVertical: 'top', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DCC9C1', borderRadius: 8, padding: 12 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, photo: { position: 'relative' }, preview: { width: 80, height: 80, borderRadius: 8 },
  removePhoto: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: '#A84B46', borderWidth: 1, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  removeAll: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 2 },
  submit: { backgroundColor: '#BC5555', padding: 12, borderRadius: 8, alignItems: 'center' }, white: { color: '#FFF', fontWeight: '700' }, disabled: { opacity: 0.45 }, error: { color: '#B91C1C' },
});
