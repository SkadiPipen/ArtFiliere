import hashlib
from types import SimpleNamespace
from rest_framework.exceptions import ValidationError
from messaging.models import AgreementTemplate
from messaging.signing import document_text, party_name


def request_document(user, data):
    template = AgreementTemplate.objects.filter(pk=data.get('auction_agreement_template_id'), is_active=True).first()
    if not template:
        raise ValidationError({'error': 'The selected agreement template is unavailable.'})
    if str(data.get('auction_terms') or '').strip() != template.body.strip():
        raise ValidationError({'error': 'The platform terms changed. Reload the agreement before signing.'})
    title = str(data.get('title') or '').strip()
    license_type = data.get('auction_license_type', 'personal')
    exclusivity = data.get('auction_exclusivity', 'non_exclusive')
    delivery = data.get('auction_delivery_type', 'digital')
    if not title or license_type not in ('personal', 'commercial') or exclusivity not in ('non_exclusive', 'exclusive', 'sole') or delivery not in ('physical', 'digital'):
        raise ValidationError({'error': 'Add the artwork title and choose valid license options.'})
    if data.get('art_type') and str(data['art_type']).lower() != delivery:
        raise ValidationError({'error': 'The agreement delivery type must match the artwork type.'})
    terms = template.body.replace('{{buyer_name}}', 'Winning bidder—to be determined').replace('{{artist_name}}', party_name(user)).replace('{{artwork_title}}', title).replace('{{amount}}', 'the final winning bid')
    terms += f'\n\nLicense: {license_type}\nExclusivity: {exclusivity}\nProduct: {delivery}\nCompensation: one-time winning bid. Shipping, if applicable, is calculated at checkout under the platform delivery policy.'
    buyer = SimpleNamespace(username='Winning bidder—to be determined', first_name='', middle_name='', last_name='')
    item = SimpleNamespace(artwork=SimpleNamespace(title=title), artist=user, buyer=buyer, price='the final winning bid', license_type=license_type, exclusivity=exclusivity, delivery_type=delivery, terms_snapshot=terms, artist_presigned_document='')
    document = document_text(item).replace("The total fee is due and payable through the Platform's payment system no later than ten (10) business days from the delivery of the Images.", 'The winning buyer must sign and complete payment through the Platform within 48 hours after the winner is selected. Shipping fees and delivery details are completed at checkout; the license terms remain unchanged.')
    return document, hashlib.sha256(document.encode()).hexdigest()
