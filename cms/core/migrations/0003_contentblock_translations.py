from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0002_demo_modules")]
    operations = [
        migrations.AddField(
            model_name="contentblock", name="translations",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
