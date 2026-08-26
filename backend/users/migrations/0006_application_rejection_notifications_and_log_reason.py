from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0005_artistapplicationlog'),
    ]

    operations = [
        migrations.AddField(model_name='artistapplication', name='rejection_reason', field=models.TextField(blank=True)),
        migrations.AddField(model_name='artistapplicationlog', name='reason', field=models.TextField(blank=True)),
        migrations.CreateModel(
            name='UserNotification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=120)),
                ('message', models.TextField()),
                ('is_read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('application', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='users.artistapplication')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='users.user')),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
