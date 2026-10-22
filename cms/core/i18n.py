"""Explicit CMS UI and independently selected website languages."""
import json
from contextvars import ContextVar
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.core.exceptions import BadRequest
from django.http import FileResponse, Http404
from django.utils import translation
from django.utils.functional import lazy
from rest_framework.views import exception_handler as drf_exception_handler

LOCALES = ("en", "ru", "pt-PT", "pt-BR", "es")
DJANGO_LOCALES = {"pt-PT": "pt", "pt-BR": "pt-br"}
current_locale = ContextVar("cms_language", default="en")


@lru_cache(maxsize=1)
def catalog():
    return json.loads((Path(settings.BASE_DIR).parent / "localization" / "cms.json").read_text())


def t(source, locale=None, **params):
    result = catalog().get(locale or current_locale.get(), {}).get(str(source), str(source))
    for key, value in params.items():
        result = result.replace("{" + key + "}", str(value))
    return result


lazy_t = lazy(t, str)


def website_locale(request):
    locale = request.GET.get("lang", "en")
    if locale not in LOCALES:
        raise BadRequest(t("Choose a supported language."))
    return locale


def localized_document(document, locale):
    from copy import deepcopy
    doc = deepcopy(document)
    for block in doc["blocks"]:
        block["props"] = {**block["props"], **block.get("translations", {}).get(locale, {})}
    if "sections" in doc:
        by_key = {block["key"]: block for block in doc["blocks"]}
        doc["sections"] = [{**section, "blocks": [deepcopy(by_key[b["key"]]) for b in section["blocks"]]}
                           for section in doc["sections"]]
    return doc


def translated_errors(value, locale=None):
    if isinstance(value, dict):
        return {key: translated_errors(item, locale) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [translated_errors(item, locale) for item in value]
    return t(value, locale) if isinstance(value, str) else value


def exception_handler(exc, context):
    if isinstance(exc, BadRequest):
        from rest_framework.exceptions import ValidationError
        exc = ValidationError({"lang": str(exc)})
    response = drf_exception_handler(exc, context)
    if response is not None:
        request = context.get("request")
        locale = request.GET.get("lang") if request is not None and "/widgets/" in request.path else None
        response.data = translated_errors(response.data, locale if locale in LOCALES else None)
    return response


class CMSLanguageMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        locale = request.COOKIES.get("nexluck_language", "en")
        if locale not in LOCALES:
            locale = "en"
        request.cms_language = locale
        token = current_locale.set(locale)
        try:
            with translation.override(DJANGO_LOCALES.get(locale, locale)):
                return self.get_response(request)
        finally:
            current_locale.reset(token)


def context(request):
    return {"cms_language": getattr(request, "cms_language", "en")}


def asset(request, name):
    if name not in ("runtime.js", "catalog.js"):
        raise Http404()
    return FileResponse((Path(settings.BASE_DIR).parent / "localization" / name).open("rb"),
                        content_type="application/javascript")
