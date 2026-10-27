import { Text } from '@/components/Typography';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ImageIcon } from 'lucide-react-native';

export default function ArtworkPreview({ uri, title }: { uri?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return <View style={s.frame} accessibilityLabel={`Watermarked preview of ${title}`}>
    {uri && !failed ? <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} onError={() => setFailed(true)} /> : <ImageIcon size={28} color="#BD8D7C" />}
    <View pointerEvents="none" style={s.watermark}><Text style={s.brand}>ArtFilier</Text></View>
    <View pointerEvents="none" style={s.label}><Text style={s.labelText}>PREVIEW</Text></View>
  </View>;
}
const s = StyleSheet.create({
  frame: { width: 70, height: 80, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F1E8E1', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  watermark: { position: 'absolute', transform: [{ rotate: '-28deg' }], backgroundColor: 'rgba(44,25,20,0.3)', paddingVertical: 4, width: 130, alignItems: 'center' },
  brand: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  label: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(35,22,18,0.6)', paddingVertical: 3, alignItems: 'center' },
  labelText: { color: '#FFF', fontSize: 8, fontWeight: '700', letterSpacing: 1.5 },
});
