# My Casinos

`/crm/c/l/` lists saved casino websites. Home's My Casinos tile, conversational
navigation (including websites/CMS) and the legacy casinos section link open it.
An empty store is prepopulated with five fictional demo websites: Aurora,
Coast, Crown, Emerald and Lunar, using reserved `.example` URLs and a mix of
skins. Nonempty stores are preserved, including edits and disabled status.
The Home My Casinos tile shows the actual permitted global registry count.
Other Home blocks show clearly labeled, casino-specific demo summary snapshots
from the scoped `/dashboard` API. Every existing casino is backfilled once,
and newly created casinos receive their own snapshot. Seeds are deterministic
by immutable casino ID, persisted across restarts and never overwrite existing
snapshots. No operational customers, payments, bonuses or financial history
are created or copied by this Home-only seed. Analytics reports retain their
independent scope; the Home Analytics card is only a sample teaser.

- Add new web-site requires Name (1-120 characters), an absolute HTTP(S) URL
  without embedded credentials (max 2048 characters), and a skin.
- Themes are Classic, Modern and Dark, with illustrative previews.
- CMS edit opens the separate Django visual editor at `/cms/?crm_site=<id>`,
  with CMS login and explicit site connection. The Settings action retains
  the Name, URL and Theme form.
- Right-click, Shift+F10 on a focused row, or the Actions button exposes
  Set as CRM Context and Disable/Enable. The selected row displays Current
  context. Disabled websites remain visible, gray and explicitly labeled;
  their settings remain editable.
- Dates are server-owned UTC creation/update timestamps. Website status and
  settings survive reloads and server restarts.

This is stored CRM configuration only: saving a skin does not deploy it,
CMS edit opens the local CMS engine, and Disable does not shut down an
external website. Existing Analytics demo websites remain fictional and separate.
CMS imports are explicit snapshots; subsequent website configuration changes
are not automatically synchronized into the CMS.
Creation, editing and status errors are shown explicitly without optimistic
success. The list request can be retried.

## API

The header includes a compact EN/RU/PT/BR/ES interface selector shared with CMS
(English, Russian, Portuguese for Portugal/Brazil and Spanish for Spain). Its remembered
browser preference does not change casino context, stored identifiers or
user-entered names. Unsaved changes require confirmation before switching.
See the [localization guide](../../../localization/README.md) for catalogs,
website content localization and publishing requirements.

The browser prototype uses `/crm/ui-api/v1/casinos`. Server-to-server clients use
`/crm/api/v1/casinos` with `casinos:read` / `casinos:write` scopes.

| Method | Path | Result |
|---|---|---|
| GET | `/casinos` | `{items, total}` |
| POST | `/casinos` | Create with `name`, `url`, `theme`; optional `enabled` defaults true |
| POST | `/casinos/clone-preview` | Source revision, selected/dependency groups and counts |
| GET | `/casinos/{id}` | Website |
| PATCH | `/casinos/{id}` | Partial update of `name`, `url`, `theme`, `enabled` |

Themes use `classic`, `modern`, `dark`. Records include `id`, `created_at`,
`updated_at`, `enabled`. Unknown/read-only fields are rejected with 422 field
errors; missing IDs return 404, unsupported methods 405. Creation requires an
`Idempotency-Key` header (8-200 characters). Optional `source_id`, `groups` and
`source_revision` must match a current copy preview. Retrying an identical
operation key returns the original creation; changed payloads return 409.

## Casino context

The Context dropdown next to NexLuck and row action share one switch procedure.
Selection is held in the tab's `sessionStorage` and `casino_context` navigation
parameter, not global browser storage. The default is the first permitted
casino by creation timestamp then ID. Invalid restored/explicit IDs block
operational data until reselected. Disabled contexts remain editable, with a
persistent warning. Dirty forms offer Stay / Discard and switch; in-flight
writes block changes. Detail views return to the corresponding list.

Operational APIs require `X-Casino-Id`; missing/malformed headers return 400,
unpermitted casinos 403, and another casino's objects 404. All list, nested,
validation and mutation paths use the resolved tenant. Body ownership is
read-only. Shared protocol enums are not mutable business catalogs.

New sites default to no copy. Copying Segments, Games, Catalogs and/or Payment
connections resolves and displays required configuration dependencies. Copies
receive new IDs and remapped references; external business identifiers remain
casino-local. Configurations are independent, with no copied customers,
wallets, transactions, bonuses or CMS pages. Connection settings/secrets are
cleared, connections/cascades disabled and marked Configuration required.

### Persistence and migration

`CRM_CUSTOMER_DATA_DIR/casino_context.json` is the authoritative private 0600
snapshot. An exclusive file lock, fsync and atomic rename cover registry,
tenant data, creation idempotency and audit together. Invalid operations never
publish their working snapshot. This serializes a local prototype workload;
it is not a substitute for database transactions at multi-node scale.

The first startup backs up legacy stores to `before-casino-context/` in the
same private directory, preserves original IDs/history in the canonical first
casino, and independently copies the four configuration groups to the other
existing casinos. Financial browser fixtures are imported once as labeled
demo data; the browser no longer generates global operational history.
Subsequent startups do not repeat migration or read legacy files as current
tenant data. Migration metadata includes source, mappings and counts.

Legacy FIRST_DEP, HIGH_ROLLER, MOBILE, NO_DEPOSIT and restriction labels with
no original rule definitions are retained as imported demo targeting tags.
Their rules match explicitly imported player tags; no first-deposit or
high-roller threshold is invented. Copies contain definitions, never player
membership snapshots. Renaming a saved segment updates owner-local targeting
references atomically.

Before production migration, back up the entire private directory and freeze
writes. To restore, stop CRM writers and restore the complete private directory
and matching application release together. Never delete just ownership fields
or restore individual resource files into a running context-aware server.

### Authentication and deployment

Default `CRM_UI_MODE=demo` is prominently labeled and **must only contain demo
data**. It does not establish production operator authorization.
For a single authenticated operator deployment, set:

- `CRM_UI_MODE=authenticated`
- `CRM_OPERATOR_USERNAME` and a secret `CRM_OPERATOR_PASSWORD` of at least
  12 characters, stored outside the webroot
- `CRM_ALLOWED_CASINOS` to comma-separated operational casino IDs
- `CRM_REPORTING_CASINOS` independently to comma-separated reporting IDs

`*` (or unset lists in the demo) permits the registry. Use explicit least-
privilege lists in authenticated deployments. HTTP Basic must be carried over
HTTPS; cross-origin/cross-site mutations and non-JSON form writes are rejected.
The browser UI does not reuse OAuth machine credentials. Multi-operator
production deployments should integrate their operator identity/permission
provider instead of sharing this single-operator account.

Analytics uses read-only `/reporting/*` dimensions, with owner-qualified IDs,
and keeps its synthetic website dimension explicit. Changing header context
does not reload reports or reset filters/AI. Segment edits from Analytics
require an explicitly selected operational owner. CMS catalog requests derive
ownership from the CMS site's `crm_id`, independently of the current CRM tab.

Validate with:

```sh
python3 crm/api/test/casino_browser_test.py
python3 crm/api/test/navigation_browser_test.py
python3 crm/api/test/casino_context_test.py
python3 crm/api/test/context_browser_test.py
python3 crm/api/test/home_browser_test.py
```
