from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("users", "0008_remove_usernotification_application_and_more")]
    operations = [migrations.AlterField(model_name="user", name="role", field=models.CharField(choices=[("buyer", "Buyer"), ("artist", "Artist"), ("hr", "HR"), ("creative_moderator", "Creative Moderator"), ("platform_admin", "Platform Admin")], default="buyer", max_length=20))]
