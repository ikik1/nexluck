import hashlib
import logging
from urllib.parse import urlencode
import httpx
from django.conf import settings
from django.core.cache import cache

log = logging.getLogger(__name__)


class CRMUnavailable(Exception):
    pass


def crm_get(path, *, paginate=False):
    base = settings.CRM_API_BASE.rstrip("/")
    headers = {"Accept": "application/json"}
    try:
        with httpx.Client(timeout=httpx.Timeout(4.0, connect=2.0), follow_redirects=False, trust_env=False) as client:
            if settings.CRM_DEMO_UI:
                base = base.replace("/crm/api/v1", "/crm/ui-api/v1")
            else:
                if not settings.CRM_CLIENT_ID or not settings.CRM_CLIENT_SECRET:
                    raise CRMUnavailable("CRM service credentials are not configured.")
                scope = "games:read bonuses:read casinos:read segments:read"
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
                suffix = ("?" + urlencode({"limit": 100, "offset": len(items)})) if paginate else ""
                response = client.get(base + "/" + path + suffix, headers=headers)
                response.raise_for_status()
                result = response.json()
                if not isinstance(result, dict) or not isinstance(result.get("items"), list):
                    raise ValueError("Invalid catalog shape")
                batch = result["items"]
                items.extend(batch)
                if not paginate or len(items) >= result["total"]:
                    return items
                if not batch or len(items) > 100000:
                    raise ValueError("Invalid catalog pagination")
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        log.warning("CRM catalog request failed for %s (%s)", path, type(exc).__name__)
        raise CRMUnavailable("CRM catalog unavailable. Please retry.") from exc


def catalog_data(resource, props):
    path = {"games": "games", "categories": "games/categories", "publishers": "games/publishers", "bonuses": "bonuses"}[resource]
    key = "cms:catalog:v1:" + resource
    items = cache.get(key)
    if items is None:
        raw = crm_get(path, paginate=resource == "bonuses")
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


def segment_catalog():
    raw = crm_get("segments")
    return [{"id": s["id"], "name": s["name"]} for s in raw]


def promotion_bonuses(props):
    items = cache.get("cms:promotion-bonuses:v1")
    if items is None:
        raw = crm_get("bonuses", paginate=True)
        items = [{"id": b["id"], "external_id": b["id"], "name": b["name"],
                  "created_at": b["createdAt"], "groups": b.get("groups", [])}
                 for b in raw if b.get("status") == "active" and not b.get("deleted")]
        cache.set("cms:promotion-bonuses:v1", items, 30)
    segment_ids = props.get("custom_segment", [])
    names = set()
    if segment_ids:
        from rest_framework.exceptions import ValidationError
        segments = {s["id"]: s["name"] for s in segment_catalog()}
        if set(segment_ids) - segments.keys():
            raise ValidationError({"custom_segment": "Select existing CRM segment IDs."})
        names = {segments[s] for s in segment_ids}
    ids = set(props.get("bonus_external_ids", []))
    selected = [b for b in items if (not ids or b["external_id"] in ids)
                and (not names or not b["groups"] or names.intersection(b["groups"]))]
    selected.sort(key=lambda b: (b["created_at"], b["id"]), reverse=True)
    return {"items": [{k: v for k, v in b.items() if k != "groups"} for b in selected[:props.get("total", 8)]],
            "total": len(selected), "source": "CRM bonus catalog", "ttl": 30}
