from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('users', '0006_application_rejection_notifications_and_log_reason')]

    operations = [
        migrations.AlterField(model_name='user', name='role', field=models.CharField(choices=[('buyer', 'Buyer'), ('artist', 'Artist'), ('hr', 'HR'), ('creative_moderator', 'Creative Moderator')], default='buyer', max_length=20)),
        migrations.AlterField(model_name='usernotification', name='application', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='users.artistapplication')),
        migrations.CreateModel(name='Artwork', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('title', models.CharField(max_length=200)), ('description', models.TextField()), ('category', models.CharField(max_length=100)),
            ('price', models.DecimalField(decimal_places=2, max_digits=12)), ('image_data', models.TextField()),
            ('status', models.CharField(choices=[('pending', 'Pending Creative Review'), ('approved', 'Approved'), ('declined', 'Declined')], default='pending', max_length=20)),
            ('decline_reason', models.TextField(blank=True)), ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
            ('artist', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='artworks', to='users.user')),
        ], options={'ordering': ['-created_at']}),
        migrations.CreateModel(name='DirectMessage', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')), ('body', models.TextField(max_length=2000)), ('is_read', models.BooleanField(default=False)), ('created_at', models.DateTimeField(auto_now_add=True)),
            ('recipient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='received_messages', to='users.user')), ('sender', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_messages', to='users.user')),
        ], options={'ordering': ['created_at']}),
        migrations.CreateModel(name='ArtworkReviewLog', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')), ('action', models.CharField(max_length=20)), ('previous_status', models.CharField(blank=True, max_length=20)), ('new_status', models.CharField(max_length=20)), ('reason', models.TextField(blank=True)), ('created_at', models.DateTimeField(auto_now_add=True)),
            ('actor', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='artwork_review_logs', to='users.user')), ('artwork', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='review_logs', to='users.artwork')),
        ], options={'ordering': ['-created_at']}),
        migrations.AddField(model_name='usernotification', name='artwork', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='users.artwork')),
    ]
