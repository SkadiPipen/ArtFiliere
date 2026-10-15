from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone
from messaging.models import Agreement, RoyaltyPeriod
from messaging.royalties import ensure_periods
from messaging.royalty_payments import collect, provider, reconcile
from notifications.models import UserNotification


class Command(BaseCommand):
    help = 'Generate due royalty periods, notify participants, collect approved authorized royalties, and reconcile pending payments. Run hourly.'

    def handle(self, **options):
        for agreement in Agreement.objects.filter(status='accepted', compensation_type__in=['royalty', 'hybrid']):
            ensure_periods(agreement)
        for period in RoyaltyPeriod.objects.select_related('agreement').exclude(status__in=['paid', 'zero_due']):
            if timezone.localdate() >= period.ends_on:
                message = f'Royalty report #{period.pk} for agreement #{period.agreement_id} is due {period.due_on}. Submit evidence; artist approval is required before collection.'
                UserNotification.objects.get_or_create(user=period.agreement.buyer, title="Royalty report due", message=message)
            if period.status == 'submitted':
                UserNotification.objects.get_or_create(user=period.agreement.artist, title='Review royalty report', message=f'Royalty report #{period.pk} is ready for your evidence review.')
            if period.status == 'approved':
                collect(period.pk)
            elif period.status == 'collecting' and period.provider_request_id:
                try:
                    reconcile(period.pk, provider('GET', '/v3/payment_requests/' + period.provider_request_id))
                except Exception as error:
                    self.stderr.write(f'Report {period.pk}: reconciliation unavailable ({type(error).__name__}).')
        self.stdout.write('Royalty reporting and collection processing complete.')
