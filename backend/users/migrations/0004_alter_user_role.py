from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_user_role_artistapplication'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[('buyer', 'Buyer'), ('artist', 'Artist'), ('hr', 'HR')],
                default='buyer',
                max_length=20,
            ),
        ),
    ]
