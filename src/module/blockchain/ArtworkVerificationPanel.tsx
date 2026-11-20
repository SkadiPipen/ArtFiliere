import Skeleton from '@/components/Skeleton';
import { Text } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import TraceDigitalCopy from './TraceDigitalCopy';
import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

type Verification = { title: string; created_by: { username: string }; creator_verification: string; disputed: boolean; registration_status: string };

export default function ArtworkVerificationPanel({ artworkId, buttonLabel = 'Verify artwork' }: { artworkId: number; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Verification | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const load = async () => {
    const current = ++version.current;
    setBusy(true); setError(''); setData(null);
    try {
      const result = await purchaseRequest(`blockchain/artworks/${artworkId}/verification/`);
      if (current === version.current) setData(result);
    } catch (e: any) { if (current === version.current) setError(e.message || 'Unable to verify artwork.'); }
    finally { if (current === version.current) setBusy(false); }
  };
  useEffect(() => {
    if (open) void load();
    return () => { version.current++; };
  }, [open, artworkId]);
  return <>
    <TouchableOpacity accessibilityRole="button" onPress={() => setOpen(true)} style={s.button}><Text style={s.buttonText}>{buttonLabel}</Text></TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={s.overlay}><View style={s.card}>
        <View style={s.heading}><Text style={s.title}>Artwork verification</Text><TouchableOpacity accessibilityRole="button" onPress={() => setOpen(false)}><Text>Close</Text></TouchableOpacity></View>
        <ScrollView contentContainerStyle={{ gap: 12 }}>
          {busy && <Skeleton layout="form" />}
          {!!error && <Text accessibilityRole="alert" style={{ color: '#A74646' }}>{error}</Text>}
          {data && <>
            <Text style={s.title}>{data.title}</Text>
            <Text>Recorded creator: @{data.created_by.username}</Text>
            <Text>Attribution: {data.creator_verification === 'reviewed' ? 'Reviewed' : 'Claimed'}</Text>
            <Text>Registration: {data.registration_status.replace(/_/g, ' ')}</Text>
            <Text>{data.disputed ? 'Creator attribution is under review.' : 'No attribution dispute recorded.'}</Text>
            <Text>A registration records a claim; it does not independently prove authorship. Escalate cases requiring full ownership or transaction history to an administrator.</Text>
            <TraceDigitalCopy artworkId={artworkId} />
          </>}
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void load()} style={s.button}><Text style={s.buttonText}>Refresh verification</Text></TouchableOpacity>
        </ScrollView>
      </View></View>
    </Modal>
  </>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, padding: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0009' },
  card: { width: '100%', maxWidth: 620, maxHeight: '90%', padding: 22, borderRadius: 16, backgroundColor: '#FFFCF8' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  title: { fontSize: 18, fontWeight: '700', color: '#49342E' },
  button: { padding: 12, backgroundColor: '#B95353', borderRadius: 9, alignItems: 'center', marginVertical: 6 },
  buttonText: { color: '#FFF', fontWeight: '700' },
});
