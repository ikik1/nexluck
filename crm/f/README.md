# Casino-local finance

`data.js` contains display schemas and empty runtime collections, never demo business
records or credentials. After the authenticated casino context is ready, fetch
`GET /crm/ui-api/v1/finance` with its `X-Casino-Id`, then call
`window.installFinanceData(payload)` **before any React/Babel page mounts**.
Apply this bootstrap to finance, customer activity and analytics pages using these
collections. Finance root renders use `CRMContext.mount`; saves use
`CRMContext.fetch` explicitly. On failure, show a blocking load error; do not fall
back to fixtures.

The response is a direct object with these array keys:

| API key | Browser collection |
| --- | --- |
| `connections` | `PAYMENT_CONNECTIONS` |
| `gateways` | `GATEWAYS` |
| `cascades` | `CASCADES` |
| `wallets` | `WALLETS` |
| `wallet_transactions` | `WALLET_TX` |
| `transactions` | `TRANSACTIONS` |
| `players` | `PLAYERS` |
| `game_catalog` | `DEMO_GAME_CATALOG` |

`FinanceStore` is included in the tenant store and requires `@state['finance']`
and `@casino_id`. `finance_data` returns a detached copy, deriving `game_catalog`
from the current tenant's `@state['games']['games']`, its categories and
`@state['catalogs']['providers']`. A missing/empty tenant game list produces an
empty game catalog, never a fallback to the fixture catalog. Editors mark
`payment-editor`/`cascade-editor` dirty while mounted and clear them on unmount.
`save_finance(resource, id, body)` and `delete_finance(resource, id)` return
`[record, {}]` on success or `[nil, field_errors]` on failure.
DELETE may also call `save_finance(resource, id, { '_delete' => true })`.
Supported resources are `connections` and `cascades`; IDs may be supplied as URL
strings. New connection/cascade IDs are server-generated safe numeric integers.
The outer store must atomically persist the entire tenant document on success,
and restore its prior state if persistence fails.

Map POST collection requests and PATCH item requests to `save_finance`. Browser
success responses must be the saved record or `{ "data": saved_record }`; errors
must use non-2xx responses with `{ "errors": field_errors }`. DELETE is available
to the server, though the existing finance UI has no delete controls. Connection
renames update casino-local cascade step names; referenced connections cannot be
deleted. Cascade references must resolve to this casino's connections.

Initialize the first tenant with `FinanceStore.seed`. For later tenants,
`FinanceStore.seed(include_history: false)` retains only payment configuration,
empties every history/player collection, clears **all** connection settings and
disables connections/cascades pending configuration. When cloning saved tenant
configuration instead, apply the same clearing rules. Remap config IDs as needed
and stamp `casino_id` on every tenant record before handing it to this module.
Never clone wallets, wallet transactions, transactions/logs, players or the
finance fixture game catalog. The game catalog is derived from separately
owned tenant game configuration.

`api/finance_seed.json` is a deterministic snapshot of the original synthetic
fixture, including original transaction logs. It is server-only: deny static
access to the entire API source directory (including the seed). Persist actual
tenant state in the private tenant document, not this fixture.

Connection tests do not contact live providers; the UI explicitly states that
saving configuration does not verify gateway credentials.

Payment connections have independent boolean `payin` and `payout` attributes;
both may be enabled (or disabled). The editor exposes both checkboxes, the list
shows both columns, and **Payment direction** filters by the enabled attribute.
Existing connections without these attributes retain both directions enabled
for backward compatibility. New connections default to both enabled.
The demo wallet offers only enabled, non-offline connections with Payout enabled;
its API returns safe display fields, never gateway credentials.

## Focused checks

```sh
ruby crm/api/test/finance_store_test.rb
node crm/api/test/finance_data_test.js
python3 crm/api/test/compliance_workflow_test.py
```
