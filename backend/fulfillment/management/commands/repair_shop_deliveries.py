from django.core.management.base import BaseCommand
from django.db import transaction
from wallets.models import PaymentSession
from fulfillment.models import DeliveryOrder
from fulfillment.services import ensure_shop_delivery
from delivery.models import Order
from users.models import User


class Command(BaseCommand):
    help = 'Recover paid physical purchases into the verified driver queue, preserving legacy delivery progress.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')

    @transaction.atomic
    def handle(self, *args, **options):
        recovered = skipped = 0
        for payment in PaymentSession.objects.filter(status='paid', artwork__art_type__iexact='physical').select_related('agreement', 'buyer', 'artist', 'artwork'):
            if DeliveryOrder.objects.filter(payment=payment).exists(): continue
            legacy = Order.objects.filter(payment=payment).select_related('assigned_rider__user').first()
            driver = None
            if legacy and legacy.status not in ('PENDING', 'CANCELED'):
                if legacy.assigned_rider:
                    driver = User.objects.filter(username=legacy.assigned_rider.user.username, role__in=['driver', 'rider']).first()
                if not driver and legacy.status != 'DELIVERED':
                    skipped += 1; continue
            if legacy and legacy.status == 'CANCELED':
                skipped += 1; continue
            if options['apply']:
                order = ensure_shop_delivery(payment, notify=not legacy or legacy.status == 'PENDING')
                if legacy:
                    order.status = legacy.status.lower()
                    order.driver = driver
                    order.pickup_proof = legacy.pickup_proof or ''
                    order.delivery_proof = legacy.delivery_proof or ''
                    order.created_at = legacy.created_at
                    order.timeline = {order.status: legacy.updated_at.isoformat()}
                    if legacy.status == 'DELIVERED': order.delivered_at = legacy.updated_at
                    order.save()
            recovered += 1
        self.stdout.write(f'{"Recovered" if options["apply"] else "Would recover"}: {recovered}; skipped for manual review: {skipped}.')
