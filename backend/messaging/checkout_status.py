def checkout_status(agreement):
    from wallets.models import PaymentSession
    payment = PaymentSession.objects.filter(agreement=agreement, status__in=['paid', 'pending']).order_by('-id').first()
    return payment.status if payment else 'not_started'
