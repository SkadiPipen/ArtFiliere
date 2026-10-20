"""Reconcile missed Xendit callbacks without inventing a paid state."""
import time
import requests
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections, connection
from wallets.models import PaymentSession
from wallets.views import apply_xendit_status


def reconcile_shop_payments(limit=20):
    if not settings.XENDIT_SECRET_KEY:
        return 0
    confirmed = 0
    rows = PaymentSession.objects.filter(status='pending', is_simulated=False).exclude(xendit_session_id='').order_by('-created_at')[:limit]
    for payment in rows:
        try:
            response = requests.get('https://api.xendit.co/sessions/' + payment.xendit_session_id,
                                    auth=(settings.XENDIT_SECRET_KEY, ''), timeout=12)
            if not response.ok:
                continue
            data = response.json()
            if isinstance(data, dict) and data.get('status') in ('COMPLETED', 'EXPIRED', 'CANCELED'):
                if apply_xendit_status(payment.pk, data) == 'paid':
                    confirmed += 1
        except (requests.RequestException, ValueError, TypeError):
            continue
    return confirmed


class Command(BaseCommand):
    help = 'Verify shop payments with Xendit and dispatch paid physical orders.'

    def add_arguments(self, parser):
        parser.add_argument('--watch', action='store_true')
        parser.add_argument('--interval', type=int, default=30)

    def handle(self, *args, **options):
        while True:
            if not connection.in_atomic_block:
                close_old_connections()
            confirmed = reconcile_shop_payments()
            self.stdout.write(f'Shop payment reconciliation: {confirmed} confirmed.')
            if not options['watch']:
                return
            time.sleep(max(10, options['interval']))
