from django.apps import AppConfig


class FulfillmentConfig(AppConfig):
    name = 'fulfillment'

    def ready(self):
        from django.db.models.signals import post_save
        from commissions.models import CommissionRequest
        from .certificates import issue_certificate

        def completed_commission(sender, instance, raw=False, **kwargs):
            if not raw and instance.status == 'COMPLETE':
                issue_certificate(instance, commission=True)

        post_save.connect(completed_commission, sender=CommissionRequest, weak=False, dispatch_uid='issue_completed_commission_coa')
