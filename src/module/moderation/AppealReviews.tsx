import { useEffect, useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';
import { purchaseRequest, downloadProtectedFile } from '@/services/purchases';
import { Action, styles as s } from './ui';

type Appeal = { id: number; user: string; explanation: string; status: string; recommendation: string; moderator_note: string; decision_note: string; restriction?: { action: string; reason: string; ends_at?: string }; links: string[]; attachments: { id: number; name: string }[] };
export default function AppealReviews({ admin = false }: { admin?: boolean }) {
  const [rows, setRows] = useState<Appeal[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => setRows(await purchaseRequest('moderation/appeals/'));
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  useEffect(() => { run(load); }, []);
  return <View style={s.card}><Text style={s.heading}>Suspension & ban appeals</Text><Text style={s.text}>{admin ? 'Appeals arrive directly here. Review the explanation and evidence, then approve or deny reinstatement with a reason.' : 'Appeals go directly to admin. You may provide an optional recommendation to help an investigation; admin can decide without waiting for it.'}</Text><Action label="Refresh appeals" disabled={busy} onPress={() => run(load)} />{!!error && <Text style={s.error}>{error}</Text>}{!rows.length && <Text>{busy ? 'Loading appeals…' : 'No appeals yet.'}</Text>}
    {rows.map(row => <View key={row.id} style={s.card}><Text style={s.heading}>Appeal #{row.id} · {row.user} · {row.status}</Text>{row.restriction && <Text style={s.text}>Original {row.restriction.action}: {row.restriction.reason}{row.restriction.ends_at ? ` · Ends ${new Date(row.restriction.ends_at).toLocaleString()}` : ''}</Text>}<Text style={s.text}>{row.explanation}</Text>
      {row.links.map((link, index) => <Action key={index} label={link} onPress={() => run(async () => { await Linking.openURL(link); })} />)}
      {row.attachments.map(file => <Action key={file.id} label={`Download ${file.name}`} disabled={busy} onPress={() => run(() => downloadProtectedFile(`account/appeal-attachments/${file.id}/`, file.name))} />)}
      {!!row.moderator_note && <Text>Recommendation: {row.recommendation}. {row.moderator_note}</Text>}{!!row.decision_note && <Text>Admin decision: {row.decision_note}</Text>}
      {(admin ? ['pending', 'recommended'].includes(row.status) : row.status === 'pending') && <><TextInput accessibilityLabel={`Appeal ${row.id} review note`} placeholder="Reason for your recommendation or decision" multiline style={s.input} editable={!busy} value={notes[row.id] || ''} onChangeText={value => setNotes(old => ({ ...old, [row.id]: value }))} />
        <View style={s.row}>{(admin ? ['approved', 'denied'] : ['reinstate', 'uphold']).map(value => <Action key={value} label={value === 'approved' ? 'Approve reinstatement' : value === 'denied' ? 'Deny appeal' : value === 'reinstate' ? 'Recommend reinstatement' : 'Recommend upholding restriction'} disabled={busy || !notes[row.id]?.trim()} onPress={() => run(async () => { await purchaseRequest(`moderation/appeals/${row.id}/`, 'PATCH', { [admin ? 'decision' : 'recommendation']: value, note: notes[row.id] }); await load(); })} />)}</View>
      </>}
    </View>)}
  </View>;
}
