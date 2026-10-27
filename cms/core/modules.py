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


class Pin(serializers.Serializer):
    gameId = serializers.CharField(max_length=120)
    position = serializers.IntegerField(min_value=1, max_value=200)

    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) != {"gameId", "position"}:
            raise serializers.ValidationError("Supply gameId and position.")
        return super().to_internal_value(data)


class PopularProps(Props):
    mode = serializers.ChoiceField(choices=["auto", "manual", "hybrid", "ai"], default="auto")
    games = serializers.ListField(child=serializers.CharField(max_length=120), max_length=200, default=list)
    pinned = serializers.ListField(child=Pin(), max_length=200, default=list)
    layout = serializers.ChoiceField(choices=["row", "double"], default="row")
    homeLimit = serializers.IntegerField(min_value=1, max_value=200, default=10, label="Home limit")
    pageLimit = serializers.IntegerField(min_value=1, max_value=200, default=100, label="Page limit")
    rankingMinutes = serializers.IntegerField(min_value=1, max_value=525600, default=60, label="Ranking period (minutes)")

    def to_internal_value(self, data):
        if isinstance(data, dict) and data.get("layout") == "double" and "homeLimit" not in data:
            data = {**data, "homeLimit": 20}
        return super().to_internal_value(data)

    def validate(self, attrs):
        if attrs["homeLimit"] > attrs["pageLimit"]:
            raise serializers.ValidationError({"homeLimit": "Home limit must not exceed page limit."})
        ids = [pin["gameId"] for pin in attrs["pinned"]]
        positions = [pin["position"] for pin in attrs["pinned"]]
        if len(set(ids)) != len(ids) or len(set(positions)) != len(positions):
            raise serializers.ValidationError({"pinned": "Pinned game IDs and positions must be unique."})
        if any(position > attrs["pageLimit"] for position in positions):
            raise serializers.ValidationError({"pinned": "Pinned positions must not exceed page limit."})
        if len(set(attrs["games"])) != len(attrs["games"]):
            raise serializers.ValidationError({"games": "Game IDs must be unique."})
        return attrs


def popular_data(site, props):
    from .popular import popular_games, request_context
    return popular_games(site, props, **request_context.get())


def validate_with(schema):
    def validate(props):
        serializer = schema(data=props)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data
    return validate


def promotion_data(site, props):
    from .crm import promotion_bonuses
    return promotion_bonuses(props, casino_id=site.crm_id)


def crm_data(resource):
    def fetch(site, props):
        from .crm import catalog_data
        return catalog_data(resource, props, casino_id=site.crm_id)
    return fetch


for key, label, source in [
    ("promotions", "Promotions", "bonuses"), ("categories", "Popular categories", "categories"),
    ("games", "Popular games", "games"), ("providers", "Game providers", "publishers"),
    ("text", "Text / information", None), ("matches", "Sportsbook matches (information)", None),
    ("tournaments", "Tournaments (information)", None), ("winners", "Winners (information)", None),
    ("rewards", "Rewards", None),
]:
    schema = PromotionProps if key == "promotions" else PopularProps if key == "games" else Props
    data = promotion_data if key == "promotions" else popular_data if key == "games" else crm_data(source) if source else None
    registry.register(Module(key, label, validate_with(schema), data, schema))
for key, label in [("header_profile", "Header profile details"), ("tab_menu", "Tab menu"),
                   ("main_menu", "Main menu"), ("seo", "SEO text")]:
    schema = SEOProps if key == "seo" else Props
    registry.register(Module(key, label, validate_with(schema), properties=schema))
registry.layout("home", "cms/home.html")
registry.layout("compact", "cms/compact.html")
