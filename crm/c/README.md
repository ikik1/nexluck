# Customers

- `/crm/c/list/`: searchable customer list, with country, KYC and AML filters.
- `/crm/c/i/?id=CU-1001`: center customer tile and Risk indicators, Wallets,
  Gaming, Bonus activity and Loyalty points satellites.
- Profile tiles match the bonus editor's borders, padding and uppercase headings.
  Tiles stretch to aligned row edges with consistent 16px horizontal and vertical
  gaps; the tablet layout uses two columns and mobile stacks all tiles.
- The Customers tile and CRM navigation both open the customer list.
- The center profile contains all distinct customer fields and the Edit button;
  there is no duplicate Customer info satellite. Creation/update timestamps sit
  to the upper left of the customer avatar.
- Funnel status is editable and persisted: Lead, Registered, FTD, Trusted, VIP,
  Dormant. The main profile highlights the current stage; the list includes a
  funnel column and filter.
- Neutral KYC `NOT_STARTED` and AML `CLEAR` values no longer appear as tags.
  Their underlying values and edit/filter options remain available.
- Activity shows seeded last-login time, last-session duration and total game
  hours. The nine risk indicators are labelled demo review signals, with
  keyboard/touch-accessible explanation hints, not automated risk detection.

Profiles are seeded from the `CUSTOMER_OBJECTS` constant in
`crm/api/customers.rb`, containing the 12 demo Finance players. Existing saved
profiles are preserved on restart; the constant initializes a new store only. Edits use
`GET /crm/ui-api/v1/customers`, `GET /crm/ui-api/v1/customers/{id}` and
`PATCH /crm/ui-api/v1/customers/{id}`. Customer IDs and timestamps are read-only;
the server updates `updated_at` on save. `DocumentINo` and `addr12` retain the
requested field names; MFA is represented by `mfa_type`.
Older saved profiles receive missing funnel, activity and risk metadata on
startup without losing profile edits or timestamps. Activity and risk indicators
are read-only API fields.

## Dropdown styling

Project dropdowns share `/dropdowns.css`, imported by the CRM, app, landing,
deposit and wallet base stylesheets. Text starts 12px from the left; the arrow
ends 12px from the right, with a 12px gap between text and arrow. Native
multi-select/listbox controls retain their behavior. Forced-color mode keeps
the native arrow.
Custom dropdown triggers use the `dropdown-control` class for the same spacing.

## Persistence and credentials

Start the existing server with `ruby crm/api/server.rb 8080`. It now also loads
`crm/api/customers.rb`, `crm/api/segments.rb`, and `crm/api/game_catalog.rb`.
Deploy all four Ruby files together.
Restart the running Ruby process after updating API code; an older process
does not load new routes automatically. For the local server on port 8086, use
`ruby crm/api/server.rb 8086`. Swagger at `/crm/api-docs/` lists the customer
methods and offers the UI API and secured API servers for profile operations.

Profiles, credentials and segment definitions are separate server-side entities:

- `profiles.json`: customer information, no password fields.
- `credentials.json`: customer ID, password derivation parameters and digest.
- `segments.json`: segment names and validated rule trees.

Set `CRM_CUSTOMER_DATA_DIR` to a private directory **outside the web document
root**. The default is `~/.local/share/nexluck/customers`. Directory permissions
are `0700`, file permissions are `0600`, and writes use atomic replacement.
Keep this directory when restarting/upgrading the server and include it in
restricted backups. This file store supports one API process.

Passwords are never returned to the browser, included in customer records, or
accepted by profile PATCH. Set them only through
`PUT /crm/api/v1/customers/{id}/credentials` with a bearer token carrying
`customers:credentials` and a JSON object containing only `password`
(12–256 characters). There is no credential GET endpoint, and the UI API
rejects credential updates. No demo passwords are seeded.

The credential entity uses PBKDF2-HMAC-SHA512 with a random 32-byte salt,
210,000 iterations and a 64-byte digest, not an unsalted SHA-512 hash.
This is credential storage, not a new customer login or MFA implementation.

The secured API also supports `customers:read` and `customers:write`.
Like the existing bonus editor, the profile UI uses the prototype UI API.
Before use with real customer data, put that API behind authenticated operator
sessions, permissions and CSRF protection. Seeded data is fictional.

## Activity statistics

Satellites reuse the existing deterministic Finance demo ledger. Customers
map to wallets by stable customer/wallet IDs, not editable names. Profile
currency changes do not convert existing wallet transactions.
Every demo customer has real and bonus wallets in two currencies, grouped
separately for balances and turnover. The same wallets are used by Finance.

- Deposit turnover: rolling 1, 7, 30 and 365 days, ending at the current time.
- GGR: real-wallet bets minus wins.
- Wins minus losses: wins minus real-wallet stakes (player net).
- RTP: wins / bets; shown as N/A without bets.
- Favourite games, categories and providers: top three ranked by recorded
  real-wallet bet rounds across currencies (not stake amounts), with ties
  sorted by name. Categories/providers come from `DEMO_GAME_CATALOG` in
  `crm/f/data.js`; these are demo catalog assignments, not a live integration.
  Wins, bonus wagering, other customers and future transactions are excluded.
  No bets displays an empty state; missing catalog metadata is explicitly
  shown as "Unmapped category" / "Unmapped provider".
- Bonus activity: granted, wagered, cancelled amounts and event count.
- Loyalty demo: 100 points per real-wallet bet; Silver at 200, Gold at 500.

Statistics are labelled as demo activity, grouped by wallet currency, and do
not imply live analytics or completed bonus wagering requirements.

Validation: `ruby crm/api/test/customer_store_test.rb`.

## Rule-based segments

The list's Segments section opens a searchable library with New and Edit
buttons. Selected segments filter with OR and combine with existing filters
using AND. Row tags and the profile's View customer segments widget use the
same current rule evaluation. Profile widgets show matching segments only.
New/edited rules update membership immediately; tags are not manual assignments.
Bonus Availability uses `...` buttons for Include/Exclude segments to open a
shared Segments popup from the customer list, including New/Edit rule actions.
The reusable control and its API helper live in `Segments.jsx`, with scoped
styles in `segments.css`; it needs no customer-page components in selection mode.
Rows highlight on hover/focus and selected rows have an accent indicator.
Double-click a list entry to toggle it selected/unselected; selection is
indicated by the row highlight, without a separate "Selected" label.
double-click an Availability tag to remove it. Keyboard users can add with
Enter/Space and remove with Delete/Backspace. Selections are saved with the
bonus, not when closing the picker. Both lists offer saved customer segments
alongside their existing legacy options. Bonus API selections remain name
strings for compatibility; a renamed segment's previous name remains valid
on bonuses already using it, without silently replacing that selection.
Payment connection New/Edit dialogs use the same toggling Segments popup and double-click
tag removal, preserving legacy Finance segments. Apply selections with Save
connection; Cancel discards them. Payment connections retain their existing
in-memory demo storage (not server persistence).
The profile's View segment parameters button displays all current rule
parameters and values in one vertical list, preserving the catalog group headings
at every screen width. Monetary values are shown
separately for each wallet currency. Net cash flow days is adjustable in the
viewer; this only changes the displayed window, not saved segment rules.

The visual editor groups parameters by Profile, Account, Activity, Finance,
Gaming, Bonus & loyalty and Risk. Conditions use typed list pickers (searchable
checkbox lists), numeric/date inputs or boolean checkboxes. Nest AND/OR groups
and negate conditions or groups with NOT. `IS` and `=` mean equality; `!=`
means inequality; list equality means any selected value. `=<` is the displayed
less-than-or-equal operator; the API also accepts and normalizes `<=`. Limit: 100 rule/group
nodes, with at most 5 nested levels. Empty groups/lists cannot be saved.
Automatic names summarize the rule, currency and cash-flow window; manual
names are preserved until Use automatic name is chosen.

Definitions persist atomically in private `segments.json` alongside profiles,
not in browser storage. Deploy `crm/api/segments.rb` with the other API files.
Endpoints (also documented in Swagger):

- `GET /crm/ui-api/v1/segments` and `/segments/parameters`
- `GET /crm/ui-api/v1/segments/{id}`
- `POST /crm/ui-api/v1/segments` and `PATCH /segments/{id}` with `{name, rules}`

Secured `/crm/api/v1` routes require `segments:read` / `segments:write`.
This prototype evaluates membership in the browser from customer profiles
and the demo Finance ledger; these APIs persist definitions, not membership
snapshots. Missing data is unknown and never matches, even under NOT.

Money comparisons select a wallet currency; no FX conversion or summing of
different currencies takes place. Net cash flow means deposits minus
withdrawals over the chosen trailing days (default 30). Net cash flow days
is the rolling-window setting on that rule, not a standalone count metric.
Number of deposits counts all real-wallet deposits; lifetime frequency is
deposits/week since registration (minimum one day). Win over loss means wins
minus stakes, not a ratio. Average bet is real-wallet stakes / rounds.
RDW rate is deposit count / withdrawal count and is unknown without withdrawals.
Game favourites reuse the Gaming block's top-three real-wallet rankings;
the demo category also acts as game type.

Gender is an editable customer field. Devices, sessions/week and bonus
wagering completion percentage are read-only seeded demo metadata until live
calculation is available; activity and risk flags remain labelled demo data.
Age uses completed UTC calendar years; account/login age use elapsed days.
Demo loyalty remains 100 points per real-wallet bet.

Validation: `ruby crm/api/test/customer_store_test.rb` and
`python3 crm/api/test/segment_browser_test.py` (requires Playwright and Google
Chrome). Browser/API checks run against isolated temporary storage and do not
change local or live customer profiles.
