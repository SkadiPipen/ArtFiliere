import SignaturePad, { Strokes } from './SignaturePad';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, View, Text, TextInput, TouchableOpacity, Platform, Image } from 'react-native';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { contractRequest } from './contracts';

export default function SigningModal({ id, onClose, onSigned }: { id: number; onClose: () => void; onSigned: () => void | Promise<void> }) {
  const [data, setData] = useState<any>(null);
  const [strokes, setStrokes] = useState<Strokes>([]);
  const [signatureImage, setSignatureImage] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const hasSignature = mode === 'draw' ? strokes.length > 0 : !!signatureImage;
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null); setName('');
    contractRequest(`${id}/sign/`).then(result => {
      if (!active) return;
      setData(result);
      setName(result[`${result.my_role}_signature`] || result.signing_name || '');
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id]);
  const signed = data && data[`${data.my_role}_signed_at`] && data[`${data.my_role}_signature_image`];
  const preview = async () => {
    try {
      const response = await fetch(`${API_URL}/api/users/contracts/${id}/pdf/`, { headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` } });
      if (!response.ok) throw new Error('Unable to generate agreement PDF.');
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const FileSystem = await import('expo-file-system/legacy');
        const Sharing = await import('expo-sharing');
        const path = `${FileSystem.cacheDirectory}agreement-${id}.pdf`;
        await FileSystem.downloadAsync(`${API_URL}/api/users/contracts/${id}/pdf/`, path, { headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` } });
        await Sharing.shareAsync(path, { mimeType: 'application/pdf' });
      }
    } catch (e: any) { setError(e.message); }
  };
  const upload = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 1 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64 || (asset.mimeType && asset.mimeType !== 'image/png') || !asset.base64.startsWith('iVBOR')) throw new Error('Choose a transparent PNG signature.');
      setSignatureImage(`data:image/png;base64,${asset.base64}`); setError('');
    } catch (e: any) { setError(e.message); }
  };
  const sign = async () => {
    setBusy(true); setError('');
    try { setData(await contractRequest(`${id}/sign/`, 'POST', { signature: name, consent, ...(mode === 'draw' ? { signature_strokes: strokes } : { signature_image: signatureImage }), document_hash: data.document_hash })); await onSigned(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <ScrollView scrollEnabled={!drawing} contentContainerStyle={{ padding: 24, paddingTop: 50, gap: 16, maxWidth: 800, width: '100%', alignSelf: 'center' }}>
      <TouchableOpacity onPress={onClose}><Text>Close</Text></TouchableOpacity>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Art Licensing Agreement</Text>
      {!!error && <Text style={{ color: '#b00020' }}>{error}</Text>}
      {!data ? <Text>Loading agreement...</Text> : <>
        <Text selectable style={{ lineHeight: 24 }}>{data.document}</Text>
        <Text>Artist: {data.artist_signature || 'Awaiting signature'}</Text>
        <Text>Buyer: {data.buyer_signature || 'Awaiting signature'}</Text>
        {data.fully_signed && <Text selectable style={{ color: '#5D8A63', fontWeight: '800' }}>Verification code: {data.verification_code}</Text>}
        {['artist', 'buyer'].map(role => data[`${role}_signature_image`] ? <View key={role}><Text>{role} signature</Text><Image source={{ uri: data[`${role}_signature_image`] }} style={{ width: 240, height: 80 }} resizeMode="contain" /></View> : null)}
        <TouchableOpacity onPress={preview}><Text style={{ color: '#C15656' }}>Preview / download PDF</Text></TouchableOpacity>
        {signed ? <Text>{data.fully_signed ? 'Both parties have signed. You can close this window and continue checkout.' : 'Your signature is saved. Waiting for the other party to sign.'}</Text> : <>
          <Text>Sign as {data.my_role}</Text>
          <TextInput accessibilityLabel="Full name signature" value={name} onChangeText={setName} placeholder="Enter your full name" maxLength={200} style={{ borderWidth: 1, padding: 12, borderRadius: 8 }} />
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <TouchableOpacity onPress={() => { if (mode !== 'draw') setStrokes([]); setMode('draw'); }}><Text>{mode === 'draw' ? '[x] ' : ''}Draw signature</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('upload')}><Text>{mode === 'upload' ? '[x] ' : ''}Upload PNG</Text></TouchableOpacity>
          </View>
          {mode === 'draw' ? <SignaturePad onChange={setStrokes} onDrawing={setDrawing} /> : <View>
            <TouchableOpacity onPress={upload}><Text style={{ color: '#C15656', padding: 12 }}>Choose transparent PNG (up to 2 MB)</Text></TouchableOpacity>
            {!!signatureImage && <Image source={{ uri: signatureImage }} style={{ width: '100%', height: 130 }} resizeMode="contain" />}
          </View>}
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(!consent)}><Text>{consent ? '[x]' : '[ ]'} I have reviewed this agreement and agree to sign it electronically using the signature shown above.</Text></TouchableOpacity>
          <TouchableOpacity disabled={busy || !consent || !hasSignature || name.trim().length < 2} onPress={sign} style={{ padding: 14, backgroundColor: '#C15656', borderRadius: 8, opacity: busy || !consent ? 0.5 : 1 }}><Text style={{ color: '#fff' }}>{busy ? 'Signing...' : 'Sign agreement'}</Text></TouchableOpacity>
        </>}
      </>}
    </ScrollView>
  </Modal>;
}
