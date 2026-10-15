from datetime import timedelta
import time
import requests
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction, close_old_connections, connection
from django.utils import timezone
from users.models import User
from wallets.models import SupportTicket
from commissions.models import CommissionRequest, CommissionMilestone, CommissionLedger, CommissionProof, CommissionResale
from commissions.lifecycle import expire, notify, attempt_payout, apply_payout
from commissions.resale import remit_royalty, royalty_status


class Command(BaseCommand):
    help = 'Expire unpaid bookings, remind reviewers, escalate overdue reviews and reconcile commission payouts.'

    def add_arguments(self, parser):
        parser.add_argument('--record-proofs', action='store_true')
        parser.add_argument('--watch', action='store_true', help='Process continuously for local development.')
        parser.add_argument('--interval', type=int, default=60)

    def handle(self, *args, **options):
        while True:
            try:
                if not connection.in_atomic_block: close_old_connections()
                self.process(options)
            except Exception as error:
                self.stderr.write(f'Commission worker failed: {type(error).__name__}')
                if not options['watch']: raise
            if not options['watch']: return
            time.sleep(max(10, options['interval']))

    def process(self, options):
        now = timezone.now()
        if settings.XENDIT_SECRET_KEY:
            from commissions.lifecycle import apply_funding
            for c in CommissionRequest.objects.filter(flow_version=2, funded_at__isnull=True).exclude(funding_provider_id=''):
                try:
                    response = requests.get(f'https://api.xendit.co/v2/invoices/{c.funding_provider_id}', auth=(settings.XENDIT_SECRET_KEY, ''), timeout=20)
                    response.raise_for_status(); apply_funding(response.json())
                except Exception as error: self.stderr.write(f'Funding #{c.pk} remains pending: {type(error).__name__}')
        for pk in CommissionRequest.objects.filter(flow_version=2, status='AWAITING_FUNDS', funding_due_at__lte=now).values_list('pk', flat=True):
            with transaction.atomic():
                c = CommissionRequest.objects.select_for_update().get(pk=pk); expire(c)
        for pk in CommissionMilestone.objects.filter(commission_req__flow_version=2, status='SUBMITTED', approved_at__isnull=True, review_due_at__lte=now + timedelta(days=2)).values_list('pk', flat=True):
            with transaction.atomic():
                m = CommissionMilestone.objects.get(pk=pk)
                c = CommissionRequest.objects.select_for_update().get(pk=m.commission_req_id)
                _, created = CommissionLedger.objects.get_or_create(reference=f'review-reminder-{m.pk}-{m.submissions.count()}', defaults={'commission': c, 'kind': 'REVIEW_REMINDER', 'amount': 0})
                if created: notify(c, c.buyer, 'Commission review reminder', f'Review {m.stage_label}. One revision comment is allowed. No automatic approval.')
                if m.review_due_at <= now:
                    _, created = CommissionLedger.objects.get_or_create(reference=f'review-overdue-{m.pk}-{m.submissions.count()}', defaults={'commission': c, 'kind': 'REVIEW_ESCALATION', 'amount': 0})
                    if created:
                        c.disputed = True; c.save(update_fields=['disputed'])
                        ticket = SupportTicket.objects.create(requester=c.buyer, commission=c, concern='commission_dispute', details=f'Buyer review overdue for stage {m.milestone_number}. No automatic approval; unreleased funds frozen.')
                        for staff in User.objects.filter(role='customer_support'): notify(c, staff, 'Overdue commission review', f'Ticket #{ticket.pk} requires a decision.')
        for m in CommissionMilestone.objects.filter(commission_req__flow_version=2, approved_at__isnull=False, payout_status__in=['PROCESSING', 'RETRY_PENDING', 'CONFIG_REQUIRED', 'NOT_REQUESTED']):
            try:
                if m.payout_provider_id and settings.XENDIT_SECRET_KEY:
                    response = requests.get(f'https://api.xendit.co/v3/payouts/{m.payout_provider_id}', auth=(settings.XENDIT_SECRET_KEY, ''), headers={'api-version': '2025-09-01'}, timeout=20)
                    response.raise_for_status(); apply_payout(m, response.json())
                else: attempt_payout(m.pk)
            except Exception as error: self.stderr.write(f'Payout #{m.pk} remains pending: {type(error).__name__}')
        for resale in CommissionResale.objects.filter(settled_at__isnull=False, payout_status__in=['PROCESSING', 'RETRY_PENDING', 'CONFIG_REQUIRED']):
            try:
                if resale.payout_provider_id and settings.XENDIT_SECRET_KEY:
                    response = requests.get(f'https://api.xendit.co/v3/payouts/{resale.payout_provider_id}', auth=(settings.XENDIT_SECRET_KEY, ''), headers={'api-version': '2025-09-01'}, timeout=20)
                    response.raise_for_status(); royalty_status(resale, response.json())
                else: remit_royalty(resale.pk)
            except Exception as error: self.stderr.write(f'Royalty #{resale.pk} remains pending: {type(error).__name__}')
        if options['record_proofs']:
            from commissions.proofs import process_proof
            from django.db.models import Q
            rows = CommissionProof.objects.exclude(status='CONFIRMED')
            if settings.COMMISSION_IPFS_API_URL:
                rows = CommissionProof.objects.filter(~Q(status='CONFIRMED') | Q(submission__cid=''))
            for proof in rows.order_by('pk')[:5]: process_proof(proof)
        self.stdout.write('Commission events processed.')
