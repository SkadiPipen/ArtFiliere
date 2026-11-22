import { Text, TextInput } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type Match = {
  code: string;
  buyer: { id: number; username: string };
  artwork: { id: number; title: string; kind: string } | null;
  license: { license_type?: string; exclusivity?: string };
};

export default function TraceDigitalCopy({ artworkId }: { artworkId: number }) {
  const [code, setCode] = useState('');
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  useEffect(() => {
    setCode(''); setMatch(null); setError(''); setBusy(false);
    return () => { version.current++; };
  }, [artworkId]);
  const lookup = async () => {
    const current = ++version.current;
    setBusy(true); setError(''); setMatch(null);
    try {
      const result = await purchaseRequest('support/artwork-code/', 'POST', { code: code.trim() });
      if (current === version.current) setMatch(result);
    } catch (e: any) { if (current === version.current) setError(e.message || 'Unable to trace this copy code.'); }
    finally { if (current === version.current) setBusy(false); }
  };
  return <View style={s.section}>
    <Text style={s.title}>Trace a digital copy</Text>
    <Text>Enter a readable dot-watermark code. A match identifies an issued copy; it does not prove an outside sale.</Text>
    <TextInput accessibilityLabel="Artwork copy tracking code" value={code} maxLength={40} autoCapitalize="characters" autoCorrect={false} placeholder="AF-TX-… or AF-…" style={s.input} onChangeText={value => { version.current++; setCode(value); setMatch(null); setError(''); setBusy(false); }} />
    <TouchableOpacity accessibilityRole="button" disabled={busy || !code.trim()} onPress={() => void lookup()} style={[s.button, (busy || !code.trim()) && { opacity: 0.5 }]}><Text style={s.buttonText}>{busy ? 'Looking up…' : 'Look up copy code'}</Text></TouchableOpacity>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A74646' }}>{error}</Text>}
    {match && <>
      <Text selectable>Copy code: {match.code}</Text>
      <Text>Issued buyer: @{match.buyer.username} (account #{match.buyer.id})</Text>
      <Text>Source: {match.artwork?.title || 'Source artwork unavailable'}</Text>
      <Text>{match.artwork?.kind === 'artwork' && match.artwork.id === artworkId ? 'Matches this artwork listing.' : 'This code belongs to another listing or commission. Confirm its source before drawing conclusions.'}</Text>
      {!!match.license.license_type && <Text>License: {match.license.license_type}</Text>}
      {!!match.license.exclusivity && <Text>Exclusivity: {match.license.exclusivity}</Text>}
    </>}
  </View>;
}
const s = StyleSheet.create({
  section: { gap: 12, paddingTop: 16, marginTop: 6, borderTopWidth: 1, borderColor: '#E8DBD2' },
  title: { fontWeight: '700', color: '#49342E' },
  input: { borderWidth: 1, borderColor: '#DCCAC1', borderRadius: 8, padding: 12 },
  button: { padding: 12, backgroundColor: '#B95353', borderRadius: 9, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '700' },
});
