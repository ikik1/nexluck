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

Right-click a row, press Shift+F10, or use its Actions button. Payout **Process ...**
shows the immutable player-selected payment connection, brand, method, masked
destination and amount. **Approve** moves only New payouts to Pending; it does not
execute or complete a payment. Direct payout status edits are rejected by the API.
In the Payout requests table, destination details appear below the payment method
without a "Payment details" prefix:
Card (first/last four digits), IBAN, bank account, phone, UPI ID, Pix key or email.
Missing details say **Not provided**; no details are inferred for player requests.
The existing Payment method filter searches both the method and masked details.
KYC requests are unchanged.

Synthetic demo examples vary by currency: EUR cards/SEPA (masked IBAN);
USD ACH/cards/bank account; GBP bank account/cards; INR Paytm/UPI/cards;
BRL Pix/bank account/cards; CAD Interac/bank account/cards; THB and NGN
bank account/cards. Other currencies use generic card examples.
Only legacy `synthetic_demo` rows still labelled `Demo bank transfer`, without
a selected connection or supplied destination, receive these examples.
The upgrade is idempotent and preserves statuses, amounts, currency and audit history.
Wallet-selected methods and supplied destinations are never overwritten.
Examples illustrate familiar currency/method combinations, not measured popularity
or actual casino/provider payout eligibility. Provider availability also depends
on country, business category, account capabilities and contractual restrictions.

Reference documentation:
[Stripe currency/method support](https://docs.stripe.com/payments/payment-methods/payment-method-support),
[Stripe payout bank details](https://docs.stripe.com/payouts),
[Pix](https://docs.stripe.com/payments/pix),
[Paytm payment methods](https://www.paytmpayments.com/payment-gateway).
KYC **Process ...** changes the request's internal review status. **Decline**
requires confirmation. **KYC
Request / New request** opens the customer-specific request form. **Chat** opens
a persisted conversation showing player messages and private staff notes.
Under a KYC row's external ID, **new chat message N** appears only for unread
player messages associated with that request. It uses smaller grey bold text
and highlights on hover/focus; clicking opens the conversation.
Opening the conversation acknowledges
only the received player-message IDs. The queue checks for updates every 15 seconds
while no dialog is open. Staff notes remain internal and are not delivered to players.
New messages remain highlighted with a New label for the current conversation
view after acknowledgement; reopening shows them as old messages. Demo queues
receive two old and ten new fictional player messages per customer's first
synthetic request once, without replacing existing conversations.
The arrow beside **Preview** lists document versions, newest first, with names and
upload timestamps; selecting a version opens its preview.
Synthetic KYC requests include three fictional uploaded-file versions dated one
day apart. Existing saved document histories and player submissions are preserved;
the demo-only upgrade does not change request statuses, audit entries or timestamps.

**Approve KYC** appears only in the context/Actions menu, not as a column button. It is disabled until
the customer has at least one request and every request is Approved. New, Pending
or Declined requests prevent approval. The API enforces the same rule, including
direct customer-profile updates. Approving a request does not automatically verify
the customer: the separate action records the approving operator and time.
Creating a request or submitting a replacement demo document returns customer KYC
to Pending. A declined request makes the customer Rejected until a replacement is
submitted and all requests are approved.
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

The wallet's **KYC & chat (demo)** panel selects a casino-local demo customer,
sends synthetic player messages and submits named demo document versions.
Document submissions always use the fictional demo image: actual identity files
are neither uploaded nor stored. No payment execution, external chat delivery
or automatic translation of customer-entered content is provided.
Authenticated CRM mode does not seed demo compliance records.

`/w/?casino_context=<casino-id>&customer=<customer-id>` selects the demo context;
without parameters the first permitted casino/customer is used. CMS wallet links
carry the casino ID. Wallet withdrawals list enabled, non-offline Finance
connections with Payout enabled and preserve the selected connection/currency/method
in the CRM request. Card input accepts only first four and last four digits:
`4102 xxxxxx 1234`; full PANs and unmasked account details are rejected.
Other methods accept masked destination text only. Simulated wallet balances
remain browser-local, not an authoritative financial ledger. A request key prevents
duplicate payout creation on retries and rejects conflicting reuse.

Demo-only player APIs are under `/crm/ui-api/v1/compliance/demo-wallet`:
GET returns safe connection/customer/request data without gateway credentials;
POST `/payouts`, `/chat`, `/documents` records simulated activity for the selected
customer query parameter. These endpoints require casino context and are disabled
outside demo mode. Customer read acknowledgements use POST
`/compliance/customers/<id>/chat/read`; explicit verification uses POST
`/compliance/customers/<id>/approve-kyc`. Payout PATCH uses
`{"action":"approve"}` or `{"action":"decline"}`.

The API is `/crm/ui-api/v1/compliance`; server-to-server endpoints use
`/crm/api/v1/compliance` and compliance scopes. Every operation requires the same
casino ownership and authorization boundary as other operational CRM records.
