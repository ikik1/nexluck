import hashlib
import json
import logging
import uuid
from contextvars import ContextVar
from urllib.parse import urlencode, urlsplit

from django.conf import settings
from django.core.cache import cache
from django.utils.dateparse import parse_datetime
from rest_framework import serializers

from . import crm
from .crm import CRMUnavailable, require_casino_id
from .models import PopularRanking

log = logging.getLogger(__name__)
request_context = ContextVar("popular_request", default={})


def demo_context(request):
    country = request.GET.get("demo_country", "WORLD")
    signed_in = request.GET.get("demo_player", "0")
    if not settings.POPULAR_DEMO_INPUTS and (country != "WORLD" or signed_in != "0"):
        raise serializers.ValidationError("Demo player and country inputs are disabled.")
    if (country != "WORLD" and (len(country) != 2 or not country.isascii() or not country.isupper())) or signed_in not in ("0", "1"):
        raise serializers.ValidationError("Invalid demo country or player.")
    player = ""
    if signed_in == "1":
        if "popular_demo_player" not in request.session:
            request.session["popular_demo_player"] = "demo-" + uuid.uuid4().hex
        player = request.session["popular_demo_player"]
    return {"country": country, "player": player}


def context_query(request):
    return urlencode({key: request.GET[key] for key in ("lang", "demo_country", "demo_player") if key in request.GET})


def game_catalog(site, with_state=False):
    require_casino_id(site.crm_id)
    fingerprint = hashlib.sha256(f"catalog:{site.crm_id}".encode()).hexdigest()
    cache_key = crm.casino_cache_key("popular-catalog", site.crm_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return (cached, False) if with_state else cached
    try:
        raw = crm.crm_get("games", casino_id=site.crm_id)
        publishers = {p["id"]: p["name"] for p in crm.crm_get("games/publishers", casino_id=site.crm_id)}
    except CRMUnavailable:
        previous = PopularRanking.objects.filter(site=site, fingerprint=fingerprint).first()
        if previous is None:
            raise
        log.warning("Serving saved Popular game catalogue for site %s", site.id)
        return (previous.payload, True) if with_state else previous.payload
    result = {}
    for game in raw:
        if not game.get("enabled"):
            continue
        image = game.get("image", "")
        parsed = urlsplit(image)
        if not (image.startswith("/") and not image.startswith("//") or parsed.scheme == "https" or image.startswith("data:image/svg+xml;base64,")):
            image = ""
        result[game["id"]] = {
            "id": game["id"], "name": game["name"], "provider": publishers.get(game["publisher_id"], game["publisher_id"]),
            "image": image, "badges": [badge for badge in game.get("badges", []) if badge in ("NEW", "HOT", "JACKPOT")],
        }
    PopularRanking.objects.update_or_create(site=site, fingerprint=fingerprint, defaults={"payload": result})
    cache.set(cache_key, result, 30)
    return (result, False) if with_state else result


def validate_ranking(data):
    try:
        if data.get("metric") not in ("bet_volume", "play_count") or not isinstance(data["personalized"], bool):
            raise ValueError("Invalid metric or personalization")
        if type(data["period"]["minutes"]) is not int or data["period"]["minutes"] < 1:
            raise ValueError("Invalid period")
        if not parse_datetime(data["updatedAt"]) or parse_datetime(data["updatedAt"]).utcoffset() is None:
            raise ValueError("Invalid updatedAt")
        if not isinstance(data["country"], str) or not isinstance(data.get("countryName") or "", str):
            raise ValueError("Invalid country")
        if not isinstance(data["items"], list) or len(data["items"]) > 10000 or any(
                not isinstance(item, dict) or not isinstance(item.get("gameId"), str) for item in data["items"]):
            raise ValueError("Invalid ranking items")
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        log.warning("CRM returned invalid Popular ranking metadata: %s", exc)
        raise CRMUnavailable("Invalid CRM ranking response.") from exc
    return data


def saved_ranking(site, props, context):
    params = {"country": context["country"], "player": context["player"] if props["mode"] == "ai" else "",
              "mode": "personal" if props["mode"] == "ai" else "geo", "minutes": props["rankingMinutes"]}
    fingerprint = hashlib.sha256(json.dumps({"casino": site.crm_id, **params}, sort_keys=True).encode()).hexdigest()
    cache_key = f"cms:popular:v1:{site.id}:{fingerprint}"
    data = cache.get(cache_key)
    if data is not None:
        return data, False
    try:
        data = validate_ranking(crm.crm_get("games/ranking", casino_id=site.crm_id, params=params, full_response=True))
    except CRMUnavailable:
        previous = PopularRanking.objects.filter(site=site, fingerprint=fingerprint).first()
        if previous is None:
            raise
        log.warning("Serving saved Popular ranking for site %s", site.id)
        return previous.payload, True
    PopularRanking.objects.update_or_create(site=site, fingerprint=fingerprint, defaults={"payload": data})
    cache.set(cache_key, data, 30)
    return data, False


def popular_games(site, props, context=None, browse=False):
    from .modules import PopularProps
    serializer = PopularProps(data=props)
    serializer.is_valid(raise_exception=True)
    props = dict(serializer.validated_data)
    context = context or {"country": "WORLD", "player": ""}
    catalog, catalog_stale = game_catalog(site, with_state=True)
    ranking, stale = None, False
    if browse:
        ids = list(catalog)
    elif props["mode"] == "manual":
        ids = props["games"]
    else:
        ranking, stale = saved_ranking(site, props, context)
        ids = [row["gameId"] for row in ranking["items"]]
    ids = list(dict.fromkeys(game_id for game_id in ids if game_id in catalog))
    if not browse and props["mode"] in ("hybrid", "ai"):
        pins = sorted((pin for pin in props["pinned"] if pin["gameId"] in catalog), key=lambda pin: pin["position"])
        pinned_ids = {pin["gameId"] for pin in pins}
        ids = [game_id for game_id in ids if game_id not in pinned_ids]
        for pin in pins:
            ids.insert(min(pin["position"] - 1, len(ids)), pin["gameId"])
    if not browse:
        ids = ids[:props["pageLimit"]]
    favourites, favourite_error = [], False
    if context["player"]:
        try:
            favourites = [row["gameId"] for row in crm.crm_get("games/demo-favourites", casino_id=site.crm_id,
                params={"player": context["player"]})]
        except CRMUnavailable:
            favourite_error = True
    return {"items": [catalog[game_id] for game_id in ids], "total": len(ids), "ranking": ranking,
            "stale": stale or catalog_stale, "title": props["title"], "layout": props["layout"], "homeLimit": props["homeLimit"],
            "pageLimit": props["pageLimit"], "country": context["country"],
            "demo": bool(ranking and ranking.get("demo")) or bool(context["player"]),
            "signedIn": bool(context["player"]), "favourites": favourites, "favouriteError": favourite_error}
