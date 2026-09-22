import SigningModal from './SigningModal';
import { auth } from '@/firebase/config';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Contract, contractRequest, isAgreed } from './contracts';

export default function ProposalCard({ contract, onChange, onRevise }: { contract: Contract; onChange: () => void; onRevise: (contract: Contract) => void }) {
  const [signing, setSigning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const decide = async (action: string) => {
    setBusy(true); setError('');
    try { await contractRequest(`${contract.id}/`, 'PATCH', { action }); onChange(); if (action === 'accept') setSigning(true); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <View style={{ padding: 14, marginVertical: 8, borderWidth: 1, borderColor: '#D48C62', borderRadius: 12, backgroundColor: '#FFF9F3', width: '95%', alignSelf: 'center' }}>
    {signing && <SigningModal id={contract.id} onClose={() => setSigning(false)} onSigned={onChange} />}
    {isAgreed(contract) && <TouchableOpacity onPress={() => setSigning(true)}><Text style={{ color: '#C15656' }}>Sign / preview agreement PDF</Text></TouchableOpacity>}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}>
      <Text style={{ fontWeight: '700', color: '#9b5146' }}>Contract proposal: {contract.title}</Text>
      <Text style={{ color: '#75655F', marginTop: 4 }}>{contract.buyer_uid === auth.currentUser?.uid ? "You're buying" : contract.artist_uid === auth.currentUser?.uid ? "You're selling" : ''}</Text>
      <Text>PHP {contract.price} | {isAgreed(contract) ? 'Agreed' : contract.status === 'cancelled' ? 'Rejected or replaced' : 'Awaiting acceptance'}</Text>
      <Text style={{ color: '#C15656', marginTop: 6 }}>{expanded ? 'Hide details' : 'Show details'}</Text>
    </TouchableOpacity>
    {expanded && <View style={{ gap: 10, marginTop: 12 }}>
      <Text selectable>{contract.terms}</Text>
      <Text>Buyer: {contract.buyer_accepted ? 'accepted' : 'pending'} | Artist: {contract.artist_accepted ? 'accepted' : 'pending'}</Text>
      {!!error && <Text style={{ color: '#b00020' }}>{error}</Text>}
      {contract.status === 'cancelled' && <TouchableOpacity onPress={() => onRevise(contract)}><Text style={{ color: '#C15656' }}>New proposal</Text></TouchableOpacity>}
      {contract.status === 'proposed' && <View style={{ flexDirection: 'row', gap: 20 }}>
        <TouchableOpacity disabled={busy} onPress={() => onRevise(contract)}><Text style={{ color: '#C15656' }}>{contract.is_proposer ? 'Revise proposal' : 'Negotiate'}</Text></TouchableOpacity>
        {!contract.is_proposer && <TouchableOpacity disabled={busy} onPress={() => decide('accept')}><Text style={{ color: '#287544', fontWeight: '700' }}>{busy ? 'Saving...' : 'Accept these terms'}</Text></TouchableOpacity>}
        <TouchableOpacity disabled={busy} onPress={() => decide('cancel')}><Text style={{ color: '#C15656' }}>Cancel</Text></TouchableOpacity>
      </View>}
    </View>}
  </View>;
}
