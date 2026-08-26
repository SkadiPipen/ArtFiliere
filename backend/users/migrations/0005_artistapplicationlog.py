from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_alter_user_role'),
    ]

    operations = [
        migrations.CreateModel(
            name='ArtistApplicationLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('submitted', 'Application submitted'), ('approved', 'Application approved'), ('rejected', 'Application rejected')], max_length=20)),
                ('previous_status', models.CharField(blank=True, max_length=20)),
                ('new_status', models.CharField(max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='artist_application_logs', to='users.user')),
                ('application', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='activity_logs', to='users.artistapplication')),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
