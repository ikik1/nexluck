# Compliance

Open `/coml/` from the CRM Home **Compliance** tile or navigation. The page shares
the CRM header, five interface languages, casino context, save guards and customer
segmentation. There is no separate `/crm/coml/` page.
Legacy `/crm/section.html?s=compliance` links redirect to `/coml/`, preserving
the `casino_context` parameter.

## Review queues

- **Payout requests**: external ID, creation/update times, amount, currency,
  customer with segment tags, payment method, calculated risk, KYC, AML, GGR and
  review status.
- **KYC requests**: document name, demo file preview, customer and segment tags,
  risk, AML, GGR, request status and customer KYC status. **New request** selects a
  customer and document name. Context-menu creation preselects the row's customer.
- **Customers with alerts**: segment tags, customer, last-session IP/country,
  date/time/device, risk, KYC, AML, GGR and review status.

Queues use deterministic date/ID tie-breaking. All displayed
columns have filters: creation/update dates use local-calendar date pickers,
payout amounts use inclusive minimum/maximum values, and other fields use text.
The Segments button and selected tags are inside **Filter all fields** on each tab.
Selected customer segments use OR, with field filters combined using AND.
Payout/KYC queues group all New requests first, then sort each group newest first.
Pagination uses 15 rows. Counts show the number of records
whose review status is **New**, independent of the active filter.

Right-click a row, press Shift+F10, or use its Actions button. **Process ...**
changes the internal review status. **Decline** requires confirmation. **KYC
Request / New request** opens the customer-specific request form. **Chat** opens
a persisted internal staff conversation, not a customer messaging integration.
Alerts have no review-status column or status-driven row colour. Their context menu contains only **Block**,
which persists a casino-local internal customer flag, timestamp and operator.
Blocked customers are labelled and their alert rows are grey. This does not
change AML status or enforce restrictions in external login, gaming or payments.
GGR opens the existing Customer segment parameters window, using the same
segmentation calculations as the customer profile.

Payout/alert row colours follow review status: New blue, Pending amber, Approved
green and Declined red. KYC rows instead follow customer KYC status:
NOT_STARTED blue, PENDING amber, VERIFIED green and REJECTED red.

## Risk matrix and segment tags

**Risk matrix** stores unique casino-local segment IDs with integer scores from
0 to 100. Customer risk is the maximum score of all matching configured segments,
not their sum; no matches gives `0/100`. A segment's optional **Tag name** is the
friendly display label throughout CRM; absent labels fall back to its technical
name. Technical names/IDs remain the values saved in targeting configurations.

Segments with technical names starting `risk_` have score-dependent tag colours:
0–40 gold (the regular tag style), 41–60 orange, 61–100 red. Other segments retain the standard tag style
even if included in the matrix.

## Demo boundaries

In demo mode, first opening a casino's Compliance queue creates persistent,
clearly labelled fixtures: 15 payout requests, 20 KYC requests and 30 customer
alerts. Three extra demo rows in each Pending, Declined and Approved state are
added to payout and KYC queues, giving 24 payout and 29 KYC records while retaining
15/20 New counts. Existing demo stores receive these examples once; existing
records and operator decisions are not overwritten. Demonstration
customers may be added where required; this does not create financial ledger
history or execute payouts. Session IPs and the document preview are fictional.

There are no document uploads, actual identity documents, external chat delivery,
payment execution or automatic translation of customer-entered content.
Authenticated CRM mode does not seed demo compliance records.

The API is `/crm/ui-api/v1/compliance`; server-to-server endpoints use
`/crm/api/v1/compliance` and compliance scopes. Every operation requires the same
casino ownership and authorization boundary as other operational CRM records.
