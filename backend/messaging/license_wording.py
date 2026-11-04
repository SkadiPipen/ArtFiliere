"""Editable boilerplate, frozen on each newly created agreement."""
SECTIONS = {'personal_grant': {'label': 'Personal license grant',
                    'default': 'The Artist grants the Client an {{exclusivity}}, worldwide license '
                               'to reproduce, publicly display, and distribute the Images solely '
                               'for personal, non-commercial purposes.'},
 'commercial_grant': {'label': 'Commercial license grant',
                      'default': 'The Artist grants the Client an {{exclusivity}}, worldwide '
                                 'license to reproduce, publicly display, distribute, and use the '
                                 'Images for commercial purposes including but not limited to '
                                 'advertising, marketing, product packaging, and merchandise.'},
 'scoped_grant': {'label': 'Grant introduction for negotiated permissions',
                  'default': 'The Artist grants the Client a license to reproduce, display and '
                             'distribute the work solely within the permissions below.'},
 'exclusive_rights': {'label': 'Exclusive license wording',
                      'default': 'Within the licensed scope and term, only the Client may exercise '
                                 'the licensed rights. The Artist shall not exercise those rights '
                                 'or grant them to any other party, except for the portfolio and '
                                 'promotional display expressly reserved below.'},
 'sole_rights': {'label': 'Sole license wording',
                 'default': 'Within the licensed scope and term, the Client is the only licensee. '
                            'The Artist may continue to exercise the licensed rights themselves, '
                            'but shall not grant those rights to any other party.'},
 'nonexclusive_rights': {'label': 'Non-exclusive license wording',
                         'default': 'The Artist retains the right to license the same Images to '
                                    'other parties.'},
 'parties': {'label': 'Parties introduction',
             'default': 'The Artist and Client are each referred to herein as a "Party" and '
                        'collectively as the "Parties."'},
 'copyright': {'label': 'Copyright ownership',
               'default': 'Copyright ownership remains with the Artist. This Agreement grants a '
                          'license and does not assign copyright ownership to the Client.'},
 'portfolio': {'label': 'Artist portfolio use',
               'default': 'The Artist retains the right to display the Images in their portfolio, '
                          'website, and for self-promotional purposes. Public viewing of this '
                          'display does not grant any viewer a license.'},
 'moral_rights': {'label': 'Moral rights',
                  'default': 'The Artist retains moral rights, including attribution and '
                             'protection against distortions or modifications prejudicial to honor '
                             'or reputation. No moral-rights waiver is implied. Nothing here '
                             'removes statutory exceptions or limitations, including fair use.'},
 'authority': {'label': 'Authority to license',
               'default': 'The Artist confirms that they own or control the licensed rights and '
                          'have obtained prior written consent from all copyright co-owners and '
                          'any required employer, commissioner, or other right holder. The Client '
                          'may request supporting documentation.'},
 'statutory_resale': {'label': 'Statutory resale rights',
                      'default': 'Negotiated license royalties do not replace or waive any '
                                 'applicable statutory resale right in qualifying original works. '
                                 'Statutory resale obligations must be assessed separately; this '
                                 'agreement does not automatically calculate or settle them.'},
 'records': {'label': 'Certificates and blockchain records',
             'default': 'Platform certificates and blockchain records record transactions and '
                        'document integrity; they do not establish authorship, create copyright, '
                        'or constitute IPOPHL registration.'},
 'payment_timing': {'label': 'Default payment timing',
                    'default': "The total fee is due and payable through the Platform's payment "
                               'system no later than ten (10) business days from the delivery of '
                               'the Images.'},
 'commercial_payments': {'label': 'Commercial payment schedules',
                         'default': 'The agreed schedules and royalty calculations above govern '
                                    'commercial obligations. The artwork checkout does not collect '
                                    'future royalties. Approved royalties may be collected through '
                                    'the reporting service only with structured agreed terms and '
                                    'separate payer authorization. Scheduled flat-fee payments '
                                    'remain contractual obligations.'},
 'digital_delivery': {'label': 'Digital delivery and inspection',
                      'default': 'The Artist shall deliver the Images to the Client in digital '
                                 "format via the Platform's delivery system or such other "
                                 "electronic means as the parties may agree. It is the Client's "
                                 'responsibility to verify that the Images are suitable for '
                                 'reproduction and to notify the Artist within five (5) business '
                                 'days if the Images are not deemed suitable.'},
 'termination': {'label': 'License termination',
                 'default': 'If either party materially breaches this Agreement and fails to cure '
                            'within fifteen (15) days after written notice, the non-breaching '
                            'party may terminate this Agreement immediately. Upon termination for '
                            'breach by Client, all rights granted shall immediately cease, and '
                            'Client shall destroy all copies of the Images and certify such '
                            'destruction in writing.'},
 'assignment_termination': {'label': 'Assignment breach remedies',
                            'default': 'For a material breach, the non-breaching party may seek '
                                       'remedies available under the agreement and applicable law '
                                       'after written notice and a fifteen-day opportunity to '
                                       'cure. Termination of a license does not automatically '
                                       'reverse a completed copyright assignment; any reassignment '
                                       'or other relief requires an express written agreement or '
                                       'applicable legal process.'},
 'commission_revisions': {'label': 'Commission revision requests',
                          'default': 'One consolidated buyer revision request/comment per stage. A '
                                     'revision does not create another entitlement. Extra scope '
                                     'requires a separate agreement.'},
 'commission_copyright': {'label': 'Commission copyright ownership',
                          'default': 'Copyright remains with the original artist. The buyer '
                                     'receives the agreed personal or commercial license; '
                                     'ownership of this asset record does not transfer copyright.'},
 'commission_permissions': {'label': 'Commission use and resale',
                            'default': 'Personal use permits non-commercial display and sharing. '
                                       'Commercial use permits reproduction, advertising and '
                                       'merchandise during the agreed license duration. Resale of '
                                       'the licensed asset is permitted only when Allow Resale '
                                       'above is True; subsequent owners inherit the same '
                                       'restrictions and expiry.'},
 'commission_exclusivity': {'label': 'Commission exclusivity',
                            'default': 'Non-exclusive rights permit other licenses. Exclusive '
                                       'rights prevent the artist licensing the same work to '
                                       'others during the license term. Sole rights permit use by '
                                       'the artist and this buyer, without licenses to others '
                                       'during that term.'},
 'commission_inspection': {'label': 'Commission delivery inspection',
                           'default': 'Review within five days. Inactivity escalates to Customer '
                                      'Service, never automatic approval. Physical final approval '
                                      'requires receipt and inspection.'}}

def section_keys(template):
    return [key for key in SECTIONS if key.startswith('commission_') == (template.name == 'Commission milestone agreement')]


def resolved_wording(template):
    return {key: template.wording.get(key, SECTIONS[key]['default']) for key in section_keys(template)}


def wording(agreement, key, default):
    # Never read the mutable template when rendering an existing agreement.
    return getattr(agreement, 'wording_snapshot', {}).get(key, default)


def serialized_sections(template):
    values = resolved_wording(template)
    return [dict(key=key, label=SECTIONS[key]['label'], body=values[key]) for key in section_keys(template)]
