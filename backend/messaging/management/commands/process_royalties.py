from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone
from messaging.models import Agreement, RoyaltyPeriod
from messaging.royalties import ensure_periods
from messaging.royalty_payments import collect, provider, reconcile
from notifications.models import UserNotification
from users.models import User
from messaging.models import RoyaltyFunding
from messaging.royalty_funding import apply_session
from datetime import timedelta


class Command(BaseCommand):
    help = 'Generate due royalty periods, notify participants, collect approved authorized royalties, and reconcile pending payments. Run hourly.'

    def add_arguments(self, parser):
        parser.add_argument('--watch', action='store_true')
        parser.add_argument('--interval', type=int, default=60)

    def handle(self, **options):
        import time
        while True:
            self.process_once()
            if not options.get('watch'):
                break
            time.sleep(max(30, options.get('interval', 60)))

    def process_once(self):
        for agreement in Agreement.objects.filter(status='accepted', compensation_type__in=['royalty', 'hybrid']):
            ensure_periods(agreement)
        for funding in RoyaltyFunding.objects.filter(status='pending').exclude(session_id=''):
            try:
                apply_session(funding.pk, provider('GET', '/sessions/' + funding.session_id))
            except Exception as error:
                self.stderr.write(f'Royalty payment {funding.pk}: reconciliation unavailable ({type(error).__name__}).')
        for period in RoyaltyPeriod.objects.select_related('agreement').exclude(status__in=['paid', 'zero_due']):
            if period.terms.get('review_mode') == 'admin_held':
                if period.status in ('submitted', 'funded'):
                    for admin in User.objects.filter(role='platform_admin'):
                        UserNotification.objects.get_or_create(user=admin, title='Verify royalty report', message=f'Report #{period.pk} requires evidence verification. Payment status: {period.status}. Release only verified held funds.')
                if period.status in ('awaiting_report', 'rejected') and timezone.localdate() >= period.ends_on:
                    UserNotification.objects.get_or_create(user=period.agreement.buyer, title='Royalty report due', message=f'Report #{period.pk} is due {period.due_on - timedelta(days=7)}. Payment is due {period.due_on}.')
                continue
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
