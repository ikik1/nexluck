from django.db import migrations, models
from django.utils.text import slugify


def populate_slugs(apps, schema_editor):
    Site = apps.get_model("core", "Site")
    used = set()
    for site in Site.objects.using(schema_editor.connection.alias).order_by("pk"):
        base = slugify(site.name)[:50] or "casino"
        slug = base
        number = 2
        while slug in used:
            suffix = f"-{number}"
            slug = base[:50 - len(suffix)] + suffix
            number += 1
        used.add(slug)
        site.public_slug = slug
        site.save(using=schema_editor.connection.alias, update_fields=["public_slug"])


class Migration(migrations.Migration):
    dependencies = [("core", "0005_page_configuration")]
    operations = [
        migrations.AddField(model_name="site", name="public_slug", field=models.SlugField(null=True, unique=True)),
        migrations.RunPython(populate_slugs, migrations.RunPython.noop),
        migrations.AlterField(model_name="site", name="public_slug", field=models.SlugField(unique=True)),
    ]
