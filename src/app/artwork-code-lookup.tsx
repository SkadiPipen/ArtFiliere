import { AdminRefreshContext } from '@/module/admin/AdminRefresh';
import { adminType, adminSurfaces } from '@/module/admin/adminDesign';
import { useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase/config';
import { ScrollView, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';

type Person = { id: number; username: string; name: string };
type Match = { code: string; source: string; issued_at: string; artwork: { id: number; title: string; kind: string } | null; buyer: Person; artist: Person; license: Record<string, unknown>; blockchain?: { status: string; network?: string; transaction_hash?: string; block_number?: number; proof_hash?: string } };
const person = (p: Person) => `${p.name || p.username || 'Account'} (ID ${p.id})`;

export default function ArtworkCodeLookup() {
  const adminWorkspace = !!useContext(AdminRefreshContext);
  const [code, setCode] = useState('');
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onAuthStateChanged(auth, () => { setMatch(null); setError(''); }), []);
  const lookup = async () => {
    const uid = auth.currentUser?.uid;
    setBusy(true); setError(''); setMatch(null);
    try {
      const result = await purchaseRequest('support/artwork-code/', 'POST', { code: code.trim() });
      if (uid && auth.currentUser?.uid === uid) setMatch(result);
    }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Unable to look up this code.'); }
    finally { setBusy(false); }
  };
  return <ScrollView style={s.screen} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <Text style={[s.title, adminWorkspace && adminType.pageTitle]}>Artwork code lookup</Text>
    <Text style={[s.description, adminWorkspace && adminType.body]}>Admin and customer service can identify an issued copy using the faint code on the image.</Text>
    <View style={[s.card, adminWorkspace && adminSurfaces.card]}>
    <Text style={[s.label, adminWorkspace && adminType.label]}>Artwork copy code</Text>
    <TextInput accessibilityLabel="Artwork copy code" style={[s.input, adminWorkspace && adminType.input]} value={code} maxLength={40} autoCapitalize="characters" autoCorrect={false} placeholder="AF-TX-0123456789ABCDEF" onChangeText={value => { setCode(value); setMatch(null); setError(''); }} editable={!busy} />
    <TouchableOpacity accessibilityRole="button" disabled={busy || !code.trim()} style={s.button} onPress={lookup}><Text style={{ color: 'white' }}>{busy ? 'Looking up…' : 'Look up code'}</Text></TouchableOpacity>
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A52A2A' }}>{error}</Text>}
    {match && <View style={[s.card, adminWorkspace && adminSurfaces.card]}>
      <Text style={s.title}>{match.artwork?.title || 'Original source unavailable'}</Text>
      <Text selectable>Copy: {match.code}</Text>
      <Text selectable>Artwork reference: {match.artwork ? `${match.artwork.kind} ${match.artwork.id}` : match.source}</Text>
      <Text selectable>Buyer: {person(match.buyer)}</Text>
      <Text selectable>Artist: {person(match.artist)}</Text>
      <Text>Issued: {new Date(match.issued_at).toLocaleString()}</Text>
      <Text style={s.title}>Blockchain purchase record</Text>
      <Text>Status: {match.blockchain?.status || 'not_linked'}</Text>
      {match.blockchain?.transaction_hash && <>
        <Text>Network: {match.blockchain.network} · Block: {match.blockchain.block_number}</Text>
        <Text selectable>Transaction: {match.blockchain.transaction_hash}</Text>
        <Text selectable>Proof hash: {match.blockchain.proof_hash}</Text>
      </>}
      <Text style={s.title}>Recorded license</Text>
      {Object.entries(match.license).map(([key, value]) => <View key={key}><Text style={{ fontWeight: '700' }}>{key.replace(/_/g, ' ')}</Text><Text selectable>{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? 'Not recorded')}</Text></View>)}
      <Text>This identifies an issued copy. Review the agreement before deciding whether its use was permitted.</Text>
    </View>}
  </ScrollView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAF7F3' },
  page: { padding: 28, gap: 18, width: '100%', maxWidth: 1360, alignSelf: 'center', paddingBottom: 60 },
  title: { fontSize: 26, fontFamily: 'LoraSemiBold', fontWeight: '600', color: '#3A2D2A' },
  description: { color: '#786862', fontSize: 14, lineHeight: 23 },
  label: { color: '#70482F', fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#D7CCC3', color: '#3D3028', borderRadius: 10, padding: 14, backgroundColor: '#FFFFFF' },
  button: { backgroundColor: '#BC5555', minHeight: 44, padding: 14, borderRadius: 12, alignSelf: 'flex-start' },
  card: { padding: 24, gap: 16, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5DAD3' },
});
