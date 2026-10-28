# NexLuck modular CMS

A separate Python 3.12 / Django 5.2 LTS / DRF application mounted at **`/cms/`**.
React 19 powers the visual editor and hydrates individual asynchronous widgets;
Django renders document structure, navigation, headings, text and theme before
any catalog requests. Admin styling follows the existing CRM's navy header,
gray canvas, blue controls and white panels; it does not inherit the CRM's
demo identity or unauthenticated API permissions.
All CMS dropdowns reuse the shared dropdown geometry: the arrow's right inset
matches the text's left inset, including toolbar and Properties controls.

This is an implemented and tested application foundation, **not a claim of a
production audit, gambling compliance certification or guaranteed latency**.
Docker infrastructure needs validation in your deployment environment. No real
payments, gambling engine, odds or player data are implemented.

## Structure

```text
cms/
  config/                  Django settings, URL composition, WSGI
  api/                     Localized API reference/OpenAPI and module/segment APIs
  core/
    models.py              Sites, membership, layouts, themes, blocks, menus,
                           plugins, pages and immutable publications
    registry.py            Trusted module/layout registry and publish hooks
    modules.py             Built-in module parameter schemas and data adapters
    crm.py                 Private CRM service client, sanitized cached outputs
    documents.py           Strict document/theme/layout/menu validation
    services.py            Transactions, revisions, tenant checks, publishing
    views.py               DRF APIs, SSR, private ephemeral previews
    admin.py               Superuser-only configuration administration
    migrations/            Committed database schema
    static/cms/            Admin, /h-derived site skin and preview selection
    management/commands/   Catalog setup, explicit CRM import, benchmarks
    tests.py               Backend acceptance tests
  plugins/announcements/   Complete model/admin/API/module plugin example
  templates/cms/           SSR home/compact layouts, editor shell, login
  frontend/
    src/editor.jsx         Visual editor, parameters, navigation, publish
    src/renderer.jsx       Fetch/async/await React hydration islands
    src/widgetRegistry.jsx Trusted frontend component registry
    src/plugins/           Widget extensions
    package-lock.json      Reproducible npm dependency resolution
  deploy/                  PgBouncer image/config, Nginx include
  Dockerfile               Node build + nonroot Python runtime
  compose.yaml             PostgreSQL 17, PgBouncer, Redis, Gunicorn
  requirements.lock        Reproducible Python dependency resolution
```

## Local development

Requires Python **3.12+**, Node **22+**, and the existing Ruby CRM server.
SQLite, local-memory cache and database sessions are **local-only** defaults
when `CMS_ENV=local` is explicitly set. Production is the default and refuses
to boot without secrets/database/Redis configuration.

```sh
cd cms
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.lock
cd frontend
npm ci
npm run build
cd ..
export CMS_ENV=local
export CRM_API_BASE=http://127.0.0.1:8086/crm/api/v1
export CRM_DEMO_UI=1
.venv/bin/python manage.py migrate
.venv/bin/python manage.py setup_cms --import-crm
.venv/bin/python manage.py createsuperuser
.venv/bin/python manage.py runserver 127.0.0.1:8090
```

Restart `ruby crm/api/server.rb 8086` after updating its proxy code. Then use
`http://127.0.0.1:8086/cms/` (same origin as CRM), or access Django directly at
`http://127.0.0.1:8090/cms/`. The development Ruby proxy forwards cookies and
CSRF headers; it returns an explicit 503 when Django is unavailable. An override
`CMS_UPSTREAM` is for local development only.

`CRM_DEMO_UI=1` is an explicitly local, unauthenticated prototype connector; it
is ignored in production. Production uses OAuth client credentials server-side.
Do not place CRM service credentials in frontend code or Git.

Rebuild frontend assets after changing JSX. No CDN/Babel/browser compilation is
used by this CMS. Existing `/h/` and `/crm/` assets and APIs are not replaced.

## Popular games

The existing **Popular games** (`games`) module is a single mixed ranking, not
separate slot/live/table subsections. Add any number of modules; their CMS order
is their website order. **Localization** selects each module's title, mode,
ordered game IDs, pins, layout and limits independently. Missing localized
values inherit the English/default module properties. Language does not imply
visitor country: there is no country-based module filtering.

- `mode`: `auto` uses the CRM geo ranking; `manual` uses the manager's ordered
  list; `hybrid` uses geo ranking plus pins; `ai` uses personal ranking plus pins.
  An anonymous AI request uses a non-personal ranking, not a fabricated identity.
- `pinned`: `{gameId, position}` records, with unique IDs and one-based positions.
  Remove pinned IDs from the ranking, insert in position order, and shift other
  games down. Positions beyond the available list append. Pins are not labelled.
  Inactive/missing catalogue IDs are excluded. `games` applies only in manual
  mode; pins apply only in hybrid/AI. Switching modes preserves inactive settings.
- `layout`: `row` scrolls a single row of large tiles; `double` scrolls two rows
  of small tiles without providers. Defaults are 10/20 Home tiles respectively.
- `homeLimit`/`pageLimit`: 1–200, Home no larger than page; default full limit 100.
  The resolved list is deduplicated and trimmed to `pageLimit`, then Home displays
  its first `homeLimit` entries. Rankings refresh only on load or explicit retry.
- `rankingMinutes`: requested CRM period, 1–525600 minutes, default 60.

**View all →** navigates to the same publication/private preview with
`?popular=<module-key>` (retaining language and preview token). Only that module
is shown: top three cards and numbered rows for the rest. The subtitle uses CRM
metric, country/worldwide scope, period, update timestamp and personalization;
manual lists have no invented ranking subtitle. Empty lists provide **Browse all
games**, which displays the enabled casino catalogue through `&browse=1`.
The bottom Search action opens that catalogue; full lists retain name/provider
search without changing ranking positions.
Skeletons precede loading; unavailable rankings show **Games didn't load** and
**Try again**. Last successful rankings and catalogue details are persisted in
`PopularRanking`, separately scoped by casino and country/personal identity.
An outage uses that saved copy with a visible notice; a successful empty ranking
replaces the old copy. Hidden/stale-publication widgets remain inaccessible.

### Explicit demo integration

The repository has no production play-event ranking or player-login service.
New CRM `/games/ranking` and `/games/demo-favourites` endpoints operate **only**
in `CRM_UI_MODE=demo`; ranking metadata contains `demo: true`. They use synthetic
catalogue popularity, not actual bet volume. Generated game artwork is fictional
catalogue artwork. All real game details are resolved by casino-local `gameId`;
badges come from catalogue `NEW`/`HOT`/`JACKPOT` tags and jackpot attributes.

`CMS_POPULAR_DEMO_INPUTS=1` enables the preview's **Demo country** dropdown
(ISO country or `WORLD`) beside the viewport selector in the preview toolbar.
The editor preview is anonymous; no signed-in-player checkbox or separate demo
controls strip is displayed.
The viewport selector uses its selected device as its visible label.
Demo inputs default on in local mode and off in production.
Standalone/public demo links accept `demo_country=PL` and
`demo_player=1`; these are explicitly demo inputs, not trusted geolocation/login.
Demo player IDs are random, server-session-bound, and never accepted from the
browser. Hearts are hidden anonymously. Favourite writes require CSRF, a current
publication/permitted preview, a casino-owned enabled game, and the demo session.
They persist in the CRM tenant snapshot; personal responses are private-cacheable
only. Replacing the demo service with authenticated production rankings/identity
is a separate integration; no real customer personalization is claimed.

Apply migrations before starting the updated backend. Verification:
`python3 cms/tests/popular_browser_test.py`,
`python3 crm/api/test/popular_games_test.py`, and
`CMS_ENV=local cms/.venv/bin/python cms/manage.py test core.test_popular`.

## Editing workflow

### Page management

The right-hand burger button in the editor title opens **Page management**:
select a website page, or create a blank page / copy the selected saved page.
Copies include modules and Localization overrides, layout, theme and navigation;
they start as unpublished revision 1. Unsaved changes require confirmation before
switching or creating a page. Copying uses the saved source, not unsaved edits.

Edit the selected page's title, URL slug, layout, theme, navigation and modules.
Each page has its own draft revision, ephemeral preview and publication.
Home keeps its reserved `home` slug and public `/site/<casino-name>/` URL.
Additional pages publish to `/site/<casino-name>/<page-slug>/`; duplicate slugs
within a website are rejected. Saving a page URL changes its public routing;
content still comes from its last publication until publishing again.
There is no delete/unpublish action.

Staff APIs: `GET/POST /cms/api/sites/<id>/pages/` lists/creates pages
(`title`, `slug`, optional casino-local `source_id`). Existing draft, preview,
publish and draft-widget endpoints accept `?page=<page-id>`; omitted page
continues selecting Home. Page permissions inherit website membership and
publication permission. Apply `0005_page_configuration` before starting.

Casino URL names use stable hyphenated names: **Aurora Casino** becomes
`aurora-casino`. `0006_site_public_slug` assigns names to existing sites;
collisions receive numeric suffixes (`aurora-casino-2`). Internal CRM-linked
slugs and existing `/cms/sites/...` URLs remain supported.
Previews use `/site/<casino-name>/preview/<draft-revision>/<page-slug>/`
(Home omits the page slug). Generated unsaved previews retain their expiring,
user/site/page-bound token; the path's revision and page must match the preview.
Without a token, only the matching current saved draft can be previewed by
authorized staff, not historical revisions. Preview content is never public.
Session and CSRF cookies now cover `/` so CMS authentication also reaches
`/site/`. New cookie names avoid collisions with previous `/cms/` cookies;
existing users must sign in again after upgrading.
Proxy **both** `/cms/` and `/site/` to Django using the supplied Nginx snippet;
the local Ruby proxy supports both paths.

1. Sign in with a staff account. The single **Website** selector fetches websites
   from the CRM casino API. Superusers see all CRM websites; other staff see
   only CRM websites already assigned through a `SiteMember` record.
2. From My Casinos, **CMS edit** opens `/cms/?crm_site=<CRM ID>`. Selecting an
   uninitialized website automatically creates its starter through a
   CSRF-protected POST for superusers. There is no separate CRM dropdown,
   connection button, configurable public CRM origin or linking step.
   Reimporting an existing ID does not overwrite its draft.
3. Every site starts with the `/h` section order: promotions, categories, games,
   matches, providers, more promotions, tournaments, recent wins, tournament
   winners, rewards, plus a sample announcements module. Header profile details,
   Tab menu, Main menu and SEO text modules are also included.
4. Right-click a preview block or a module-list row for **Properties ...**,
   **Hide / Show**, and **Remove**. Hidden modules stay visible but greyed out
   in Visual preview and the module list; their website controls are disabled.
   Right-click, Properties and drag ordering remain available so they can be
   shown again. Hidden modules are omitted from standalone previews and the
   published website, including public widget endpoints.
   Properties are fetched from the module schema API;
   no inline Selected module panel remains. Double-click a list row also opens
   Properties. Drag modules in the list or preview to reorder them; the dragged
   block fades and the insertion target is highlighted. Keyboard: Shift+F10
   opens the context menu; Alt+Up/Down reorders a list row.
   Header, tab and main-menu modules occupy their semantic regions; their
   ordering is within those regions, not interleaved into main content.
   Add modules, change theme/layout, or edit navigation links in the sidebar.
   Desktop/tablet/mobile viewport controls preview the same responsive page.
5. Edits produce a validated, user/site-bound **ephemeral preview** after a short
   debounce without saving. Tokens expire after five minutes, require the same
   signed-in user, and never grant public access. Retry preview renews it.
   Module requests use the ephemeral document's own parameters. **Preview**
   opens that unsaved, private document in a new tab without editing frames.
   Reload or make another edit to renew expired previews.
6. **Save draft & preview** persists changes and increments the draft revision.
   Stale writes return 409 instead of overwriting another editor's work.
   Unsaved edits trigger a leave warning; site switches require confirmation.
7. **Publish** requires `can_publish` membership (or superuser) and no unsaved
   changes. It freezes title, layout sections, menu, validated theme colors and
   block configuration in a publication. Public URL:
   `/site/<casino-name>/`. Draft edits never change that snapshot.
8. **Website settings** on My Casinos retains the CRM name/URL/skin form.

CRM site import is a snapshot of identity/enabled/theme, not continuous
bidirectional synchronization. Disable a CMS `Site` in Django administration
to stop its public rendering immediately. CRM Disable is still stored CRM
configuration; it does not shut down external websites. Theme chosen in the
CMS belongs to the CMS draft and does not write back into CRM.

### Data boundaries

- Games, categories, providers, segments and active promotions fetch only the
  site's **CRM casino catalog** through a private fixed-origin adapter, not
  arbitrary URLs. `Site.crm_id` supplies `X-Casino-Id` on every catalog request;
  catalog caches are casino-specific. Unlinked sites fail explicitly with 503,
  never falling back to a global catalog. Only the casino registry and module
  property schemas remain global. Staff catalog queries require `site_id` and
  site permission before contacting CRM.
  Game filters accept provider/category IDs and max items (1-40). Disabled games
  are omitted; output only contains allowlisted public fields. No customer PII,
  risk/financial metrics, internal bonus configuration or credentials reach
  public widgets.
- **NexLuck Demo Layout** uses the actual root and `/h` stylesheets, bundled
  unchanged except for local dropdown stylesheet URLs. It shares the `/h`
  demo artwork registry and its header/card/navigation markup. No `/h` page
  iframe, script-driven mock activity, or external CSS runtime dependency is
  needed (the original Google Fonts and public artwork URLs remain).
  Its original dark palette is preserved; Compact grid also applies theme
  background/text tokens.
- Header profile details are explicitly demo-only: demo currency balances,
  bonus/messages controls and luna.play avatar; no CRM customer records are
  fetched. Tab menu renders Deposit/Search/Sport/Menu; Menu opens the Main menu
  module and its page navigation links. Deposit is not a real transaction.
- SEO text is an SSR module on every starter page. Its Properties contain an
  HTML source editor with formatting buttons. Bleach allowlists paragraph,
  heading, list, emphasis and link markup; executable attributes, scripts and
  unsafe protocols are removed during validation and again during rendering.
  Migration 0002 adds the new modules only when missing and advances changed
  draft revisions, without altering existing content or published snapshots.
- No CRM sports, tournaments, winners or rewards feed exists. Those sections
  carry explicit editable “not connected” information, never invented live odds
  or customer activity. Implement an authorized plugin when a real feed exists.
- Public widgets resolve only from the site's **current** publication, not a
  client-provided module kind/parameters or an old publication ID.
- Catalog data remains live after publishing, cached for 30 seconds. Publish
  freezes **configuration**, not remote catalog contents. Announcements have a
  separate explicit `is_public` lifecycle and may update immediately.

## Model / query design

Sites use unique CRM IDs and slugs. Pages have a unique `(site, slug)` constraint.
Blocks use unique `(page, key)` and a `(page, slot, position)` rendering index.
Membership and menus use unique site/user and site/key constraints.
Publications use unique `(page, revision)` and `(page, created_at DESC)`.
The example plugin indexes `(site, is_public, created_at DESC)`.
Foreign keys are indexed by Django. Querysets select related layout/theme/
publication and prefetch draft blocks/menus. No blanket JSON GIN indexes:
JSON is loaded by indexed owning record and is not used for unindexed search.

Public document snapshots are cached by immutable publication ID. Every page
request still checks the current site enabled state and published pointer.
ETag conditional requests avoid re-rendering unchanged public documents.
Draft, preview, auth and editor endpoints use no-store; public responses
must revalidate. React islands fetch independently after initial SSR paint and
display explicit loading/error/empty states with retry and abort on unmount.

### JSON-driven layouts and themes

`Layout.renderer` must match a trusted registry entry (`home` or `compact`).
`Layout.definition` supplies the tree's sections and responsive grid columns:

```json
{"sections":[{"slot":"main","columns":1}]}
```

Blocks reference section slots, ordered by position. Unknown slots, duplicate
slots, unknown module kinds, extra parameters, unsafe menu URLs and invalid
colors are rejected. Theme tokens accept only six-digit colors for
`background`, `panel`, `accent`, `text`. There is no raw HTML/JavaScript, eval,
DB-supplied Python import, remote template execution or unsanitized CSS input.
HTML text is escaped by Django/React. Plugin Python and frontend assets are
trusted deploy-time code with full server privilege, not sandboxed uploads.

## API

All writes use session authentication, staff membership and Django/DRF CSRF.
DRF JSON only, bounded payload size, request throttles; login rate limits use
shared cache in production. Public endpoints never expose drafts.

| Endpoint | Methods | Access / purpose |
|---|---|---|
| `/cms/api/bootstrap/` | GET | Staff; permitted sites, module/layout/theme catalogs |
| `/cms/api/crm-sites/` | GET | Staff; CRM-sourced websites filtered by permitted site membership |
| `/cms/api/import/` | POST | Superuser; `{crm_id}` |
| `/cms/api/sites/<id>/draft/` | GET, PATCH | Site editor; full strict document with expected revision |
| `/cms/api/sites/<id>/previews/` | POST | Site editor; private expiring unsaved preview |
| `/cms/api/sites/<id>/publish/` | POST | Site publisher; `{revision}` |
| `/cms/preview/<id>/` | GET | Staff + site permission; optional user-bound preview token |
| `/site/<casino-name>/preview/<revision>/<page-slug>/` | GET | Staff + site permission; revision/page-checked draft preview; Home omits page slug |
| `/cms/api/sites/<id>/widgets/<key>/` | GET | Site editor; draft/preview widget |
| `/cms/sites/<slug>/` | GET | Public; enabled site and published document only |
| `/site/<casino-name>/<page-slug>/` | GET | Public canonical URL; Home omits page slug; legacy `/cms/sites/` paths remain supported |
| `/cms/api/public/<slug>/<publication>/widgets/<key>/` | GET | Public; current publication widget only |
| `/cms/api/plugins/announcements/<id>/` | GET, POST | Site editor read / publisher create |
| `/cms/health/` | GET | Database + cache readiness (503/500 on failure) |
| `/cms/api/` | GET | Staff; localized interactive API reference; standard Swagger UI at `?view=swagger` |
| `/cms/api/openapi.json` | GET | Staff; module API OpenAPI 3 specification |
| `/cms/api/modules/` | GET | Staff; parameter schemas/defaults used in Properties dialogs |
| `/cms/api/segments/?site_id=<id>` | GET | Site editor; saved casino-owned CRM segment IDs/names, no customer membership |
| `/cms/api/get_promotion_bonuses/?site_id=<id>` | GET | Site editor; validated casino-owned promotion catalog query |

See [frontend module API specifications](api/README.md) for parameter semantics,
examples and public-widget boundaries. Production CRM credentials require
`games:read bonuses:read casinos:read segments:read`.

Database configuration administration is superuser-only; pages and blocks
must be changed through the revision-aware editor. Use a separate production
admin identity, MFA/SSO at your ingress, and least-privilege site memberships.

## Plugin example / extension contract

`plugins/announcements` demonstrates the whole path:

1. Django app and migration define the `Announcement` site-owned model.
2. AppConfig `ready()` registers `Module("announcements.notice", ..., validator,
   data_callback)` in the core registry and extends `registry.plugin_urls`.
3. Admin exposes model configuration to superusers; the plugin API uses
   `require_site` and publication permission.
4. `data_callback(site, props)` only returns public notices for that site.
5. `frontend/src/plugins/announcements.jsx` calls
   `registerWidget("announcements.notice", Component)`; Vite discovers JSX
   registration files in that extension directory at build time. Add the module
   to a page and it hydrates independently.
6. The editor includes a sample public-announcement form. It reports that these
   entries have their own immediate publication lifecycle.

For another extension, install its trusted Python app and add its AppConfig to
`CMS_PLUGIN_APPS` (comma-separated), run its migrations, drop its frontend
registration into `frontend/src/plugins/`, and rebuild. No core source changes
are needed. Core extension points:

```python
from core.registry import Module, registry

registry.register(Module("myplugin.widget", "My widget", validate_props, fetch_data))
registry.layout("my-layout", "myplugin/layout.html")
registry.plugin_urls.extend(my_urlpatterns)
registry.publish_hooks.append(my_transactional_publication_hook)
```

Callbacks run synchronously during save/publish/data requests. Publish hooks
run inside a transaction: avoid external side effects there; schedule them
with `transaction.on_commit` or a reliable outbox. Duplicate registration fails
startup explicitly. Add a matching `Plugin` record for a global kill switch.
Turning it off blocks new enabled usage and widget delivery.

## Production deployment

Docker is **not required locally**, but is needed to run this provided stack.
The application does not auto-deploy onto the existing live host.

```sh
cd cms
cp .env.example .env
# Set real independent secrets, allowed hosts/origins and read-only CRM credentials.
docker compose build
docker compose up -d db pool redis
docker compose run --rm web python manage.py migrate
docker compose run --rm web python manage.py setup_cms --import-crm
docker compose run --rm web python manage.py createsuperuser
docker compose up -d web
```

The web image builds with the repository root as context, using
`cms/Dockerfile`; its Dockerfile-specific ignore file excludes local databases,
environments, dependencies and Git. Only the shared `/h` design and CRM segment
selection component are copied into the frontend build, never CRM server code.

Install `deploy/nginx.conf` inside the existing HTTPS server block, validate
`nginx -t`, then reload Nginx. Only loopback 8090 is exposed by Compose; PostgreSQL,
PgBouncer and Redis have no host port mappings. Keep the Docker network private.
Gunicorn is nonroot, behind TLS termination, with secure cookies/HSTS/CSRF and
frame denial (with an explicit same-origin exception for the preview). Only a trusted ingress should reach it; it
trusts `X-Forwarded-Proto`. Configure encrypted off-host DB backups, secret
management, alerting and tested restore procedures before a real launch.

PgBouncer uses transaction pooling (20 + 5 reserve DB connections, 300 clients);
Django disables persistent connections and server-side cursors accordingly.
Django also disables psycopg auto-prepared statements for compatibility with
the packaged PgBouncer version in transaction mode.
No session-scoped SQL state, advisory session locks or LISTEN/NOTIFY are used.
Redis caches catalog/publication/preview/auth state; sessions use cached_db so
session rows remain in PostgreSQL. Redis uses noeviction to avoid silently
evicting active state and has AOF persistence; monitor memory and cache errors.
Production cache failures are explicit errors, not silent SQLite/fake-data
fallbacks. Use TLS/ACLs for Redis and DB if moving them outside this isolated
single-host network. Add a dedicated database migration role in hardened
deployments rather than giving the application schema-owner privileges.

There is **no guaranteed sub-millisecond response time**. PostgreSQL index hits
can be fast, but network, authorization, JSON and concurrency add latency.
Benchmark with your production dataset and budget p50/p95/p99 separately for
SSR, cache hits, catalog fetches and publication writes. Local probe:

```sh
CMS_ENV=local .venv/bin/python manage.py benchmark_cms --iterations 200
```

Before deployment: run the functional/browser suites, `check --deploy`, test
the actual PostgreSQL/Redis/transaction-pool stack, verify tenant isolation,
failure/recovery and backups, load test with representative traffic, integrate
your authentication/compliance policies, and review plugin code. Pin container
digests in your release system and maintain dependency patch updates.

## Languages and localized content

The management language selector shares `nexluck.ui.language` localStorage and
the `nexluck_language` cookie with CRM. A dirty editor confirms before changing
UI language. Login, editor, Properties, schema labels and validation messages
support English, Russian, Portuguese (Portugal), Portuguese (Brazil) and Spanish
(Spain); casino/player names and IDs remain unchanged.
The explicit `/cms/i18n/runtime.js` and `/cms/i18n/catalog.js` routes serve the
shared root localization assets. Run `python3 localization/build_catalog.py`
from the repository root before building the deployment image. The Dockerfile
automatically copies the root `localization/` directory (including
`runtime.js`, generated `catalog.js`, and `cms.json`) to `/localization`;
no manual container asset copy is required.

Module Properties has an independent **Localization** selector. English edits
the existing `props`; non-English edits are stored under their locale key in
`translations` on each ContentBlock (for example `translations["pt-BR"]`).
Overrides are persisted in draft saves and immutable publication snapshots.
Each translated override is validated against the same module serializer as
English (including SEO HTML sanitization); missing localized fields fall back
to current English values. Existing documents without `translations` continue
working. Apply migration `0003_contentblock_translations` before starting.

The private preview follows the Properties language without changing the
management language. Home has no visitor-facing language selector.
Website language can be selected through `?lang=en|ru|pt-PT|pt-BR|es`;
otherwise the language saved in **My wallet → Profile settings** is used
(`nexluck_website_language` cookie, separate from management language).
The default is English and unsupported languages
return 400. Django's active locale is normalized to `pt`/`pt-br` while CMS
content, cookie and response headers retain the explicit `pt-PT`/`pt-BR` codes.
The website language is carried through widget URLs, static labels and async
widget messages. Publication cache keys and page/widget ETags include language.
Raw upstream CRM catalogs remain shared because their saved data is not
translated; localized module filtering happens after raw-cache lookup.

## Validation commands

```sh
cd cms
CMS_ENV=local .venv/bin/python manage.py test core
CMS_ENV=local .venv/bin/python manage.py makemigrations --check --dry-run
node tests/localization_runtime_test.cjs
CMS_ENV=local CMS_USE_MANIFEST=1 .venv/bin/python manage.py collectstatic --noinput
# Playwright + Google Chrome from the repository's existing test environment:
python3 tests/browser_test.py
```

Browser tests create an isolated local database, test account and CRM catalog
stub; they do not mutate production/real customer records. Backend tests cover
site boundaries, CSRF, invalid input, safe SSR, stale writes, immutable snapshots,
plugin registration/data isolation, cache behavior and unpublished visibility.
