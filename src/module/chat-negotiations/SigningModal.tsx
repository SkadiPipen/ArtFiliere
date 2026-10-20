import SignaturePad, { Strokes } from './SignaturePad';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, View, Text, TextInput, TouchableOpacity, Platform, Image, StyleSheet } from 'react-native';
import { Check, FileText, PenLine, ShieldCheck, Upload, X } from 'lucide-react-native';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import AgreementPaper from '@/module/messages/components/AgreementPaper';
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
  const [authority, setAuthority] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null); setName(''); setConsent(false); setAuthority(false);
    contractRequest(`${id}/sign/`).then(result => {
      if (!active) return;
      setData(result);
      setName(result[`${result.my_role}_signature`] || result.signing_name || '');
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id]);
  const signed = data && data[`${data.my_role}_signed_at`] && data[`${data.my_role}_signature_image`];
  useEffect(() => {
    if (!data || data.fully_signed || (!signed && data.can_sign !== false)) return;
    let active = true;
    const timer = setInterval(() => {
      contractRequest(`${id}/sign/`).then(result => { if (active) setData(result); }).catch(() => {});
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [id, !!signed, !!data?.fully_signed, data?.can_sign]);
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
    try { setData(await contractRequest(`${id}/sign/`, 'POST', { signature: name, consent, authority_confirmed: authority, ...(mode === 'draw' ? { signature_strokes: strokes } : { signature_image: signatureImage }), document_hash: data.document_hash })); await onSigned(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    {/* The web pad blocks touch panning and captures the pointer itself. Keep
        scrolling enabled there so drawing never removes the scrollbar. */}
    <ScrollView style={s.screen} keyboardShouldPersistTaps="handled" scrollEnabled={Platform.OS === 'web' || !drawing} contentContainerStyle={s.content}>
      <View style={s.pageHeader}><View style={{ flex: 1, gap: 5 }}><Text style={s.eyebrow}>ARTFILIER AGREEMENT</Text><Text accessibilityRole="header" style={s.pageTitle}>Review & sign</Text><Text style={s.description}>Review the terms, add your signature, then confirm your agreement.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close agreement" onPress={onClose} style={s.close}><X size={22} color="#775D53" /></TouchableOpacity></View>
      {!!error && <Text style={{ color: '#b00020' }}>{error}</Text>}
      {!data ? <Text>Loading agreement...</Text> : <>
        <View style={s.section}><View style={s.sectionHeading}><FileText size={21} color="#B55D4C" /><View style={s.headingText}><Text style={s.eyebrow}>01 / REVIEW</Text><Text accessibilityRole="header" style={s.sectionTitle}>Agreement details</Text></View></View><AgreementPaper document={data.document} /><TouchableOpacity accessibilityRole="button" onPress={preview} style={s.outlineButton}><FileText size={17} color="#A24F41" /><Text style={s.buttonText}>Preview / download PDF</Text></TouchableOpacity></View>
        <View style={s.section}><View style={s.sectionHeading}><ShieldCheck size={21} color="#B55D4C" /><Text accessibilityRole="header" style={s.sectionTitle}>Signing status</Text></View>
        {!!data.artist_presigned_document && <Text>The artist signed the fixed auction terms on {new Date(data.artist_signed_at).toLocaleString()}. Your signature confirms those terms and the completed winner details shown above.</Text>}
        <Text>Artist: {data.artist_signature || 'Awaiting signature'}</Text>
        <Text>Buyer: {data.buyer_signature || 'Awaiting signature'}</Text>
        {data.fully_signed && <Text selectable style={{ color: '#5D8A63', fontWeight: '800' }}>Verification code: {data.verification_code}</Text>}
        {['artist', 'buyer'].map(role => data[`${role}_signature_image`] ? <View key={role}><Text>{role} signature</Text><Image source={{ uri: data[`${role}_signature_image`] }} style={{ width: 240, height: 80 }} resizeMode="contain" /></View> : null)}

        </View>
        {signed ? <View style={[s.section, s.success]}><Text accessibilityRole="header" style={s.sectionTitle}>Signature saved</Text><Text style={s.description}>{data.fully_signed ? data.checkout_status === 'paid' ? 'Both parties have signed and payment is recorded.' : data.checkout_available === false ? 'Both parties have signed. Continue funding in the commission workspace.' : data.my_role === 'buyer' ? 'Both parties have signed. Close this agreement, then choose Checkout in your cart or negotiation chat when ready. Signing does not open Xendit or take payment.' : 'Both parties have signed. The buyer can now choose checkout and pay.' : 'Your signature is saved. Waiting for the other party to sign.'}</Text><TouchableOpacity style={s.outlineButton} onPress={onClose}><Text style={s.buttonText}>Done — return to negotiation</Text></TouchableOpacity></View> : data.can_sign === false ? <View style={s.section}><Text style={s.sectionTitle}>Waiting for the artist’s signature</Text><Text style={s.description}>The artist signs first. Your signature form will become available after their signature is saved.</Text></View> : <>
          <View style={s.section}><View style={s.sectionHeading}><PenLine size={21} color="#B55D4C" /><View style={s.headingText}><Text style={s.eyebrow}>02 / SIGNATURE</Text><Text accessibilityRole="header" style={s.sectionTitle}>Your signature</Text></View></View>
          <Text style={s.description}>Signing as {data.my_role}. Enter your full name and draw or upload your signature.</Text>
          <Text style={s.label}>Full name</Text>
          <TextInput accessibilityLabel="Full name signature" value={name} onChangeText={setName} placeholder="Enter your full name" maxLength={200} style={s.input} />
          <View style={s.modeRow}>
            <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: mode === 'draw' }} style={[s.modeButton, mode === 'draw' && s.modeSelected]} onPress={() => { if (mode !== 'draw') setStrokes([]); setMode('draw'); }}><PenLine size={17} color="#A24F41" /><Text style={s.buttonText}>Draw signature</Text>{mode === 'draw' && <Check size={16} color="#A24F41" />}</TouchableOpacity>
            <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: mode === 'upload' }} style={[s.modeButton, mode === 'upload' && s.modeSelected]} onPress={() => setMode('upload')}><Upload size={17} color="#A24F41" /><Text style={s.buttonText}>Upload PNG</Text>{mode === 'upload' && <Check size={16} color="#A24F41" />}</TouchableOpacity>
          </View>
          {mode === 'draw' ? <SignaturePad onChange={setStrokes} onDrawing={setDrawing} /> : <View>
            <TouchableOpacity accessibilityRole="button" onPress={upload} style={s.outlineButton}><Upload size={17} color="#A24F41" /><Text style={s.buttonText}>Choose transparent PNG (up to 2 MB)</Text></TouchableOpacity>
            {!!signatureImage && <Image source={{ uri: signatureImage }} style={{ width: '100%', height: 130 }} resizeMode="contain" />}
          </View>}
          </View>
          <View style={s.section}><View style={s.sectionHeading}><ShieldCheck size={21} color="#B55D4C" /><View style={s.headingText}><Text style={s.eyebrow}>03 / CONFIRMATION</Text><Text accessibilityRole="header" style={s.sectionTitle}>Review & consent</Text></View></View>
          {data?.authority_required && data?.my_role === 'artist' && !signed && <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="I confirm my authority to license or assign these rights" accessibilityState={{ checked: authority }} activeOpacity={0.8} onPress={() => setAuthority(!authority)} style={[s.consentCard, authority && s.consentSelected]}><View style={[s.checkbox, authority && s.checkboxSelected]}>{authority && <Check size={17} color="#FFF" strokeWidth={3} />}</View><View style={{ flex: 1, gap: 5 }}><Text style={s.label}>I confirm my authority over these rights</Text><Text style={s.description}>I own or control the rights being licensed or assigned and have prior written consent from all copyright co-owners and any other required right holders.</Text></View></TouchableOpacity>}
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: consent }} activeOpacity={0.8} onPress={() => setConsent(!consent)} style={[s.consentCard, consent && s.consentSelected]}><View style={[s.checkbox, consent && s.checkboxSelected]}>{consent && <Check size={17} color="#FFF" strokeWidth={3} />}</View><View style={{ flex: 1, gap: 5 }}><Text style={s.label}>I have reviewed and agree</Text><Text style={s.description}>I have reviewed this agreement and agree to sign it electronically using the signature shown above.</Text></View></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy || !consent || !hasSignature || name.trim().length < 2 || (data?.authority_required && data?.my_role === 'artist' && !authority)} onPress={sign} style={[s.signButton, (busy || !consent || !hasSignature || name.trim().length < 2 || (data?.authority_required && data?.my_role === 'artist' && !authority)) && s.disabled]}><PenLine size={18} color="#FFF" /><Text style={s.signText}>{busy ? 'Signing...' : 'Sign agreement'}</Text></TouchableOpacity>
          </View>
        </>}
      </>}
    </ScrollView>
  </Modal>;
}

const s = StyleSheet.create({
  screen: { backgroundColor: '#FAF7F4' },
  content: { padding: 18, paddingTop: 50, paddingBottom: 60, gap: 18, maxWidth: 800, width: '100%', alignSelf: 'center' },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#674737' },
  close: { padding: 11, borderRadius: 24, backgroundColor: '#F0E8E2' },
  section: { padding: 18, borderRadius: 18, borderWidth: 1, borderColor: '#EADDD4', backgroundColor: '#FFF', gap: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: '#F0E7E0' },
  headingText: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, color: '#AA8170' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#674737' },
  description: { fontSize: 13, lineHeight: 20, color: '#806D62' },
  label: { fontSize: 14, fontWeight: '700', color: '#674737' },
  input: { borderWidth: 1, borderColor: '#DCCBC0', backgroundColor: '#FFFCFA', padding: 13, borderRadius: 11, fontSize: 15, color: '#493B33' },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  modeButton: { minHeight: 46, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#E8DED7', borderRadius: 11 },
  modeSelected: { borderColor: '#B55D4C', backgroundColor: '#FFF1EA' },
  outlineButton: { minHeight: 46, padding: 12, borderWidth: 1, borderColor: '#E6C9BA', borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { color: '#A24F41', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  consentCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15, borderWidth: 1, borderColor: '#E4D8CE', borderRadius: 13, backgroundColor: '#FFFCFA' },
  consentSelected: { borderColor: '#6D9476', backgroundColor: '#F0F7F1' },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: '#BCA89A', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  checkboxSelected: { borderColor: '#477452', backgroundColor: '#477452' },
  signButton: { minHeight: 49, padding: 14, borderRadius: 12, backgroundColor: '#B55D4C', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  signText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  success: { borderColor: '#C9DECD', backgroundColor: '#F0F7F1' },
});
