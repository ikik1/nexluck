from django import template
from core.i18n import t

register = template.Library()


@register.simple_tag(takes_context=True)
def cms_t(context, source, **params):
    return t(source, context.get("website_language") or context.get("cms_language"), **params)
