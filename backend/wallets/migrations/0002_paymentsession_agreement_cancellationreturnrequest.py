from django.db import migrations, models
from django.db.models import Q
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("messaging", "0002_conversation_agreements"),
        ("users", "0010_activitylog"),
        ("wallets", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymentsession",
            name="agreement",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="payment_sessions", to="messaging.agreement"),
        ),
        migrations.CreateModel(
            name="CancellationReturnRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("request_type", models.CharField(choices=[("cancellation", "Cancellation"), ("return", "Return")], max_length=20)),
                ("reason", models.TextField()),
                ("status", models.CharField(choices=[("pending", "Pending review"), ("approved", "Approved"), ("declined", "Declined")], default="pending", max_length=20)),
                ("admin_note", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("payment_session", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="cancellation_requests", to="wallets.paymentsession")),
                ("requester", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="cancellation_requests", to="users.user")),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="reviewed_cancellation_requests", to="users.user")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(model_name="cancellationreturnrequest", constraint=models.UniqueConstraint(condition=Q(("status", "pending")), fields=("payment_session", "requester", "request_type"), name="unique_open_request_type")),
    ]
