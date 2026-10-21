from rest_framework import serializers
import bleach
from .registry import Module, registry


class Props(serializers.Serializer):
    title = serializers.CharField(max_length=160)
    subtitle = serializers.CharField(max_length=300, allow_blank=True, required=False, default="")
    body = serializers.CharField(max_length=2000, allow_blank=True, required=False, default="")
    limit = serializers.IntegerField(min_value=1, max_value=40, required=False, default=8)
    provider = serializers.CharField(max_length=80, allow_blank=True, required=False, default="")
    category = serializers.CharField(max_length=80, allow_blank=True, required=False, default="")

    def to_internal_value(self, data):
        if not isinstance(data, dict) or data.keys() - self.fields.keys():
            raise serializers.ValidationError({"non_field_errors": ["Unknown module parameters."]})
        return super().to_internal_value(data)


def validate_props(props):
    serializer = Props(data=props)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


class PromotionProps(Props):
    total = serializers.IntegerField(min_value=1, max_value=40, default=8)
    sort_by = serializers.ChoiceField(choices=["created_at"], default="created_at")
    custom_segment = serializers.ListField(child=serializers.CharField(max_length=80), max_length=40, default=list)
    bonus_external_ids = serializers.ListField(child=serializers.CharField(max_length=80), max_length=40, default=list)

    def to_internal_value(self, data):
        if isinstance(data, dict) and "total" not in data and "limit" in data:
            data = {**data, "total": data["limit"]}
        return super().to_internal_value(data)


class SEOProps(Props):
    html = serializers.CharField(max_length=20000, allow_blank=True, default="")

    def validate_html(self, value):
        return bleach.clean(value, tags=["p", "br", "h2", "h3", "h4", "strong", "em", "ul", "ol", "li", "a", "blockquote"],
                            attributes={"a": ["href", "title"]}, protocols=["https", "http"], strip=True)


def validate_with(schema):
    def validate(props):
        serializer = schema(data=props)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data
    return validate


def promotion_data(site, props):
    from .crm import promotion_bonuses
    return promotion_bonuses(props)


def crm_data(resource):
    def fetch(site, props):
        from .crm import catalog_data
        return catalog_data(resource, props)
    return fetch


for key, label, source in [
    ("promotions", "Promotions", "bonuses"), ("categories", "Popular categories", "categories"),
    ("games", "Popular games", "games"), ("providers", "Game providers", "publishers"),
    ("text", "Text / information", None), ("matches", "Sportsbook matches (information)", None),
    ("tournaments", "Tournaments (information)", None), ("winners", "Winners (information)", None),
    ("rewards", "Rewards", None),
]:
    schema = PromotionProps if key == "promotions" else Props
    data = promotion_data if key == "promotions" else crm_data(source) if source else None
    registry.register(Module(key, label, validate_with(schema), data, schema))
for key, label in [("header_profile", "Header profile details"), ("tab_menu", "Tab menu"),
                   ("main_menu", "Main menu"), ("seo", "SEO text")]:
    schema = SEOProps if key == "seo" else Props
    registry.register(Module(key, label, validate_with(schema), properties=schema))
registry.layout("home", "cms/home.html")
registry.layout("compact", "cms/compact.html")
