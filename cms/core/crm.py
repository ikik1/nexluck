import hashlib
import logging
from urllib.parse import urlencode
import httpx
from django.conf import settings
from django.core.cache import cache

log = logging.getLogger(__name__)


class CRMUnavailable(Exception):
    pass


def require_casino_id(casino_id):
    if not isinstance(casino_id, str) or not casino_id.strip():
        raise CRMUnavailable("This CMS site is not linked to a CRM casino.")
    return casino_id


def casino_cache_key(prefix, casino_id):
    owner = hashlib.sha256(require_casino_id(casino_id).encode()).hexdigest()
    return f"cms:{prefix}:v2:{owner}"


def crm_get(path, *, casino_id=None, paginate=False, params=None, full_response=False, method="GET", body=None):
    base = settings.CRM_API_BASE.rstrip("/")
    headers = {"Accept": "application/json"}
    if path != "casinos":
        headers["X-Casino-Id"] = require_casino_id(casino_id)
    try:
        with httpx.Client(timeout=httpx.Timeout(4.0, connect=2.0), follow_redirects=False, trust_env=False) as client:
            if settings.CRM_DEMO_UI:
                base = base.replace("/crm/api/v1", "/crm/ui-api/v1")
            else:
                if not settings.CRM_CLIENT_ID or not settings.CRM_CLIENT_SECRET:
                    raise CRMUnavailable("CRM service credentials are not configured.")
                scope = "games:write" if method != "GET" else "games:read bonuses:read casinos:read segments:read"
                fingerprint = hashlib.sha256((base + settings.CRM_CLIENT_ID + settings.CRM_CLIENT_SECRET + scope).encode()).hexdigest()
                token_key = "cms:crm:token:" + fingerprint
                token = cache.get(token_key)
                if not token:
                    response = client.post(base + "/oauth/token",
                        auth=(settings.CRM_CLIENT_ID, settings.CRM_CLIENT_SECRET),
                        data={"grant_type": "client_credentials", "scope": scope})
                    response.raise_for_status()
                    body = response.json()
                    token = body["access_token"]
                    cache.set(token_key, token, min(int(body["expires_in"]) - 30, 840))
                headers["Authorization"] = "Bearer " + token
            items = []
            while True:
                query = {**(params or {}), **({"limit": 100, "offset": len(items)} if paginate else {})}
                suffix = "?" + urlencode(query) if query else ""
                if method == "GET":
                    response = client.get(base + "/" + path + suffix, headers=headers)
                else:
                    response = client.request(method, base + "/" + path + suffix, headers=headers, json=body)
                response.raise_for_status()
                result = response.json()
                if not isinstance(result, dict) or not isinstance(result.get("items"), list):
                    raise ValueError("Invalid catalog shape")
                if full_response:
                    return result
                batch = result["items"]
                items.extend(batch)
                if not paginate or len(items) >= result["total"]:
                    return items
                if not batch or len(items) > 100000:
                    raise ValueError("Invalid catalog pagination")
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        log.warning("CRM catalog request failed for %s (%s)", path, type(exc).__name__)
        raise CRMUnavailable("CRM catalog unavailable. Please retry.") from exc


def catalog_data(resource, props, *, casino_id):
    path = {"games": "games", "categories": "games/categories", "publishers": "games/publishers", "bonuses": "bonuses"}[resource]
    key = casino_cache_key("catalog:" + resource, casino_id)
    items = cache.get(key)
    if items is None:
        raw = crm_get(path, casino_id=casino_id, paginate=resource == "bonuses")
        if resource == "games":
            items = [{"id": g["id"], "name": g["name"], "provider": g["publisher_id"], "categories": g.get("category_ids", [])}
                     for g in raw if g.get("enabled")]
        elif resource == "categories":
            items = [{"id": c["id"], "name": c["name"]} for c in raw if c.get("kind") == "static"]
        elif resource == "publishers":
            items = [{"id": p["id"], "name": p["name"]} for p in raw]
        else:
            items = [{"id": b["id"], "name": b["name"]} for b in raw if b.get("status") == "active"]
        cache.set(key, items, 30)
    selected = [item for item in items
                if (not props.get("provider") or item.get("provider") == props["provider"])
                and (not props.get("category") or props["category"] in item.get("categories", []))]
    return {"items": selected[:props.get("limit", 8)], "source": "CRM catalog", "ttl": 30}


def segment_catalog(*, casino_id):
    raw = crm_get("segments", casino_id=require_casino_id(casino_id))
    return [{"id": s["id"], "name": s["name"]} for s in raw]


def promotion_bonuses(props, *, casino_id):
    key = casino_cache_key("promotion-bonuses", casino_id)
    items = cache.get(key)
    if items is None:
        raw = crm_get("bonuses", casino_id=casino_id, paginate=True)
        items = [{"id": b["id"], "external_id": b["id"], "name": b["name"],
                  "created_at": b["createdAt"], "groups": b.get("groups", [])}
                 for b in raw if b.get("status") == "active" and not b.get("deleted")]
        cache.set(key, items, 30)
    segment_ids = props.get("custom_segment", [])
    names = set()
    if segment_ids:
        from rest_framework.exceptions import ValidationError
        segments = {s["id"]: s["name"] for s in segment_catalog(casino_id=casino_id)}
        if set(segment_ids) - segments.keys():
            raise ValidationError({"custom_segment": "Select existing CRM segment IDs."})
        names = {segments[s] for s in segment_ids}
    ids = set(props.get("bonus_external_ids", []))
    selected = [b for b in items if (not ids or b["external_id"] in ids)
                and (not names or not b["groups"] or names.intersection(b["groups"]))]
    selected.sort(key=lambda b: (b["created_at"], b["id"]), reverse=True)
    return {"items": [{k: v for k, v in b.items() if k != "groups"} for b in selected[:props.get("total", 8)]],
            "total": len(selected), "source": "CRM bonus catalog", "ttl": 30}
