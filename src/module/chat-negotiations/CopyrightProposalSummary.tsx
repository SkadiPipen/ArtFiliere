import { Text } from '@/components/Typography';
import { View } from 'react-native';
import InfoAccordion from './InfoAccordion';
import { assignmentRights, type CopyrightTransfer } from './CopyrightTransferFields';

export function copyrightProposalText(transfer?: CopyrightTransfer): string {
  if (!transfer) return 'Copyright transfer: not included. Copyright remains with the artist.';
  return [
    `Copyright assignment: ${transfer.kind === 'full' ? 'Full transferable economic rights' : 'Partial economic rights'}`,
    `Assigned rights: ${(transfer.kind === 'full' ? Object.keys(assignmentRights) : transfer.rights).map(right => assignmentRights[right] || right).join(', ')}`,
    'Territory: worldwide. Duration: remaining statutory term of assigned rights.',
    `Effective: ${transfer.effective === 'both_signed' ? 'After both parties sign, even if payment is outstanding' : 'After both parties sign and the full checkout payment settles; future recurring royalties do not delay transfer'}.`,
    'Assignment consideration is included in the negotiated fee; no additional transfer charge.',
    `Existing commitments: ${transfer.existing_commitments}`,
    `Uses reserved to the artist:\n${transfer.artist_reserved_uses}`,
    `Additional assignment conditions: ${transfer.additional_terms}`,
    'Authorship and moral rights remain with the artist. Applicable statutory resale rights and exceptions are preserved.',
    'These are the terms of this proposal. Acceptance alone does not establish that ownership has transferred; the signature and payment conditions must be met.',
  ].join('\n\n');
}

export default function CopyrightProposalSummary({ transfer }: { transfer?: CopyrightTransfer }) {
  return <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
    <InfoAccordion title={transfer ? `Copyright assignment proposed · ${transfer.kind === 'full' ? 'Full' : 'Partial'}` : 'Copyright transfer not included'} description={transfer ? 'Expand to review the rights, transfer conditions and artist reservations in this offer.' : 'This offer grants a license. Copyright ownership remains with the artist.'} details={copyrightProposalText(transfer)} />
  </View>;
}
