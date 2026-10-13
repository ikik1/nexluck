# Customers

- `/crm/c/list/`: searchable customer list, with country, KYC and AML filters.
- `/crm/c/i/?id=CU-1001`: center customer tile and Customer info, Wallets,
  Gaming, Bonus activity and Loyalty points satellites.
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
`crm/api/customers.rb`. Deploy both Ruby files together.
Restart the running Ruby process after updating API code; an older process
does not load new routes automatically. For the local server on port 8086, use
`ruby crm/api/server.rb 8086`. Swagger at `/crm/api-docs/` lists the customer
methods and offers the UI API and secured API servers for profile operations.

Profiles and credentials are separate server-side entities:

- `profiles.json`: customer information, no password fields.
- `credentials.json`: customer ID, password derivation parameters and digest.

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
- Bonus activity: granted, wagered, cancelled amounts and event count.
- Loyalty demo: 100 points per real-wallet bet; Silver at 200, Gold at 500.

Statistics are labelled as demo activity, grouped by wallet currency, and do
not imply live analytics or completed bonus wagering requirements.

Validation: `ruby crm/api/test/customer_store_test.rb`.
