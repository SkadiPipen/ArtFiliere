from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("users", "0009_user_platform_admin_role")]

    operations = [
        migrations.CreateModel(
            name="ActivityLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=80)),
                ("description", models.CharField(max_length=255)),
                ("reference_type", models.CharField(blank=True, default="", max_length=50)),
                ("reference_id", models.PositiveIntegerField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="activity_logs", to="users.user")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
