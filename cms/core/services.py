from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from .documents import DocumentSerializer, layout_tree, theme_tokens
from .models import ContentBlock, Layout, Page, Plugin, Publication, Site, SiteMember, Theme
from .registry import registry


class Conflict(APIException):
    status_code = 409
    default_detail = "The draft changed in another session. Reload before saving."


def sites_for(user):
    if user.is_superuser:
        return Site.objects.all()
    return Site.objects.filter(sitemember__user=user)


def require_site(user, pk, publish=False):
    site = get_object_or_404(sites_for(user), pk=pk)
    if publish and not user.is_superuser and not SiteMember.objects.filter(site=site, user=user, can_publish=True).exists():
        raise PermissionDenied("Publishing permission is required for this site.")
    return site


def document_for(page):
    menu = page.navigation if page.navigation is not None else next((m.items for m in page.site.menus.all() if m.key == "main"), [])
    return {
        "revision": page.revision, "title": page.title, "slug": page.slug,
        "layout": page.layout.key, "theme": (page.theme_override or page.site.theme).key,
        "menu": menu,
        "blocks": [{"key": b.key, "kind": b.kind, "slot": b.slot, "enabled": b.enabled, "props": b.props,
                    "translations": b.translations}
                   for b in page.blocks.all()],
    }


def validate_document(raw):
    serializer = DocumentSerializer(data=raw)
    serializer.is_valid(raise_exception=True)
    doc = serializer.validated_data
    layout = get_object_or_404(Layout, key=doc["layout"])
    theme = get_object_or_404(Theme, key=doc["theme"])
    layout_tree(layout, doc["blocks"])
    theme_tokens(theme.tokens)
    disabled = set(Plugin.objects.filter(enabled=False).values_list("key", flat=True))
    if any(b["enabled"] and b["kind"].split(".")[0] in disabled for b in doc["blocks"]):
        raise ValidationError("An enabled block uses a disabled plugin.")
    return doc, layout, theme


@transaction.atomic
def save_document(page_id, raw):
    doc, layout, theme = validate_document(raw)
    page = Page.objects.select_for_update().select_related("site").get(pk=page_id)
    if doc["revision"] != page.revision:
        raise Conflict()
    slug = doc.get("slug", page.slug)
    if page.slug == "home" and slug != "home" or page.slug != "home" and slug == "home":
        raise ValidationError({"slug": "Home page URL is reserved."})
    if Page.objects.filter(site=page.site, slug=slug).exclude(pk=page.pk).exists():
        raise ValidationError({"slug": "A page with this URL already exists."})
    page.slug = slug
    page.title, page.layout = doc["title"], layout
    page.revision += 1
    page.theme_override = theme
    page.navigation = doc["menu"]
    try:
        with transaction.atomic():
            page.save(update_fields=["title", "slug", "layout", "revision", "updated_at", "theme_override", "navigation"])
    except IntegrityError as exc:
        if Page.objects.filter(site=page.site, slug=slug).exclude(pk=page.pk).exists():
            raise ValidationError({"slug": "A page with this URL already exists."}) from exc
        raise
    page.blocks.all().delete()
    ContentBlock.objects.bulk_create([ContentBlock(page=page, position=i, **block) for i, block in enumerate(doc["blocks"])])
    return page


@transaction.atomic
def publish_page(page_id, revision, author):
    page = Page.objects.select_for_update().select_related("site__theme", "layout").prefetch_related("blocks", "site__menus").get(pk=page_id)
    if page.revision != revision:
        raise Conflict()
    if page.published_id and page.published.revision == revision:
        return page.published
    doc, layout, theme = validate_document(document_for(page))
    doc["site_name"] = page.site.name
    doc["tokens"] = theme_tokens(theme.tokens)
    doc["sections"] = layout_tree(layout, doc["blocks"])
    doc["renderer"] = layout.renderer
    for hook in registry.publish_hooks:
        hook(page, doc)
    publication = Publication.objects.create(page=page, revision=revision, document=doc, author=author)
    page.published = publication
    page.save(update_fields=["published"])
    return publication
