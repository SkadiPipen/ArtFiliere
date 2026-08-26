# Generated manually to bring the database schema in sync with users.models.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_user_contact_number_user_date_of_birth_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[('buyer', 'Buyer'), ('artist', 'Artist')],
                default='buyer',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='ArtistApplication',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('hourly_rate', models.DecimalField(decimal_places=2, max_digits=10)),
                ('tin_number', models.CharField(blank=True, max_length=20, null=True)),
                ('bio', models.TextField(blank=True, null=True)),
                ('bir_certificate', models.CharField(max_length=255)),
                ('sworn_declaration', models.CharField(max_length=255)),
                ('portfolio', models.JSONField(default=list)),
                ('status', models.CharField(choices=[('pending', 'Pending HR Approval'), ('approved', 'Approved'), ('rejected', 'Rejected')], default='pending', max_length=20)),
                ('submitted_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='artist_application', to='users.user')),
            ],
        ),
    ]
