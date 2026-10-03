import { auth } from '@/firebase/config';
import { ChatWindow } from './chats';
import NegotiationForm from './negotiationForm';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Contract, ContractResponse, contractRequest, isAgreed } from './contracts';

export default function ContractPanel({ artworkId, onClose, revision, startInChat = false }: { artworkId?: string; onClose: () => void; revision?: Contract; startInChat?: boolean }) {

  const [data, setData] = useState<ContractResponse | null>(null);
  const [formSubmitted, setFormSubmitted] = useState(startInChat);
  const [revising, setRevising] = useState(!!revision);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const result: ContractResponse = await contractRequest(artworkId ? `artworks/${artworkId}/` : '');
      setData(result);
      setError('');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [artworkId]);
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer); }, [load]);
  const act = async (path: string, method: string, body: object) => {
    setBusy(true); setError('');
    try { await contractRequest(path, method, body); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const agreed = data?.contracts.some(isAgreed);
  const artwork = data?.artwork;
  const sendProposal = async (proposal: any) => {
    const total = Number(proposal.finalPrice) + Number(proposal.deliveryFee || 0);
    const terms = [
      `License: ${proposal.licenseType}`,
      `Exclusivity: ${proposal.exclusivity}`,
      `Product: ${artwork?.art_type}`,
      proposal.durationMonths ? `License duration: ${proposal.durationMonths} months` : 'License duration: no fixed duration specified',
      `Compensation: ${proposal.isRoyalty ? `one-time price plus ${proposal.royaltyPercentage}% royalties` : 'one-time payment'}`,
      `Base price: PHP ${Number(proposal.basePrice).toFixed(2)}`,
      `License multiplier: ${proposal.licenseMultiplier}; exclusivity multiplier: ${proposal.exclusivityMultiplier}`,
      `Platform fee included: PHP ${Number(proposal.platformFee).toFixed(2)}`,
      proposal.requiresDelivery ? `Delivery: ${proposal.deliveryAddress}; PHP ${Number(proposal.deliveryFee).toFixed(2)}` : 'No shipping included',
      `Total: PHP ${total.toFixed(2)}`,
      proposal.note ? `Additional terms: ${proposal.note}` : '',
    ].filter(Boolean).join('\n');
    try {
      await contractRequest(`artworks/${artworkId}/`, 'POST', {
        price: total.toFixed(2), terms, revision_of: revision?.id,
        delivery_quote: proposal.deliveryQuote,
        license_type: proposal.licenseType, exclusivity: proposal.exclusivity.replace('-', '_'),
        delivery_type: artwork?.art_type, compensation_type: proposal.isRoyalty ? 'royalty' : 'one_time',
      });
      if (revision) { onClose(); return; }
      setFormSubmitted(true); setRevising(false); await load();
    } catch (e: any) { setError(e.message); throw e; }
  };
  const cancelForm = () => { if (revision) onClose(); else { setFormSubmitted(true); setRevising(false); } };
  if (loading && artworkId) {
    return <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <ActivityIndicator /><Text>Loading negotiation form...</Text>
        <TouchableOpacity onPress={onClose}><Text style={s.link}>Close</Text></TouchableOpacity>
      </View>
    </Modal>;
  }
  if (artwork && (artwork.can_propose || revision) && (!agreed || revision) && (revising || !formSubmitted)) {
    return <Modal visible animationType="slide" onRequestClose={cancelForm}>
      <View style={{ flex: 1, paddingTop: 45, width: '100%', maxWidth: 800, alignSelf: 'center' }}>
        {!!error && <Text style={s.error}>{error}</Text>}
        <View style={s.header}><Text style={s.heading}>Negotiate a contract</Text><TouchableOpacity onPress={cancelForm}><Text style={s.link}>Cancel</Text></TouchableOpacity></View>
        <View style={{ flex: 1 }}>
        <NegotiationForm
          artwork={{ id: artwork.id, title: artwork.title, artist_name: artwork.artist, art_type: artwork.art_type, base_price: Number(artwork.price), image_url: artwork.image_url }}
          buyerId={artwork.buyer_uid} buyerName={artwork.buyer_name}
          artistId={artwork.artist_uid} artistName={artwork.artist}
          chatId={[artwork.buyer_uid, artwork.artist_uid].sort().join('_')}
          revisionId={revision?.id}
          initialDelivery={revision?.delivery_details}
          onSend={sendProposal} onCancel={cancelForm}
        />
        </View>

      </View>
    </Modal>;
  }
  if (artwork?.can_propose && (formSubmitted || agreed) && !revising) {
    return <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, paddingTop: 45 }}>
        <ChatWindow user={{ id: artwork.artist_uid, displayName: artwork.artist, email: '', photoURL: '', role: 'artist' }} currentUser={auth.currentUser} onClose={onClose} />
      </View>
    </Modal>;
  }
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={s.page} style={{ flex: 1 }}>
      <View style={s.header}><Text style={s.heading}>Negotiate a contract</Text><TouchableOpacity onPress={onClose}><Text style={s.link}>Close</Text></TouchableOpacity></View>
      <Text>Both buyer and artist must accept the same terms before checkout. The contract price covers one artwork purchase.</Text>
      {loading && <ActivityIndicator />}
      {artwork && !artwork.can_propose && <Text accessibilityRole="alert" style={s.error}>{artwork.is_auction ? 'Auction license terms are fixed. The winning buyer signs the auction agreement after the auction ends.' : `You are signed in as ${artwork.buyer_name}. Buyer and artist accounts can negotiate purchases of another artist’s work. You cannot negotiate your own artwork.`}</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <TouchableOpacity onPress={load}><Text style={s.link}>Refresh contracts</Text></TouchableOpacity>
      {data?.artwork && <Text style={s.heading}>{data.artwork.title} / {data.artwork.artist}</Text>}
      {data?.contracts.map(contract => <View key={contract.id} style={s.card}>
        <Text style={s.heading}>{contract.title}</Text>
        <Text>{contract.buyer} / {contract.artist}</Text>
        <Text style={s.heading}>PHP {contract.price}</Text>
        <Text>{new Date(contract.created_at).toLocaleString()}</Text>
        <Text>Status: {contract.status}</Text>
        <Text>Open the chat to expand the proposal and review or accept its terms.</Text>
      </View>)}
      {data && !data.contracts.length && <Text>No proposals yet.</Text>}
      {artwork?.can_propose && !agreed && <TouchableOpacity style={s.button} onPress={() => setRevising(true)}><Text style={s.white}>Propose revised terms</Text></TouchableOpacity>}
    </ScrollView>
    {artwork?.can_propose && <View style={{ flex: 1, minHeight: 220 }}><ChatWindow user={{ id: artwork.artist_uid, displayName: artwork.artist, email: '', photoURL: '', role: 'artist' }} currentUser={auth.currentUser} onClose={onClose} /></View>}
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  page: { padding: 24, paddingTop: 50, gap: 14, width: '100%', maxWidth: 800, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: 18, fontWeight: '700', color: '#603c36' },
  card: { padding: 18, borderWidth: 1, borderColor: '#e3d7d0', borderRadius: 12, gap: 10 },
  input: { borderWidth: 1, borderColor: '#baa9a0', borderRadius: 6, padding: 12, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  button: { backgroundColor: '#C15656', padding: 12, borderRadius: 7 },
  white: { color: '#fff', fontWeight: '700' }, link: { color: '#C15656', paddingVertical: 8 },
  error: { color: '#b00020' }, terms: { lineHeight: 22 },
});
