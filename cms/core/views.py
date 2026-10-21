import hashlib
import secrets
from copy import deepcopy
from django.db import connection
from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.http import Http404, HttpResponseNotModified
from django.shortcuts import get_object_or_404, render
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.clickjacking import xframe_options_sameorigin
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .crm import CRMUnavailable, crm_get
from .documents import StrictSerializer, layout_tree, theme_tokens
from .models import Layout, Page, Plugin, Publication, Site, Theme
from .registry import registry
from .services import document_for, publish_page, require_site, save_document, sites_for, validate_document
from .starter import import_site


def page_query():
    return Page.objects.select_related("site__theme", "layout", "published").prefetch_related("blocks", "site__menus")


@never_cache
@login_required
@ensure_csrf_cookie
def editor(request):
    if not request.user.is_staff:
        from django.core.exceptions import PermissionDenied
        raise PermissionDenied
    return render(request, "cms/editor.html")


@never_cache
@api_view(["GET"])
def bootstrap(request):
    return Response({
        "sites": [{"id": s.id, "name": s.name, "slug": s.slug, "crm_id": s.crm_id, "enabled": s.enabled,
                   "can_publish": request.user.is_superuser or any(m.user_id == request.user.id and m.can_publish for m in s.sitemember_set.all())}
                  for s in sites_for(request.user).prefetch_related("sitemember_set")],
        "themes": list(Theme.objects.values("key", "name")),
        "layouts": list(Layout.objects.values("key", "name", "definition")),
        "modules": [{"key": m.key, "label": m.label, "async": m.data is not None} for m in registry.modules.values()],
        "can_import": request.user.is_superuser,
    })


@never_cache
@api_view(["POST"])
def import_crm(request):
    if not request.user.is_superuser:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Only administrators may import CRM sites.")
    crm_id = request.data.get("crm_id")
    if not isinstance(crm_id, str) or len(crm_id) > 80:
        raise serializers.ValidationError({"crm_id": "Choose a CRM site."})
    try:
        record = next((r for r in crm_get("casinos") if r["id"] == crm_id), None)
    except CRMUnavailable as exc:
        return Response({"detail": str(exc)}, status=503)
    if record is None:
        raise Http404("CRM site not found.")
    site = import_site(record)
    return Response({"id": site.id}, status=200)


@never_cache
@api_view(["GET"])
def crm_sites(request):
    try:
        linked = {s.crm_id: s for s in sites_for(request.user).prefetch_related("sitemember_set")}
        return Response({"items": [{"crm_id": r["id"], "name": r["name"], "enabled": r["enabled"],
            "id": linked[r["id"]].id if r["id"] in linked else None}
            for r in crm_get("casinos") if request.user.is_superuser or r["id"] in linked]})
    except CRMUnavailable as exc:
        return Response({"detail": str(exc)}, status=503)


@never_cache
@api_view(["GET", "PATCH"])
def draft(request, site_id):
    require_site(request.user, site_id)
    page = get_object_or_404(page_query(), site_id=site_id, slug="home")
    if request.method == "PATCH":
        page = save_document(page.id, request.data)
        page = page_query().get(pk=page.pk)
    return Response({"document": document_for(page), "published_revision": page.published.revision if page.published_id else None})


class RevisionSerializer(StrictSerializer):
    revision = serializers.IntegerField(min_value=1)


@never_cache
@api_view(["POST"])
def publish(request, site_id):
    site = require_site(request.user, site_id, publish=True)
    serializer = RevisionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    page = get_object_or_404(Page, site=site, slug="home")
    publication = publish_page(page.id, serializer.validated_data["revision"], request.user)
    return Response({"revision": publication.revision, "url": f"/cms/sites/{site.slug}/"})


def render_document(request, doc, site, preview=False, publication=None, token=""):
    template = registry.layouts.get(doc["renderer"])
    if not template:
        raise Http404("Layout renderer is not installed.")
    editing = preview and request.GET.get("standalone") != "1"
    if editing:
        doc["sections"] = [{**section, "blocks": [b for b in doc["blocks"] if b["slot"] == section["slot"]]}
                           for section in doc["sections"]]
    blocks = [b for section in doc["sections"] for b in section["blocks"]]
    for b in blocks:
        if b["kind"] == "seo":
            from .modules import SEOProps
            b["props"]["html"] = SEOProps().validate_html(b["props"].get("html", ""))
        b["async"] = bool(registry.modules[b["kind"]].data)
        b["data_url"] = (f"/cms/api/sites/{site.id}/widgets/{b['key']}/?preview={token}" if preview else
                         f"/cms/api/public/{site.slug}/{publication.id}/widgets/{b['key']}/")
    return render(request, template, {
        "doc": doc, "site": site, "preview": preview,
        "editing": editing,
        "tokens": [(key, value) for key, value in theme_tokens(doc["tokens"]).items()],
        "islands": [{"key": b["key"], "kind": b["kind"], "url": b["data_url"], "props": b["props"]} for b in blocks if b["async"]],
        "content_sections": [{**s, "blocks": [b for b in s["blocks"] if b["kind"] not in ("header_profile", "tab_menu", "main_menu")]}
                             for s in doc["sections"]],
        "profile_blocks": [b for b in blocks if b["kind"] == "header_profile"],
        "tab_blocks": [b for b in blocks if b["kind"] == "tab_menu"],
        "menu_blocks": [b for b in blocks if b["kind"] == "main_menu"],
    })


@never_cache
@login_required
@xframe_options_sameorigin
def preview(request, site_id):
    if not request.user.is_staff:
        from django.core.exceptions import PermissionDenied
        raise PermissionDenied()
    site = require_site(request.user, site_id)
    token = request.GET.get("token", "")
    if token:
        doc = preview_document(request, site, token)
        return render_document(request, doc, site, preview=True, token=token)
    page = get_object_or_404(page_query(), site=site, slug="home")
    doc, layout, theme = validate_document(document_for(page))
    doc.update(site_name=site.name, renderer=layout.renderer, tokens=theme.tokens, sections=layout_tree(layout, doc["blocks"]))
    return render_document(request, doc, site, preview=True)


def preview_document(request, site, token):
    data = cache.get("cms:preview:" + token[:100])
    if not data or data["user_id"] != request.user.id or data["site_id"] != site.id:
        raise Http404("Preview expired or unavailable. Make a change or reload the editor.")
    return deepcopy(data["document"])


@never_cache
@api_view(["POST"])
def create_preview(request, site_id):
    site = require_site(request.user, site_id)
    doc, layout, theme = validate_document(request.data)
    doc.update(site_name=site.name, renderer=layout.renderer, tokens=theme.tokens, sections=layout_tree(layout, doc["blocks"]))
    token = secrets.token_urlsafe(32)
    cache.set("cms:preview:" + token, {"user_id": request.user.id, "site_id": site.id, "document": doc}, 300)
    return Response({"url": f"/cms/preview/{site.id}/?token={token}"})


def public_page(request, slug):
    page = get_object_or_404(Page.objects.select_related("site", "published").defer("published__document"),
        site__slug=slug, site__enabled=True, slug="home", published__isnull=False)
    etag = '"' + hashlib.sha256(f"{page.published_id}:{page.published.revision}".encode()).hexdigest() + '"'
    if request.headers.get("If-None-Match") == etag:
        response = HttpResponseNotModified()
        response["ETag"] = etag
        response["Cache-Control"] = "public, max-age=0, must-revalidate"
        return response
    cache_key = f"cms:publication:v1:{page.published_id}"
    doc = cache.get(cache_key)
    if doc is None:
        doc = page.published.document
        cache.set(cache_key, doc, 3600)
    doc = deepcopy(doc)
    response = render_document(request, doc, page.site, publication=page.published)
    response["ETag"] = etag
    response["Cache-Control"] = "public, max-age=0, must-revalidate"
    return response


@never_cache
def health(request):
    from django.http import JsonResponse
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    cache.set("cms:health", "ok", 10)
    if cache.get("cms:health") != "ok":
        return JsonResponse({"status": "cache unavailable"}, status=503)
    return JsonResponse({"status": "ok"})


def widget_result(site, doc, key, *, include_hidden=False):
    block = next((b for b in doc["blocks"] if b["key"] == key and (b["enabled"] or include_hidden)), None)
    if not block:
        raise Http404("Block not found.")
    module = registry.modules.get(block["kind"])
    if not module or not module.data:
        raise Http404("Widget is not registered.")
    if Plugin.objects.filter(key=block["kind"].split(".")[0], enabled=False).exists():
        return Response({"detail": "This plugin is disabled."}, status=503)
    try:
        return Response(module.data(site, block["props"]))
    except CRMUnavailable as exc:
        return Response({"detail": str(exc)}, status=503)


@never_cache
@api_view(["GET"])
def draft_widget(request, site_id, key):
    site = require_site(request.user, site_id)
    token = request.GET.get("preview")
    if token:
        return widget_result(site, preview_document(request, site, token), key, include_hidden=True)
    page = get_object_or_404(page_query(), site=site, slug="home")
    return widget_result(site, document_for(page), key, include_hidden=True)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_widget(request, slug, publication_id, key):
    publication = get_object_or_404(Publication.objects.select_related("page__site"),
        pk=publication_id, page__site__slug=slug, page__site__enabled=True, page__published_id=publication_id)
    response = widget_result(publication.page.site, publication.document, key)
    response["Cache-Control"] = "public, max-age=0, must-revalidate"
    return response
