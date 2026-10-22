# Frontend CMS module API

Localized interactive API reference: `/cms/api/`. OpenAPI 3 JSON:
`/cms/api/openapi.json`. Both require an authenticated CMS staff session.
The API is mounted alongside the site-scoped draft/publication APIs.

The default reference is localized and supports executable GET requests.
The **Swagger UI** link opens `/cms/api/?view=swagger`, preserving the standard
self-hosted Swagger interface, Try it out/Execute, request and response details,
response schemas, and session security documentation. Both views use the same
OpenAPI document and same-origin staff-session credentials.

## Module properties

`GET /cms/api/modules/` returns `{items: [...]}` with each module's `key`,
`label`, JSON-compatible `properties` and `defaults`. Properties dialogs fetch
this endpoint when opened; plugins can supply a serializer through the optional
`Module.properties` registry argument. Existing plugins without it retain the
standard schema.

Labels follow the shared five-language management-language cookie (English,
Russian, Portuguese (Portugal), Portuguese (Brazil), and Spanish (Spain)).
Defaults and saved casino content are never translated by this endpoint.

Games expose maximum items, provider ID and category ID. Categories/providers
expose maximum items. Promotions expose the following query parameters.
SEO exposes a title and safe HTML source. Header profile/Tab menu/Main menu
expose their accessible titles; Main menu links use the page navigation editor.

## get_promotion_bonuses

`GET /cms/api/get_promotion_bonuses/`

| Parameter | Type | Meaning |
|---|---|---|
| `site_id` | required positive integer | CMS site ID; caller must have site permission; its `crm_id` selects the CRM casino |
| `total` | integer, 1-40, default 8 | Maximum returned cards, not total matching count |
| `sort_by` | string, `created_at` only | Newest creation date first; descending ID breaks date ties deterministically |
| `custom_segment` | array of saved CRM segment IDs | Repeated query parameters; match any selected segment name against bonus targeting groups |
| `bonus_external_ids` | array of strings | Repeated query parameters; restrict returned bonus IDs |

Examples:

```text
/cms/api/get_promotion_bonuses/?site_id=1&total=4&sort_by=created_at
/cms/api/get_promotion_bonuses/?site_id=1&total=10&custom_segment=SG-1001&custom_segment=SG-1002&bonus_external_ids=BN-1001&bonus_external_ids=BN-1002
```

The current CRM bonus model has **no separate external-ID field**. Therefore
`external_id` maps explicitly to its stable `BN-...` ID, not a fabricated
customer/account identifier. Both `id` and `external_id` are returned so a
future upstream external-ID field can be integrated deliberately.

Only active, non-deleted bonuses are considered. The adapter paginates through
the CRM catalog before filtering/sorting, not just its default first 20 records.
Segment IDs resolve through `/crm`'s saved segment API. Unknown IDs return 400;
empty segment/ID arrays mean no filter. Untargeted bonuses (empty targeting
groups) are available in every catalog segment. Selected segments are OR-ed;
the segment and bonus-ID filters are AND-ed. This is **catalog targeting**, not
real-player eligibility, redemption, authentication or entitlement evaluation.
Legacy targeting names without a matching saved CRM segment are not guessed.

Successful shape:

```json
{
  "items": [
    {"id": "BN-1001", "external_id": "BN-1001", "name": "Welcome offer", "created_at": "2026-10-01"}
  ],
  "total": 1,
  "source": "CRM bonus catalog",
  "ttl": 30
}
```

`total` is the matching count **before** truncation. Raw CRM bonus records,
internal rules, targeting groups, statistics and customer records are never
returned. The casino-specific bonus catalog cache lasts 30 seconds. Every feed
request sends `X-Casino-Id` from the authorized CMS site's `crm_id`, never a
browser-provided CRM owner. CRM errors and unlinked sites return 503;
invalid/unknown parameters return 400, inaccessible sites return 404, and
unauthenticated/nonstaff access is denied. There is no global catalog fallback.

The Properties dialog uses the shared CRM `SegmentSelection` component.
`GET /cms/api/segments/?site_id=<CMS site ID>` supplies casino-owned saved
IDs/names after checking site permission through the fixed-origin,
server-side CRM adapter; no service secrets are sent to the browser. The editor
supplies its current site. Selecting
several segments renders their names as removable tags.

## Public rendering

Public pages do not call this staff query endpoint directly. Promotion modules
call the same validated adapter through
`/cms/api/public/<site-slug>/<publication-id>/widgets/<block-key>/`.
Only the current publication for an enabled site is allowed, with its immutable
saved properties; arbitrary query overrides cannot change those properties.
Draft widgets require site membership, and unsaved previews additionally
require a user/site-bound five-minute token.
