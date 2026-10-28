import hashlib
import secrets
import json
from copy import deepcopy
from django.conf import settings
from django.db import connection
from django.db import IntegrityError, transaction
from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.http import Http404, HttpResponseNotModified
from django.utils import translation
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
from .models import ContentBlock, Layout, Page, Plugin, Publication, Site, Theme
from .registry import registry
from .services import document_for, publish_page, require_site, save_document, sites_for, validate_document
from .starter import import_site
from .i18n import DJANGO_LOCALES, catalog, localized_document, t, website_locale
from .popular import context_query, demo_context


def page_query():
    return Page.objects.select_related("site__theme", "theme_override", "layout", "published").prefetch_related("blocks", "site__menus")


def selected_page(request, site_id):
    page_id = request.GET.get("page")
    if page_id is not None:
        if not page_id.isascii() or not page_id.isdecimal():
            raise serializers.ValidationError({"page": "Choose a valid page."})
        return get_object_or_404(page_query(), site_id=site_id, pk=page_id)
    return get_object_or_404(page_query(), site_id=site_id, slug="home")


def page_url(page):
    return f"/site/{page.site.public_slug}/" + ("" if page.slug == "home" else f"{page.slug}/")


def page_record(page):
    return {"id": page.pk, "title": page.title, "slug": page.slug, "revision": page.revision,
            "published_revision": page.published.revision if page.published_id else None, "url": page_url(page)}


class CreatePageInput(StrictSerializer):
    title = serializers.CharField(max_length=160)
    slug = serializers.SlugField(max_length=50)
    source_id = serializers.IntegerField(min_value=1, required=False)


@never_cache
@api_view(["GET", "POST"])
def pages(request, site_id):
    site = require_site(request.user, site_id)
    if request.method == "POST":
        serializer = CreatePageInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        if values["slug"] == "home":
            raise serializers.ValidationError({"slug": "Home page URL is reserved."})
        source = get_object_or_404(page_query(), site=site, pk=values["source_id"]) if "source_id" in values else None
        home = get_object_or_404(page_query(), site=site, slug="home")
        base = document_for(source or home)
        try:
            with transaction.atomic():
                page = Page.objects.create(site=site, slug=values["slug"], title=values["title"],
                    layout=(source or home).layout, theme_override=Theme.objects.get(key=base["theme"]),
                    navigation=base["menu"] if source else [])
                if source:
                    ContentBlock.objects.bulk_create([ContentBlock(page=page, position=i, **block)
                        for i, block in enumerate(base["blocks"])])
        except IntegrityError as exc:
            if Page.objects.filter(site=site, slug=values["slug"]).exists():
                raise serializers.ValidationError({"slug": "A page with this URL already exists."}) from exc
            raise
        return Response(page_record(page), status=201)
    return Response({"items": [page_record(page) for page in page_query().filter(site=site).order_by("id")]})


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
        "popular_demo_inputs": settings.POPULAR_DEMO_INPUTS,
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
        return Response({"detail": t(str(exc))}, status=503)
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
        return Response({"detail": t(str(exc))}, status=503)


@never_cache
@api_view(["GET", "PATCH"])
def draft(request, site_id):
    require_site(request.user, site_id)
    page = selected_page(request, site_id)
    if request.method == "PATCH":
        page = save_document(page.id, request.data)
        page = page_query().get(pk=page.pk)
    return Response({"document": document_for(page), "published_revision": page.published.revision if page.published_id else None,
                     "page": page_record(page)})


class RevisionSerializer(StrictSerializer):
    revision = serializers.IntegerField(min_value=1)


@never_cache
@api_view(["POST"])
def publish(request, site_id):
    site = require_site(request.user, site_id, publish=True)
    serializer = RevisionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    page = selected_page(request, site.pk)
    publication = publish_page(page.id, serializer.validated_data["revision"], request.user)
    return Response({"revision": publication.revision, "url": page_url(page)})


def render_document(request, doc, site, preview=False, publication=None, token="", preview_page_id=None):
    locale = website_locale(request)
    doc = localized_document(doc, locale)
    template = registry.layouts.get(doc["renderer"])
    if not template:
        raise Http404("Layout renderer is not installed.")
    editing = preview and request.GET.get("standalone") != "1"
    if editing:
        doc["sections"] = [{**section, "blocks": [b for b in doc["blocks"] if b["slot"] == section["slot"]]}
                           for section in doc["sections"]]
    blocks = [b for section in doc["sections"] for b in section["blocks"]]
    popular_key = request.GET.get("popular")
    if popular_key and not any(b["key"] == popular_key and b["kind"] == "games" and b["enabled"] for b in blocks):
        raise Http404("Popular module not found.")
    preview_page = preview_page_id or (selected_page(request, site.pk).pk if preview and request.GET.get("page") else None)
    for b in blocks:
        if b["kind"] == "seo":
            from .modules import SEOProps
            b["props"]["html"] = SEOProps().validate_html(b["props"].get("html", ""))
        b["async"] = bool(registry.modules[b["kind"]].data)
        b["data_url"] = (f"/cms/api/sites/{site.id}/widgets/{b['key']}/?preview={token}" if preview else
                         f"/cms/api/public/{site.slug}/{publication.id}/widgets/{b['key']}/?")
        b["data_url"] += ("&" if preview else "") + f"lang={locale}"
        if preview_page:
            b["data_url"] += "&page=" + str(preview_page)
        b["full_list"] = request.GET.get("popular") == b["key"] and b["kind"] == "games"
        if b["kind"] == "games":
            demo_context(request)
            b["skeletons"] = range(3 if b["full_list"] else b["props"].get("homeLimit", 10))
            extra = context_query(request)
            if extra:
                b["data_url"] += "&" + extra
            if request.GET.get("browse") == "1":
                b["data_url"] += "&browse=1"
            from urllib.parse import urlencode
            b["view_all_url"] = "?" + urlencode({**request.GET.dict(), "popular": b["key"]})
            b["back_url"] = "?" + urlencode({key: value for key, value in request.GET.items() if key != "popular"})
    response = render(request, template, {
        "doc": doc, "site": site, "preview": preview,
        "website_language": locale, "website_messages": catalog().get(locale, {}),
        "editing": editing,
        "tokens": [(key, value) for key, value in theme_tokens(doc["tokens"]).items()],
        "islands": [{"key": b["key"], "kind": b["kind"], "url": b["data_url"], "props": b["props"],
                     "fullList": b["full_list"], "viewAllUrl": b.get("view_all_url", "")} for b in blocks if b["async"]],
        "popular_page": request.GET.get("popular", ""),
        "content_sections": [{**s, "blocks": [b for b in s["blocks"] if b["kind"] not in ("header_profile", "tab_menu", "main_menu")]}
                             for s in doc["sections"]],
        "profile_blocks": [b for b in blocks if b["kind"] == "header_profile"],
        "tab_blocks": [b for b in blocks if b["kind"] == "tab_menu"],
        "menu_blocks": [b for b in blocks if b["kind"] == "main_menu"],
    })
    response["Content-Language"] = locale
    return response


@never_cache
@login_required
@xframe_options_sameorigin
@ensure_csrf_cookie
def preview(request, site_id):
    if not request.user.is_staff:
        from django.core.exceptions import PermissionDenied
        raise PermissionDenied()
    site = require_site(request.user, site_id)
    token = request.GET.get("token", "")
    if token:
        doc = preview_document(request, site, token)
        return render_document(request, doc, site, preview=True, token=token)
    page = selected_page(request, site.pk)
    doc, layout, theme = validate_document(document_for(page))
    doc.update(site_name=site.name, renderer=layout.renderer, tokens=theme.tokens, sections=layout_tree(layout, doc["blocks"]))
    return render_document(request, doc, site, preview=True)


def preview_document(request, site, token):
    data = cache.get("cms:preview:" + token[:100])
    if not data or data["user_id"] != request.user.id or data["site_id"] != site.id:
        raise Http404("Preview expired or unavailable. Make a change or reload the editor.")
    if request.GET.get("page") and data.get("page_id") != selected_page(request, site.pk).pk:
        raise Http404("Preview does not belong to this page.")
    return deepcopy(data["document"])


@never_cache
@api_view(["POST"])
def create_preview(request, site_id):
    locale = website_locale(request)
    site = require_site(request.user, site_id)
    page = selected_page(request, site_id)
    doc, layout, theme = validate_document(request.data)
    doc.update(site_name=site.name, renderer=layout.renderer, tokens=theme.tokens, sections=layout_tree(layout, doc["blocks"]))
    token = secrets.token_urlsafe(32)
    cache.set("cms:preview:" + token, {"user_id": request.user.id, "site_id": site.id, "page_id": page.pk, "document": doc}, 300)
    path = f"/site/{site.public_slug}/preview/{doc['revision']}/"
    if page.slug != "home":
        path += f"{doc.get('slug', page.slug)}/"
    return Response({"url": f"{path}?token={token}&lang={locale}&page={page.pk}"})


@never_cache
@login_required
@xframe_options_sameorigin
@ensure_csrf_cookie
def site_preview(request, site_slug, revision, page_slug="home"):
    site = get_object_or_404(sites_for(request.user), public_slug=site_slug)
    if not request.user.is_staff:
        from django.core.exceptions import PermissionDenied
        raise PermissionDenied()
    token = request.GET.get("token", "")
    page_id = None
    if token:
        doc = preview_document(request, site, token)
    else:
        page = get_object_or_404(page_query(), site=site, slug=page_slug)
        page_id = page.pk
        if request.GET.get("page") and selected_page(request, site.pk).pk != page.pk:
            raise Http404("Preview does not belong to this page.")
        doc, layout, theme = validate_document(document_for(page))
        doc.update(site_name=site.name, renderer=layout.renderer, tokens=theme.tokens, sections=layout_tree(layout, doc["blocks"]))
    if doc["revision"] != revision or doc.get("slug", "home") != page_slug:
        raise Http404("Preview does not match this URL.")
    return render_document(request, doc, site, preview=True, token=token, preview_page_id=page_id)


def site_page(request, site_slug, page_slug="home"):
    site = get_object_or_404(Site, public_slug=site_slug, enabled=True)
    return public_page(request, site.slug, page_slug)


@ensure_csrf_cookie
def public_page(request, slug, page_slug="home"):
    locale = website_locale(request)
    page = get_object_or_404(Page.objects.select_related("site", "published").defer("published__document"),
        site__slug=slug, site__enabled=True, slug=page_slug, published__isnull=False)
    etag = '"' + hashlib.sha256(f"popular-v1:{request.GET.urlencode()}:{locale}:{page.published_id}:{page.published.revision}".encode()).hexdigest() + '"'
    if request.headers.get("If-None-Match") == etag:
        response = HttpResponseNotModified()
        response["ETag"] = etag
        response["Cache-Control"] = "private, max-age=0, must-revalidate"
        response["Content-Language"] = locale
        return response
    cache_key = f"cms:publication:v2:{locale}:{page.published_id}"
    doc = cache.get(cache_key)
    if doc is None:
        doc = page.published.document
        cache.set(cache_key, doc, 3600)
    doc = deepcopy(doc)
    response = render_document(request, doc, page.site, publication=page.published)
    response["ETag"] = etag
    response["Cache-Control"] = "private, max-age=0, must-revalidate"
    response["Content-Language"] = locale
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


def widget_result(site, doc, key, *, include_hidden=False, locale="en", request=None):
    doc = localized_document(doc, locale)
    block = next((b for b in doc["blocks"] if b["key"] == key and (b["enabled"] or include_hidden)), None)
    if not block:
        raise Http404("Block not found.")
    module = registry.modules.get(block["kind"])
    if not module or not module.data:
        raise Http404("Widget is not registered.")
    if Plugin.objects.filter(key=block["kind"].split(".")[0], enabled=False).exists():
        return Response({"detail": t("This plugin is disabled.", locale)}, status=503)
    try:
        with translation.override(DJANGO_LOCALES.get(locale, locale)):
            if block["kind"] == "games" and request is not None:
                from .popular import request_context
                token = request_context.set({"context": demo_context(request), "browse": request.GET.get("browse") == "1"})
                try:
                    result = module.data(site, block["props"])
                finally:
                    request_context.reset(token)
                result["favouriteUrl"] = request.path + "favourites/?" + request.GET.urlencode()
                return Response(result)
            return Response(module.data(site, block["props"]))
    except CRMUnavailable as exc:
        return Response({"detail": t(str(exc), locale)}, status=503)


@never_cache
@api_view(["GET"])
def draft_widget(request, site_id, key):
    locale = website_locale(request)
    site = require_site(request.user, site_id)
    token = request.GET.get("preview")
    if token:
        return widget_result(site, preview_document(request, site, token), key, include_hidden=True, locale=locale, request=request)
    page = selected_page(request, site.pk)
    return widget_result(site, document_for(page), key, include_hidden=True, locale=locale, request=request)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_widget(request, slug, publication_id, key):
    locale = website_locale(request)
    publication = get_object_or_404(Publication.objects.select_related("page__site"),
        pk=publication_id, page__site__slug=slug, page__site__enabled=True, page__published_id=publication_id)
    response = widget_result(publication.page.site, publication.document, key, locale=locale, request=request)
    if response.status_code == 200:
        cache_policy = "private" if "signedIn" in response.data else "public"
        etag = '"' + hashlib.sha256((locale + json.dumps(response.data, sort_keys=True)).encode()).hexdigest() + '"'
        if request.headers.get("If-None-Match") == etag:
            response = HttpResponseNotModified()
        response["ETag"] = etag
        response["Cache-Control"] = f"{cache_policy}, max-age=0, must-revalidate"
    else:
        response["Cache-Control"] = "no-store"
    response["Content-Language"] = locale
    return response


class FavouriteInput(StrictSerializer):
    gameId = serializers.CharField(max_length=120)
    favourite = serializers.BooleanField()


@never_cache
@api_view(["POST"])
@permission_classes([AllowAny])
def popular_favourite(request, key, site_id=None, slug=None, publication_id=None):
    from rest_framework.authentication import SessionAuthentication
    from rest_framework.exceptions import PermissionDenied
    SessionAuthentication().enforce_csrf(request)
    if site_id is not None:
        site = require_site(request.user, site_id)
        token = request.GET.get("preview")
        doc = preview_document(request, site, token) if token else document_for(
            selected_page(request, site.pk))
    else:
        publication = get_object_or_404(Publication.objects.select_related("page__site"),
            pk=publication_id, page__site__slug=slug, page__site__enabled=True, page__published_id=publication_id)
        site, doc = publication.page.site, publication.document
    if not any(block["key"] == key and block["kind"] == "games" and block["enabled"] for block in doc["blocks"]):
        raise Http404("Popular module not found.")
    context = demo_context(request)
    if not context["player"]:
        raise PermissionDenied("Choose a demo signed-in player to use favourites.")
    serializer = FavouriteInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        return Response(crm_get("games/demo-favourites", casino_id=site.crm_id, params={"player": context["player"]},
            full_response=True, method="POST", body=dict(serializer.validated_data)))
    except CRMUnavailable as exc:
        return Response({"detail": t(str(exc))}, status=503)
