def concern(key, label, category, reference='payment', artist_only=False):
    department = 'creative_moderator' if key in ('verification', 'rejected_artwork', 'plagiarism') else 'customer_support'
    return dict(id=key, label=label, category=category, reference=reference, artist_only=artist_only, department=department)


CONCERNS = [
    concern('verification', 'Follow up art posting verification', 'Artist Support', 'own_artwork', True),
    concern('rejected_artwork', 'Appeal an artwork rejection', 'Artist Support', 'own_artwork', True),
    concern('plagiarism', 'Report plagiarism', 'Artist Support', 'artwork'),
    concern('payout', 'Follow up artist payout', 'Artist Support', 'payment', True),
    concern('artist_commission', 'Commission dispute', 'Artist Support', 'commission', True),
    concern('not_received', 'Artwork not received', 'Orders & Artwork'),
    concern('wrong_damaged', 'Wrong or damaged artwork', 'Orders & Artwork'),
    concern('not_as_described', 'Artwork not as described', 'Orders & Artwork'),
    concern('download', 'Cannot download digital artwork', 'Orders & Artwork', 'digital_payment'),
    concern('missing_parcel', 'Missing parcel', 'Delivery', 'physical_payment'),
    concern('delayed_delivery', 'Delayed delivery', 'Delivery', 'physical_payment'),
    concern('false_delivery', 'Marked delivered but not received', 'Delivery', 'physical_payment'),
    concern('driver', 'Report driver', 'Delivery', 'physical_payment'),
    concern('delivery_fee', 'Question about delivery fee', 'Delivery', 'physical_payment'),
    concern('charged_unpaid', 'Charged but order still unpaid', 'Payments & Refunds'),
    concern('duplicate_charge', 'Duplicate charge', 'Payments & Refunds'),
    concern('failed_payment', 'Payment failed', 'Payments & Refunds'),
    concern('refund_request', 'Request cancellation or refund', 'Payments & Refunds'),
    concern('refund_followup', 'Follow up a refund', 'Payments & Refunds'),
    concern('unresponsive', 'Commission participant is unresponsive', 'Commissions & Auctions', 'commission'),
    concern('missed_deadline', 'Commission deadline missed', 'Commissions & Auctions', 'commission'),
    concern('commission_scope', 'Commission scope or revision dispute', 'Commissions & Auctions', 'commission'),
    concern('bidding', 'Problem placing a bid', 'Commissions & Auctions', 'auction'),
    concern('auction_checkout', 'Winning bid checkout problem', 'Commissions & Auctions', 'auction'),
    concern('account', 'Account or login issue', 'Account & Safety', 'none'),
    concern('artist_registration', 'Follow up artist registration', 'Registration', 'none'),
    concern('driver_registration', 'Follow up driver application', 'Registration', 'none'),
    concern('harassment', 'Harassment or inappropriate messages', 'Account & Safety', 'none'),
    concern('suspicious', 'Suspicious activity or scam', 'Account & Safety', 'none'),
    concern('other', 'Something else', 'Account & Safety', 'none'),
]
FAQS = [
    dict(id='tracking', question='How do I track my order?', answer='Open My Purchases and check the delivery status on the purchase. If an update looks wrong, choose Delivery here and select that transaction.', concern='delayed_delivery'),
    dict(id='fees', question='Where can I check delivery fees?', answer='Choose a saved delivery address in the agreement to request a delivery quote. Review the quoted fee and total before signing or paying.', concern='delivery_fee'),
    dict(id='signature', question='How do negotiations and signatures work?', answer='Open the artwork or commission conversation to review the agreement. Both participants must accept the same revision and sign it. Changes require a new review of the agreement.', concern='other'),
    dict(id='milestones', question='How do commission milestones work?', answer='Your commission shows its milestones and progress photos. Report a scope or progress issue under Commissions & Auctions.', concern='commission_scope'),
    dict(id='auction', question='What are the auction agreement rules?', answer='Review the published auction agreement before bidding. The winning bid fixes the core price and license terms; check delivery details and the payment deadline.', concern='auction_checkout'),
    dict(id='approval', question='How do I follow up artwork verification?', answer='Choose Artist Support, then Follow up art posting verification and select your submission. Support can check its review status; approval is not guaranteed.', concern='verification', artist_only=True),
    dict(id='refund', question='Does submitting a report automatically issue a refund?', answer='No. Support reviews the transaction and your concern first. Any refund or cancellation follows a separate review; the report itself does not move funds.', concern='refund_request'),
]
