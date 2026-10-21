# CRM casino context: requirements specification

Status: implemented locally, with API and Chrome integration coverage.
Scope: confirmed product baseline. Production rollout still requires the
authenticated deployment and backup/restore release gates below; this change
has not been deployed.

Implementation and operational notes: [My Casinos README](README.md).
Isolation/migration checks: [HTTP tests](../../api/test/casino_context_test.py).
Switching/UI checks: [Chrome tests](../../api/test/context_browser_test.py).

## 1. Objective and terminology

The CRM MUST operate in the context of one casino website at a time. All
casino-owned business data MUST belong to exactly one casino and MUST be
isolated from other casinos on both client and server. Analytics is explicitly
independent of the operational context.

- **Casino:** a persisted My Casinos website identified by its immutable
  `CS-...` ID. Its name or URL MUST NOT serve as an ownership key.
- **Operational context:** the casino selected for the current browser tab.
- **Global resource:** explicitly enumerated platform information that is not
  owned by the selected casino.
- **Clone:** an independent copy with new object IDs and remapped references,
  not a shared object, alias, live link or ongoing synchronization.
- **First casino:** the first permitted casino in the canonical My Casinos
  ordering: `created_at ASC, id ASC`. Table search, temporary sorting and
  pagination MUST NOT change this definition.
- **Configuration groups:** Segments, Games, Catalogs and Payment connections,
  as defined in section 7.

MUST / MUST NOT indicate mandatory acceptance conditions. Every requirement
applies to list, detail, mutation, bulk operation, export and nested-resource
surfaces unless explicitly excluded.

## 2. Confirmed product decisions

| ID | Decision |
|---|---|
| PD-01 | Each business object belongs to exactly one casino; no shared business objects in this release. |
| PD-02 | My Casinos is global and shows the same casino registry regardless of operational context, subject only to operator permissions. |
| PD-03 | Each browser tab has an independent operational context, retained on refresh and navigation. |
| PD-04 | With no prior or explicit context, select the first permitted casino automatically. |
| PD-05 | Disabled websites remain selectable, with a visible disabled-status warning. |
| PD-06 | New-casino creation optionally copies selected configuration groups from an explicitly selected source casino. |
| PD-07 | Required clone dependencies are included automatically and disclosed before confirmation. |
| PD-08 | Payment credentials are never copied; cloned payment connections remain disabled until configured. |
| PD-09 | Initial migration retains original data in the first casino and clones configuration, but not customer/financial history, into the remaining casinos. |
| PD-10 | Catalogs includes all business reference catalogs, including categories, providers, currencies, countries and languages. |
| PD-11 | Analytics does not inherit or change filters from operational context. |

## 3. Ownership and scope matrix

| Surface / data | Scope | Required behavior |
|---|---|---|
| My Casinos list, names, URLs, themes, status and timestamps | Global registry | Same list in every context; existing authorization remains applicable. |
| CRM operator identity, permissions, login, context preference and API documentation | Global platform | Selection MUST NOT change operator identity or grant access. |
| Customers, profiles, credentials, KYC/AML/RG state and activity | Casino-owned | No cross-casino reads, identity matching, membership or mutation. |
| Wallets, balances, transactions, ledger entries and payment history | Casino-owned | Customer, wallet, transaction and payment references must have the same owner. |
| Bonuses/promotions, targeting, banners, promo codes and bonus change history | Casino-owned | Lists, editors, copy/paste, AI-generated definitions and exports use the selected casino. |
| Segments, rules, membership results and business-configurable parameter options | Casino-owned | Segment pickers and rule evaluation use only that casino's objects. |
| Games, providers, categories, ordering, targeting and game settings | Casino-owned | No global mutable game/provider/category records or cross-casino membership. |
| Payment connections/methods, credentials, restrictions and routing cascades | Casino-owned | All runtime routing and nested references remain inside the selected casino. |
| Business reference catalogs, including currency/country/language availability and configuration | Casino-owned | Independent per-casino records, available options and enabled settings. |
| Loyalty definitions/state, compliance workflows and business audit events | Casino-owned | Applies even where a section is currently a placeholder. |
| CRM Home business counters and section summaries | Casino-owned | Recalculate for context or label unavailable; never show another casino's totals. |
| CMS sites, drafts, blocks, menus, publications and plugin business content | Casino-owned | Existing CMS site ownership remains authoritative; CRM integration passes the matching casino ID. |
| Analytics reports, filters, trends, exports and Ask AI report results | Cross-casino reporting | Use independently selected Analytics websites and reporting permissions, not operational context. |

Platform protocol/schema definitions (ISO codes, allowed field types, comparison
operators and validation algorithms) MAY be immutable global code. Mutable
business catalog entries and casino-enabled selections MUST be casino-owned.
Global exchange-rate reference feeds MAY supply input, but casino-specific
overrides MUST be owned by that casino; Analytics retains its own documented
conversion rules.

The global casino registry and platform information are necessary explicit
exceptions to business-object ownership. Analytics is a reporting exception,
not permission to mutate operational objects across casinos.

## 4. User interface requirements

### 4.1 My Casinos

- UI-01: Every row actions menu MUST include **Set as CRM Context** alongside
  the existing actions. Right-click, Actions button and Shift+F10 MUST expose
  the same operation.
- UI-02: The current row MUST display **Current context**. Its context action
  MUST be disabled to prevent a redundant switch.
- UI-03: Selecting another row MUST use the shared switching procedure in
  section 5, update the header, and leave the user on My Casinos.
- UI-04: Context selection MUST NOT change the casino's name, enabled flag,
  creation/update timestamps, CMS publication or business configuration.
- UI-05: The list MUST NOT filter itself to the selected casino. Creating a
  casino MUST NOT replace or hide the other registry entries.

### 4.2 Header selector

- UI-06: A control labeled **Context** MUST appear immediately next to the
  NexLuck logo on every CRM page, including Analytics and My Casinos.
- UI-07: The control MUST be a dropdown showing the active casino name.
  Duplicate names MUST be disambiguated with their immutable casino IDs.
  Disabled entries MUST display a `(disabled)` suffix.
- UI-08: The dropdown and row action MUST invoke the same switch procedure;
  neither may maintain a separate context state.
- UI-09: The selected disabled casino MUST show a persistent warning:
  **This casino website is disabled. CRM editing is still available.**
  Disabled website status MUST NOT silently become read-only or disable CRM
  editing. Existing object-specific restrictions still apply.
- UI-10: Arrow/text insets MUST follow the shared dropdown geometry. The
  selector MUST have an accessible name, keyboard operation, visible focus
  and a responsive layout without horizontal page overflow.
- UI-11: With zero permitted casinos, show **No casino available**, disable
  selection and block casino-scoped data. My Casinos, platform information
  and independently authorized Analytics remain accessible.

## 5. Context lifecycle and switch transaction

### 5.1 Initialization and persistence

1. An explicit navigation context, if provided, MUST be validated first.
2. Otherwise restore the tab's saved casino ID if it is still permitted.
3. Otherwise, for a fresh tab with no saved selection, select the first
   permitted casino, including disabled casinos.
4. Persist the selection in tab-scoped storage. Shared `localStorage` or a
   server-session-wide active-casino variable MUST NOT be authoritative.

The browser navigation parameter is `casino_context=<CS-ID>`. It MUST be
retained in CRM links, refreshes, history entries and explicit new-tab links.
New tabs without an explicit parameter use their own initialization; tabs
MUST NOT synchronize subsequent changes through storage events or broadcasts.

An invalid, deleted or no-longer-permitted explicit/restored context MUST show
an error and block scoped operations until the user selects a valid casino.
It MUST NOT silently switch ownership to the first casino. Loss of preference
storage MUST be reported; the validated URL context can retain navigation.

### 5.2 Switching procedure

| Stage | Required behavior |
|---|---|
| Already active | No mutation, reload or discard prompt. |
| Dirty editor, unsaved modal, staged bulk changes or unsubmitted wizard | Prompt **Discard unsaved changes and switch casino?** with **Stay** and **Discard and switch**; Stay is the safe default. No autosave or cross-casino draft transfer. |
| Active in-flight write | Block switching until its outcome is known. Do not claim cancellation after the server may have committed. |
| Validation | Verify target exists and the operator may access it; expose loading/error state explicitly. |
| Transition | Disable scoped actions, abort superseded reads, advance the client context generation, clear old records and context-specific selections. |
| Commit | Store the target ID, update header/URL, reset pagination and entity filters, and load target data. |
| Read failure | Keep the validated new context and show an explicit error/Retry. Never refill the page with cached data from the old casino. |

Additional mandatory rules:

- SW-01: On list/settings routes, remain in the same functional section.
- SW-02: On a customer/bonus/other object-detail route, navigate to that
  section's list; on a new-object form, open a fresh form for the target.
  Never reuse an object ID from the old context in the new context.
- SW-03: Close detail/property dialogs and clear cross-row selections, copied
  objects, temporary credentials, previews and pending AI operations.
  Unsaved changes MUST receive the discard decision first.
- SW-04: Scope read caches, saved filters, copy/paste buffers and generated
  suggestions by casino ID. Old asynchronous responses MUST be ignored even
  if cancellation fails.
- SW-05: Every write MUST capture its initiating casino ID. A response MUST
  NOT update another context's UI.
- SW-06: A context switch MUST NOT mutate or overwrite any existing business
  object merely because it has the same name/external ID in the target casino.
- SW-07: Browser Back/Forward context changes MUST pass through the same dirty
  state guards and validation.

## 6. Server/API and integrity requirements

- API-01: Persist a non-null immutable `casino_id` on every casino-owned
  object after migration. Ownership MUST NOT be editable through ordinary
  object PATCH/PUT endpoints.
- API-02: Casino-scoped operational requests MUST supply
  `X-Casino-Id: <CS-ID>`. The server MUST resolve and authorize it before
  reading or writing business data; client-side filtering is insufficient.
- API-03: Missing/malformed context MUST return a documented 400 error;
  unauthorized context MUST return 403; a detail/nested object outside the
  authorized selected context MUST return 404 without disclosing its owner.
- API-04: If a request body/route also declares ownership, it MUST agree with
  the resolved context or fail validation. No default tenant may be inferred
  for API writes.
- API-05: Object creation MUST set ownership server-side. Lists, counts,
  pagination, search, facets, nested APIs, exports and mutations MUST use the
  same tenant predicate.
- API-06: All foreign-key-style references, including references inside JSON
  rules, MUST be validated against the object's owner. Business uniqueness
  constraints MUST be casino-scoped; primary IDs MUST remain globally unique.
- API-07: Idempotency keys and cache keys MUST include casino ownership.
  Background work MUST carry an explicit validated casino ID, never read a
  mutable browser/session preference later.
- API-08: Global endpoints (casino registry, platform/schema metadata) MUST
  explicitly declare their global classification and MUST NOT accidentally
  inherit a tenant predicate.
- API-09: Service-to-service CRM consumers, including CMS, MUST supply the
  owning casino ID on each scoped catalog request. CMS server configuration
  derives it from the selected CMS site's `crm_id`, not from browser input.
- API-10: Existing unauthenticated prototype UI endpoints MUST NOT be treated
  as a production authorization boundary. Production rollout MUST provide
  authenticated operator identity, casino access checks and mutation
  protection, or explicitly restrict the deployment to demo-only operation.
- API-11: Responses and errors MUST be documented in OpenAPI. Cross-context
  errors MUST NOT produce empty success responses or successful-looking saves.

## 7. New-casino selective cloning

### 7.1 Creation UI

The existing Name, URL and Theme fields remain required. Add an optional
**Copy configuration from casino** selector, default **Do not copy**, with the
active context pre-offered as a convenience but not silently selected.

Once a source is chosen, show initially unchecked group checkboxes:

| Group | Content |
|---|---|
| Segments | Saved segment definitions/rules; no customer membership snapshots. |
| Games | Game definitions, enabled/settings, targeting and assignments; no player activity or wagering history. |
| Catalogs | Categories, providers, currencies, countries, languages and other business reference catalogs/settings; no platform accounts or runtime secrets. |
| Payment connections | Connection/method definitions, nonsecret settings, restrictions and dependent routing cascades; no credentials, balances or transactions. |

- CL-01: Selecting a source alone MUST NOT select all groups.
- CL-02: Show requested groups and automatically required dependency groups
  separately. Required groups MUST be checked/read-only with an explanation.
  No undisclosed dependency may be copied.
- CL-03: Dependency closure MUST include referenced segments, games, categories,
  providers, currencies, countries and languages. Category memberships that
  reference games and cascades that reference connections MUST also resolve.
  Cycles MUST be resolved as a graph; copying order MUST NOT lose references.
- CL-04: Dependencies MUST be copied only as needed to make selected groups
  complete; unrelated bonus, customer or financial objects MUST NOT be swept
  into a clone. An unsupported dependency MUST produce an explicit error.
- CL-05: Before submission, show source name/ID, requested and dependency
  groups, per-type record counts, and the payment-credential warning.
- CL-06: The source MUST be a permitted casino. Disabled sources are allowed
  and labeled. Source and target MUST differ.

### 7.2 Copy semantics

- CL-07: Create fresh globally unique IDs, target ownership and timestamps;
  retain business names/settings where valid. Preserve source external IDs
  only as casino-local business identifiers, never as shared record identity.
- CL-08: Remap every internal reference through the source-to-target ID map.
  Source ownership, audit history and identifiers MUST NOT remain as live
  target references. Names encoded in legacy rules MUST resolve to target
  objects unambiguously or fail validation.
- CL-09: Payment API keys, passwords, tokens, signing/encryption secrets,
  private certificates and webhook secrets MUST NOT be copied. Secret
  references MUST be cleared, not preserved as pointers to source secrets.
  Copied connections and dependent executable routing MUST be disabled and
  marked **Configuration required** until valid target credentials/settings
  have been supplied and explicitly enabled.
- CL-10: Customers, player credentials, KYC documents, wallets/balances,
  transactions, actual bonus awards, redemption/promo-code usage, risk cases,
  activity and historical reports MUST NEVER be cloned by this operation.
- CL-11: Unselected groups without dependency inclusion start empty.
  Bonuses, loyalty state, historical audit events and CMS content are not
  options in this cloning release. Creating a fresh CMS starter is separate.
- CL-12: Copies MUST be independent: editing/deleting source records after
  cloning MUST NOT change target records, and vice versa.
- CL-13: Validate source revision/snapshot and dependency closure at submit.
  If source changed since preview, require refreshed preview/confirmation.
- CL-14: Casino creation plus clone MUST be atomic: no visible half-created
  casino/configuration on failure. Retry with the same operation key MUST
  return the original result rather than create duplicate casinos or records.
  Existing file-per-resource persistence must be upgraded or given a tested
  transactional journal before this guarantee can be accepted.
- CL-15: Success returns the target casino and per-type copied counts. Keep
  the operator's context unchanged; offer **Set as CRM Context** explicitly.
- CL-16: Write a clone audit event recording actor, source/target, selected
  groups, dependencies, snapshot/version, counts and outcome, never secrets.

## 8. Initial migration

The migration MUST be explicit, repeatable and independently verifiable:

1. Back up all persisted stores and identify browser-only/synthetic fixtures.
   Freeze or serialize writes for a consistent migration snapshot.
2. Freeze the canonical casino order and select the first casino as original
   owner. Abort for explicit operator resolution if no casino exists.
3. Assign all original unowned business objects to this first casino,
   preserving original IDs and all real historical values.
4. For every other existing casino, copy the four configuration groups in
   section 7, including their dependency closure, with new IDs.
5. Do not duplicate customers, player credentials, wallets, balances,
   transactions or historical records. Those remain only in the first casino.
   Other casinos start without operational history.
6. Existing bonus definitions and other nonselected configuration remain
   owned by the first casino; this migration MUST NOT silently clone them
   outside the four agreed configuration groups.
7. Disable cloned payment connections and clear all copied secret references.
8. Verify no unowned objects, invalid references or accidental cross-casino
   relationships remain. Verify original financial totals are unchanged.
9. Store migration version, source casino, ID mappings and per-casino counts.
   Re-running the same migration MUST NOT clone records a second time or
   overwrite edits made after migration.
10. Switch application reads/writes to context-required behavior only after
    validation succeeds. Rollback MUST restore a consistent data/application
    version, not just remove ownership fields.

Synthetic data generation MUST also be tenant-aware. Reloading a page or
restarting a server MUST NOT reinsert the same global demo customers/payments
into every casino. Synthetic fixtures MUST remain labeled as demo data.

## 9. Analytics exception

- AN-01: Entering Analytics MUST NOT constrain reports to operational context.
  Its existing website filter remains independently controlled by the user.
- AN-02: Switching operational context while on Analytics MUST update only the
  header selection; retain Analytics date range, websites, segments, grouping,
  data selection and Ask AI reporting scope.
- AN-03: Analytics defaults and **All websites** MUST mean all reporting-
  permitted websites, not all operationally selectable websites by assumption.
  Operational context is not a reporting permission grant.
- AN-04: Analytics exports and AI answers MUST use the report's explicit
  filters. They MUST NOT receive a hidden `X-Casino-Id` filter through a generic
  operational API helper.
- AN-05: Analytics dimension APIs MUST explicitly support reporting scope.
  Casino-owned segment/game/category/provider identities MUST be qualified by
  `(casino_id, object_id)` and labeled with casino when ambiguity exists.
  Identical names across casinos MUST NOT merge different rule definitions.
- AN-06: Segment creation/editing initiated from Analytics MUST require an
  explicitly displayed owner casino and ordinary operational authorization.
  Do not infer the target silently from the header or report's All selection.
- AN-07: Current Analytics uses independent synthetic websites and fixtures.
  Replacing those with the shared casino registry MUST NOT silently relabel
  synthetic history or imply live data. Any mapping must be explicit and
  preserve the existing synthetic-data disclosure.

## 10. Audit, errors and operational behavior

- OP-01: Business change audit records MUST include immutable casino ID,
  actor, action, object IDs, timestamp and result.
- OP-02: Context-change audit events are platform preference events and MUST
  record old/new IDs without creating a business ownership change.
- OP-03: Disabling a casino MUST NOT delete records or remove access to its
  context; the disabled warning updates on the next registry refresh.
- OP-04: Permission revocation or missing casino MUST block scoped reads and
  writes and offer explicit reselection without silently choosing an owner.
- OP-05: Registry, context validation, clone and data-load errors MUST surface
  explicit messages and safe Retry behavior. No silent defaults on failed
  writes, cross-context data fallbacks or optimistic clone success.
- OP-06: Caches and exports MUST remain isolated after rename, website disable,
  tab switching, refresh, navigation and server restart.

## 11. Acceptance tests

| ID | Scenario | Expected result |
|---|---|---|
| AT-01 | Fresh tab without context | Canonically first permitted casino is selected before operational data loads. |
| AT-02 | Change sort/search on My Casinos | Global registry remains available; initialization order is unchanged. |
| AT-03 | Set context from a row | Header changes; list stays global; no casino timestamp/configuration changes. |
| AT-04 | Switch through header | Same result and guards as row action. |
| AT-05 | Reload/navigate within one tab | Selected context survives; URLs retain it. |
| AT-06 | Set A in one tab and B in another | Each keeps its own selection and data after refresh. |
| AT-07 | New explicit context link | Target tab uses that context without changing the source tab. |
| AT-08 | Unsaved bonus/payment/customer form | Stay preserves edits/context; Discard switches and clears old form. |
| AT-09 | Delayed A response arrives after switch to B | A records never render in B. |
| AT-10 | In-flight write during attempted switch | Switching blocked until result known; write retains initiating ownership. |
| AT-11 | Open A object under B through a direct URL/API | No A data disclosed; scoped detail returns 404. |
| AT-12 | Missing context API write | 400; no record created or modified. |
| AT-13 | Unauthorized context / foreign nested reference | 403 for unauthorized context; reference validation fails without cross-casino mutation. |
| AT-14 | Same external ID/name in two casinos | Independent objects; no collision or automatic link. |
| AT-15 | Select disabled casino | Selection succeeds with persistent warning; permitted editing still works. |
| AT-16 | Zero casinos / revoked selection | No scoped fallback data; appropriate disabled selector or explicit reselection. |
| AT-17 | Create casino with no copy | Global registry gains one record; business groups empty; active context unchanged. |
| AT-18 | Clone Segments only without external dependencies | Only definitions copied; no customers or membership snapshots. |
| AT-19 | Clone Games with category/provider/segment references | Required dependencies disclosed and included; every target reference resolves locally. |
| AT-20 | Clone Catalogs containing category-to-game cycles | Dependency closure complete; no missing or source-owned references. |
| AT-21 | Clone Payment connections | Secrets absent; copied connections/routing disabled and marked Configuration required. |
| AT-22 | Failure midway / retry clone | No partial visible target; retry produces no duplicates. |
| AT-23 | Source changes after clone preview | Submission rejected pending refreshed preview/confirmation. |
| AT-24 | Modify source after successful clone | Target remains unchanged. |
| AT-25 | Run initial migration twice | Original IDs/history/totals preserved; configuration copies exist once only. |
| AT-26 | Reload/restart on a new casino | No globally reseeded customer/financial history appears. |
| AT-27 | Switch context on Analytics | Report filters, values, exports and Ask AI scope remain unchanged. |
| AT-28 | Two casinos have same segment name with different rules | Analytics distinguishes owner/ID and never merges rule identity by name. |
| AT-29 | CMS feed for casino B while CRM tab shows A | Feed uses CMS site's B ownership, not tab context A. |
| AT-30 | All lists, counters, facets, export, copy/paste and nested editors | Only selected-casino business data and references are available. |
| AT-31 | Desktop/mobile/keyboard navigation | Context control visible and usable; row menu accessible; no horizontal page overflow. |

## 12. Implementation coverage and release gate

Implementation MUST cover shared CRM chrome/navigation, every existing CRM
entry point, all operational API handlers, all persisted stores and synthetic
generators, finance browser fixtures, segment picker/evaluation, bonus
copy/paste and AI forms, game/category/provider editing, CMS CRM adapters, and
Analytics dependency APIs. Updating only My Casinos or adding a header filter
does not satisfy this specification.

Existing relevant surfaces:

- [Shared chrome and navigation](../../data.js)
- [Casino list](Casinos.jsx) and [casino store](../../api/casino_websites.rb)
- [CRM API](../../api/server.rb) and [OpenAPI](../../openapi.yaml)
- [Customers/credentials](../../api/customers.rb)
- [Games/catalogs](../../api/game_catalog.rb)
- [Shared segments](../Segments.jsx)
- [Finance](../../f/) and its wallets/transactions/cascades pages
- [Analytics specifications](../../a/REPORTS.md)
- [CMS CRM adapter](../../../cms/core/crm.py)

Release acceptance requires passing all applicable AT cases on at least two
casinos with deliberately different data, clone/migration dry-run reports,
verified restoration from backup, and review of authenticated server-side
ownership enforcement. Placeholder sections MUST not continue displaying
unqualified global business figures; they must be scoped or explicitly
unavailable.
