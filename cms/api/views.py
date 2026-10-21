from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response
from core.crm import CRMUnavailable, promotion_bonuses, segment_catalog
from core.documents import StrictSerializer
from core.modules import Props
from core.registry import registry
from core.services import require_site


class SiteQuery(StrictSerializer):
    site_id = serializers.IntegerField(min_value=1)


class PromotionQuery(SiteQuery):
    total = serializers.IntegerField(min_value=1, max_value=40, default=8)
    sort_by = serializers.ChoiceField(choices=["created_at"], default="created_at")
    custom_segment = serializers.ListField(child=serializers.CharField(max_length=80), max_length=40, default=list)
    bonus_external_ids = serializers.ListField(child=serializers.CharField(max_length=80), max_length=40, default=list)


def field_schema(name, field):
    value = {"title": field.label or name.replace("_", " ").title()}
    if isinstance(field, serializers.ListField):
        value.update(type="array", items=field_schema("value", field.child), maxItems=field.max_length)
    elif isinstance(field, serializers.IntegerField):
        value.update(type="integer", minimum=field.min_value, maximum=field.max_value)
    elif isinstance(field, serializers.ChoiceField):
        value.update(type="string", enum=list(field.choices))
    elif isinstance(field, serializers.BooleanField):
        value.update(type="boolean")
    else:
        value.update(type="string")
        if getattr(field, "max_length", None):
            value["maxLength"] = field.max_length
    if field.default is not serializers.empty:
        value["default"] = field.get_default()
    if name == "custom_segment":
        value.update(widget="crm-segments", source="/cms/api/segments/")
    if name in ("html", "body"):
        value["widget"] = "html" if name == "html" else "textarea"
    return value


def module_schema(module):
    schema = module.properties or Props
    fields = schema().fields
    # Legacy fields remain accepted for stored drafts but aren't relevant to every module.
    visible = {"title", "subtitle", "body"}
    if module.data:
        visible.add("limit")
    if module.key == "games":
        visible.update(["provider", "category"])
    if module.key == "promotions":
        visible = {"title", "subtitle", "body", "total", "sort_by", "custom_segment", "bonus_external_ids"}
    if module.key == "seo":
        visible = {"title", "html"}
    if module.key in ("header_profile", "tab_menu", "main_menu"):
        visible = {"title"}
    if "." in module.key and module.properties:
        visible = set(fields)
    return {"key": module.key, "label": module.label, "type": "object",
            "properties": {name: field_schema(name, field) for name, field in fields.items() if name in visible},
            "defaults": {"title": module.label, **{name: field.get_default() for name, field in fields.items()
                         if field.default is not serializers.empty}}}


@never_cache
@api_view(["GET"])
def modules(request):
    return Response({"items": [module_schema(m) for m in registry.modules.values()]})


@never_cache
@api_view(["GET"])
def segments(request):
    serializer = SiteQuery(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    site = require_site(request.user, serializer.validated_data["site_id"])
    try:
        return Response({"items": segment_catalog(casino_id=site.crm_id)})
    except CRMUnavailable as exc:
        return Response({"detail": str(exc)}, status=503)


@never_cache
@api_view(["GET"])
def get_promotion_bonuses(request):
    raw = {key: request.query_params.getlist(key) if key in ("custom_segment", "bonus_external_ids")
           else request.query_params[key] for key in request.query_params}
    serializer = PromotionQuery(data=raw)
    serializer.is_valid(raise_exception=True)
    props = dict(serializer.validated_data)
    site = require_site(request.user, props.pop("site_id"))
    try:
        return Response(promotion_bonuses(props, casino_id=site.crm_id))
    except CRMUnavailable as exc:
        return Response({"detail": str(exc)}, status=503)


@never_cache
@api_view(["GET"])
def openapi(request):
    parameters = []
    for name, field in PromotionQuery().fields.items():
        schema = field_schema(name, field)
        schema.pop("title", None)
        parameters.append({"name": name, "in": "query", "required": field.required, "schema": schema,
                           **({"style": "form", "explode": True} if isinstance(field, serializers.ListField) else {})})
    response = {"description": "CRM catalog results; not an offer eligibility or entitlement decision.",
                "content": {"application/json": {"schema": {"type": "object", "required": ["items", "total", "source", "ttl"],
                    "properties": {"items": {"type": "array", "items": {"type": "object",
                        "required": ["id", "external_id", "name", "created_at"],
                        "properties": {name: {"type": "string"} for name in ["id", "external_id", "name", "created_at"]}}},
                        "total": {"type": "integer"}, "source": {"type": "string"}, "ttl": {"type": "integer"}}}}}}
    return Response({"openapi": "3.0.3", "info": {"title": "NexLuck frontend CMS modules", "version": "1.0.0"},
        "servers": [{"url": "/cms/api"}],
        "paths": {
            "/modules/": {"get": {"summary": "Module property schemas and defaults", "responses": {"200": {"description": "Schema catalog"}}}},
            "/segments/": {"get": {"summary": "Saved CRM segment IDs and names for a permitted site",
                "parameters": [parameters[0]], "responses": {"200": {"description": "Segment list"},
                    "400": {"description": "Site ID required"}, "404": {"description": "Site not found or not permitted"},
                    "503": {"description": "CRM unavailable or site not linked"}}}},
            "/get_promotion_bonuses/": {"get": {"operationId": "get_promotion_bonuses",
                "summary": "Read active, non-deleted promotion bonuses", "parameters": parameters,
                "responses": {"200": response, "400": {"description": "Invalid parameters or segment IDs"},
                              "403": {"description": "Staff session required"}, "404": {"description": "Site not found or not permitted"},
                              "503": {"description": "CRM unavailable or site not linked"}}}}},
        "components": {"securitySchemes": {"session": {"type": "apiKey", "in": "cookie", "name": "nexluck_cms_session"}}},
        "security": [{"session": []}]})


@login_required
def docs(request):
    from django.core.exceptions import PermissionDenied
    if not request.user.is_staff:
        raise PermissionDenied()
    return render(request, "cms/api.html")
