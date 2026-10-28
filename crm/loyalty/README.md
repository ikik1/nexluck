# Loyalty

Open `/crm/loyalty/` from the Loyalty tile on CRM Home or conversational
navigation. The legacy Loyalty section link redirects here and retains casino
context. Settings, customers, segment choices and bonuses belong to the selected
casino.

## Points and qualification

`loyalty_points` is a saved, nonnegative integer customer attribute (maximum
9,007,199,254,740,991). Existing profiles receive zero only when the attribute is
absent; saved values and profile timestamps are preserved. Edit LP in the
Loyalty points block on `/crm/c/i/?id=CU-...`. The same attribute is used by
segment rules, replacing the former synthetic 100-points-per-bet calculation.

Tiers are sorted by unique LP threshold. A customer qualifies for the highest
tier whose threshold is met **and every selected segment matches**. An empty
segment list allows everyone. Unknown segment facts never qualify a customer.
The existing customer segment evaluator is shared, including money/currency
and nested rule behavior. Tier membership is computed for display; no tier
history, point accrual or reward issuance is implied.

The profile displays the current tier and progress from its LP threshold toward
the next configured tier. Before the first tier, progress starts at zero.
Additional segment requirements are listed separately, even at 100% LP
progress. With no tiers the customer is Unranked; the highest tier has no next
target. Removing tiers never removes points.

## Configuration and statistics

Initial tiers: Bronze (1,000 LP), Silver (5,000 LP), Gold (10,000 LP). Operators
can add, edit or remove every tier, including the last one.

Each tier stores:

- Fixed formula source: total bet amount in EUR.
- Game weight, default 1, and point rate, default **1 LP per 10 EUR**:
  `LP = Total bet amount (EUR) x Game weight x (1 / EUR per LP)`.
- Required LP and selected segment IDs (ALL).
- Selected reward bonus IDs, cashback (default 15%) and rakeback (default 10%).

Formula and rewards are configuration only. No live bet feed, foreign-exchange
conversion, automatic credit, bonus grant, cashback or rakeback payout is
implemented. Points are edited manually.

The top statistics count distinct customers with at least one recorded `Bet`
in the period, across real and bonus wallets and currencies. Last 24 hours,
7/30/365 rolling days and custom inclusive UTC dates are available. Future bets
are excluded; deposits, logins and other events do not count as bets. Counts
use **current** LP and segment membership, not historical tier membership.
Unranked customers are counted separately. The ledger remains demo data.

## API and persistence

- `GET /crm/ui-api/v1/loyalty`: ordered tiers and compact available bonus choices.
- `POST /crm/ui-api/v1/loyalty/tiers`: create.
- `PATCH /crm/ui-api/v1/loyalty/tiers/{id}`: edit.
- `DELETE /crm/ui-api/v1/loyalty/tiers/{id}`: remove.
- `PATCH /crm/ui-api/v1/customers/{id}` with `loyalty_points`: edit LP.

The secured `/crm/api/v1/` equivalents require `loyalty:read` /
`loyalty:write`; customer LP writes require `customers:write`. Operational
casino permissions, server-owned IDs, snapshot locking, audit and atomic
persistence apply. Names and LP thresholds are unique within a casino;
segment/bonus references must be local and bonuses must not be deleted.
New casinos receive their own independent defaults; cloning configuration
does not copy customer LP or Loyalty settings.

Validation:

```sh
python3 crm/api/test/loyalty_test.py
node crm/api/test/loyalty_data_test.js
python3 crm/api/test/loyalty_browser_test.py
```
