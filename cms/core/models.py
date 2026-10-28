from django.conf import settings
from django.db import models


class Theme(models.Model):
    key = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    tokens = models.JSONField(default=dict)

    def __str__(self):
        return self.name


class Layout(models.Model):
    key = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    renderer = models.SlugField(default="home")
    definition = models.JSONField(default=dict)

    def __str__(self):
        return self.name


class Site(models.Model):
    crm_id = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(unique=True)
    public_slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    url = models.URLField(max_length=2048)
    enabled = models.BooleanField(default=True, db_index=True)
    theme = models.ForeignKey(Theme, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class SiteMember(models.Model):
    site = models.ForeignKey(Site, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    can_publish = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["site", "user"], name="cms_site_user_unique")]


class Page(models.Model):
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="pages")
    slug = models.SlugField(default="home")
    title = models.CharField(max_length=160)
    layout = models.ForeignKey(Layout, on_delete=models.PROTECT)
    theme_override = models.ForeignKey(Theme, null=True, blank=True, on_delete=models.PROTECT)
    navigation = models.JSONField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=1)
    published = models.ForeignKey("Publication", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["site", "slug"], name="cms_site_page_unique")]


class ContentBlock(models.Model):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="blocks")
    key = models.SlugField(max_length=80)
    kind = models.CharField(max_length=80)
    slot = models.SlugField(default="main")
    position = models.PositiveIntegerField()
    enabled = models.BooleanField(default=True)
    props = models.JSONField(default=dict)
    translations = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [models.UniqueConstraint(fields=["page", "key"], name="cms_page_block_unique")]
        indexes = [models.Index(fields=["page", "slot", "position"], name="cms_block_render_idx")]


class NavigationMenu(models.Model):
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="menus")
    key = models.SlugField()
    items = models.JSONField(default=list)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["site", "key"], name="cms_site_menu_unique")]


class Plugin(models.Model):
    key = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    enabled = models.BooleanField(default=True)
    description = models.TextField(blank=True)


class Publication(models.Model):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="publications")
    revision = models.PositiveIntegerField()
    document = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["page", "revision"], name="cms_publication_unique")]
        indexes = [models.Index(fields=["page", "-created_at"], name="cms_publication_date_idx")]


class PopularRanking(models.Model):
    site = models.ForeignKey(Site, on_delete=models.CASCADE)
    fingerprint = models.CharField(max_length=64)
    payload = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["site", "fingerprint"], name="cms_popular_snapshot_unique")]
