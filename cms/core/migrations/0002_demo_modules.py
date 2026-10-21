from django.db import migrations


def upgrade(apps, schema_editor):
    Layout = apps.get_model("core", "Layout")
    Page = apps.get_model("core", "Page")
    Block = apps.get_model("core", "ContentBlock")
    Layout.objects.filter(key="home", name="/h Home").update(name="NexLuck Demo Layout")
    for page in Page.objects.all().iterator():
        added = False
        for i, (kind, title) in enumerate([
            ("header_profile", "Header profile details"), ("tab_menu", "Tab menu"),
            ("main_menu", "Main menu"), ("seo", "SEO text"),
        ]):
            if Block.objects.filter(page=page, kind=kind).exists():
                continue
            base = kind.replace("_", "-") + "-default"
            key, suffix = base, 1
            while Block.objects.filter(page=page, key=key).exists():
                key = f"{base}-{suffix}"
                suffix += 1
            Block.objects.create(page=page, key=key, kind=kind,
                position=100 + i, props={"title": title, **({"html": "<p>Discover casino games, providers, promotions and rewards. Play responsibly.</p>"} if kind == "seo" else {})})
            added = True
        if added:
            page.revision += 1
            page.save(update_fields=["revision"])


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]
    operations = [migrations.RunPython(upgrade, migrations.RunPython.noop)]
