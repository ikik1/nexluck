# Management analytics report specifications

## Scope and data provenance

Routes: `/a/` redirects to `/crm/a/`. The CRM Analytics tile, legacy
Analytics section URL and conversational navigation open this dashboard.

**All reported values are synthetic demo analytics, not live operator data,
industry benchmarks, financial advice, regulatory returns or audited accounts.**
The game/category/provider catalog supplies labels only. No real customer
profiles, transactions or credentials are imported. The three casino websites
use reserved `.example` domains. This implementation sends no CRM data to
Gemini or another external AI service.

The deterministic browser model creates 480 synthetic player profiles over
150 UTC calendar days, including **partial today**. Current-day facts are
sampled by generation time's UTC day fraction; the notice records the generated
timestamp. Reload to refresh the current-day snapshot. Each player has an attributed website,
country, original currency, channel, campaign, device, payment method,
game, primary static category, provider, KYC/AML state and suspected risk flag.
Each game is associated with its first static category solely to avoid
double-counting across many-to-many categories. Labels refresh on page load.
An empty catalog, missing funnel definitions or an unavailable API produces an
explicit error with Retry, not invented live values.

Customer funnel labels come from
`GET /crm/ui-api/v1/segments/parameters`, parameter `funnel_status`, the same
backend vocabulary validated by Customer edit: Lead, Registered, FTD, Trusted,
VIP, Dormant. The demo constructs its own historical milestone timestamps;
these are not inferred from real customer snapshots. Dormant is a lifecycle
branch and does not imply a player previously reached VIP.

### Shared filter and unit contract (applies to every report)

Global filters: From/To inclusive UTC dates, casino website, country, original
currency, acquisition channel, campaign, device, multiple saved segments, end-date funnel
status, KYC state, AML state, suspected risk flag, provider, game, primary game
category, payment method. Dimensions combine with AND; All removes a predicate.
All options remain selectable even if their combination matches no data.
Segments come from the same saved Customer segment API and shared `SegmentWidget`
used on customer/game pages. Double-click/keyboard toggles selection; selected
segments render as removable tags. Selected segments combine with OR; the rest
of the filter predicates combine with AND. The collapsed filter title lists
selected names. New/edit segment actions in that shared control persist to the
same Customer segment store.

Membership is computed with the shared three-valued `evaluateSegment` rule
evaluator against **synthetic** facts, not imported real Customer membership.
Available synthetic fields: country, original currency, end-date funnel/KYC,
registration date, account age, device, favourite attributed game/category/provider,
bonus-abuse marker and deposit count. Available monetary
facts are GGR, net cash flow, win-over-loss and average bet, restored to the
player's original currency using the documented demo FX; a wallet-currency rule
for another currency remains unknown, not a conversion-based match. Net cash
flow applies the rule's lookback. Unsupported fields such as
real balance, gender or DOB remain unknown, including under NOT; unknown is
never treated as a positive match. No membership is assigned by segment name.
Grouping by Segments uses the complete matching-name combination as a single
bucket (or No matching segments), avoiding duplicate revenue from overlapping
memberships.

Grouping supports every dimension and changes the product/engagement tables,
not the fixed breakdowns (such as payments by method or KYC by state).

The selected end date determines profile eligibility (lead already created)
and funnel snapshot. Other profile dimensions are fixed synthetic attributes,
**not historical slowly changing dimensions**. Device, payment and game filters
scope a player's single attributed demo context, not their real cross-device,
multi-payment or multi-game activity. These constraints are deliberate demo
simplifications, not production attribution rules.

Fact grain: one synthetic player/game/day aggregate of settled real-money rounds,
deposits, payouts, sessions, consumed bonuses, processing costs and chargebacks.
Only facts inside the selected inclusive date window are included.
Attribution of all costs and payments to the player's game is a demo convention.
No unsettled/cancelled wagers or bonus-wallet stakes enter GGR.
Synthetic self-excluded players have no wagering facts.

Amounts are normalized to EUR before aggregation: EUR 1, USD 0.92, GBP 1.18.
These are **fixed illustrative FX rates**, not a market feed. Currency filter
selects original currency; output remains EUR. Acquisition cost is already EUR.
Percentages derive from summed numerators/denominators, never averaged rates.
Zero denominator => N/A. Empty scoped facts => zero additive metrics, N/A ratios;
snapshot reports can still contain profiles with no activity. Negative GGR/NGR
is retained. UI rounding is presentation only; CSV retains numeric precision.
Dates outside the 150-day range, blank dates and From > To block all reports and
CSV with an explicit validation message.

### Production data contract

Use authenticated, tenant/site-authorized aggregate endpoints, not raw PII in a
public browser. Required entities:

- Player dimension keyed by `(site_id, player_id)` with effective-dated geography,
  currency, segment memberships, KYC/AML, exclusions and device attribution.
- Immutable lifecycle events with event ID, player/site IDs, event time and
  milestone; active real-money wagering facts for exact-day retention.
- Settled round ledger with unique round/transaction IDs, game/provider IDs,
  stake/win, wallet type, original currency, settlement time and reversal links.
- Payment attempts and final settlements with attempt/transaction ID, method,
  original amount, approved/failed/paid state, chargeback event and ledger links.
- Consumed promotion ledger, gaming tax ledger, PSP/provider fee ledger and
  dated FX with versioned accounting policy for GGR-to-NGR reconciliation.
- Acquisition spend and an explicit attribution model keyed by acquisition
  event/channel/campaign. Unattributable spend needs an explicit unallocated bucket.
- Risk cases with suspected/confirmed/disposition states and monetary recoveries;
  KYC/AML case history, SAR workflow and exclusion/intervention effective dates.
- Session events and game metadata with effective-dated theoretical RTP.

Production must specify deduplication, late events, reversals, settlement vs
event date, FX timing, fiscal cutoffs, jurisdictional deductions, permissions,
small-cell privacy controls, data freshness and historical corrections.
No demo count or KPI should be used for a tax return or automated player action.

### Ask AI and external BI

The **Ask AI** dialog is explicitly a local demo request interpreter. It makes
no external AI calls, sends no private data, and is not an unrestricted natural
language analyst. Supported examples:

- `Show me GGR for a customer segment VIP for today`: resolves the saved VIP
  segment by name, evaluates its rules, and returns current-day scoped GGR/NGR,
  active players and new FTD with a partial-day warning.
- `What are my customers with highest GGR`: top ten wagering demo players,
  ordered by selected-period GGR descending, then synthetic player ID for ties.
  Negative GGR is retained; this ranking differs from the NGR concentration report.
- `Show me results for the recent affiliate campaign`: restricts channel to
  Affiliate and resolves the campaign of the most recently created eligible lead
  as of To under other selected filters, ignoring the existing campaign filter;
  ties are resolved alphabetically. This is a demo recency proxy, not campaign
  launch metadata. An explicitly named campaign can also be requested.

Supported date phrases: today, yesterday, last 7 days, last 30 days, one ISO
date or an inclusive pair of ISO dates. The rolling windows include partial
today. Dates outside available history and invalid dates are rejected.
Unmentioned dashboard filters are preserved. The returned date/site/segments,
expandable applied filters and result title disclose the scope. An explicit
**Apply this scope to dashboard** action changes the filters; asking alone does
not. No wagering activity produces an explicit no-data message.
Unknown named segments/campaigns and unsupported request families produce an
explicit error; the supported keyword grammar is not general-purpose semantic
understanding. New local requests use the dashboard scope, not the previous
chat answer's scope.

**Go to external BI system** is above the filters. No BI URL was provided, so
the link is explicitly disabled and labeled “not configured”, without an href,
invented destination, or successful-looking navigation.

## Reports

Every report below inherits the shared filter/unit contract. Refresh is on
page load/catalog reload; filter recomputation is immediate in-browser.
Risk and lifecycle snapshots are as of To under the demo limitations above.

<a id="targets"></a>
### Demo traffic lights, trends and presentation

These targets are **illustrative product settings**, not industry benchmarks,
regulatory thresholds or recommended business targets. Each report shows one
named headline health metric beside a green/amber/red dot and explicit text
(On target / Watch / Off target). Gray means no valid denominator/data.
Thresholds do not change financial values or hide adverse results.
The full definitions remain available via each title's keyboard/touch-focusable
`?` hint and the expandable specification.

| Report | Headline health metric | Green | Amber | Red |
|---|---|---|---|---|
| Revenue bridge | NGR / settled stakes | >= 2% | >= 0%, < 2% | < 0% |
| Daily revenue trend | Period NGR (EUR) | >= 0 | — | < 0 |
| Cash movement | Net cash flow (EUR) | >= 0 | — | < 0 |
| Payment performance | Deposit approval rate | >= 95% | >= 90%, < 95% | < 90% |
| Promotion efficiency | Suspected abusive claim rate | <= 5% | > 5%, <= 15% | > 15% |
| Player revenue concentration | Top 10 NGR / total NGR | <= 30% | > 30%, <= 50% | > 50% |
| Acquisition pipeline | Cohort FTD / cohort leads | >= 20% | >= 10%, < 20% | < 10% |
| Retention lifecycle | Dormant / scoped profiles | <= 15% | > 15%, <= 30% | > 30% |
| Acquisition economics | EUR CAC / FTD | <= 50 | > 50, <= 80 | > 80 |
| Registration cohort retention | Exact-day D7 rate | >= 25% | >= 10%, < 25% | < 10% |
| Observed player value | EUR NGR ARPU | >= 0 | — | < 0 |
| Risk exposure | Suspected flagged / scoped profiles | <= 10% | > 10%, <= 30% | > 30% |
| KYC & AML workload | Pending KYC / scoped profiles | <= 10% | > 10%, <= 25% | > 25% |
| Player protection | Excluded wagering fact count | 0 | — | > 0 |
| Game & provider performance | GGR / stakes (hold) | >= 3% | >= 0%, < 3% | < 0% |
| Engagement & content mix | Sessions / active wagering player | >= 3 | >= 1, < 3 | < 1 |

KPI blocks have distinct identity colors (not health colors). Their dots use
the named related report metric: GGR -> NGR margin; NGR -> period NGR;
Active players -> sessions/active; Net cash -> net cash;
NGR ARPU -> NGR ARPU; Deposit approval -> approval. Each dot's tooltip and
accessible label identify its basis, so a purple KPI is not a warning.

Each report headline and KPI also displays its trend against the **immediately
preceding inclusive UTC period of equal length**. Example: Oct 1–Oct 10 compares
Sep 21–Sep 30. All dimension filters are reused; each period computes its own
end-date funnel state and eligible cohort. This is a comparison of independently
scoped period populations, not a fixed-player panel. No partial baseline is
compared: if the prior period begins before available history, show Trend N/A.
Null denominators/data on either side also produce N/A.

- Monetary/count/session ratios: `(current - previous) / abs(previous) * 100`.
  Previous zero with nonzero current => N/A; zero vs zero => 0%.
  Negative baselines preserve direction and are not divided by a negative sign.
- Rates/shares: `(current - previous) * 100` **percentage points (pp)**,
  not relative percent change.
- Trend arrow gives numeric direction. Green indicates movement in the target's
  direction, red the opposite, neutral a tie/unavailable comparison; a green
  trend does not mean the current value meets the target.
- For low-is-better report measures (abuse, concentration, dormant share, CAC,
  flagged share, pending KYC and excluded wagering), decreases are favorable.
  KPI trends treat increases as favorable for the six displayed KPI measures.
- Risk, concentration and workload targets/trends are demo triage cues only;
  improved detection can increase flags without worsening actual fraud.

No comparison is shown when the selected window includes partial today:
comparing partial-day volume with a full day would create misleading trends.
Exact-day retention denominators only include registrations whose target day
is fully observed, so today is excluded from D1/D7/D30 maturity.

The filter panel slides open/closed in 240ms (no animation with reduced-motion
preferences). Collapsed title retains dates, selected dimension names/values
and grouping. Its hidden controls are inert, and reopening preserves selection.
Acquisition stages have distinct colors, explicit counts, previous-stage
conversion, share of cohort leads and arrow icons. Counts always come from
the selected cohort; example marketing counts are never hardcoded.
Observed player-value labels and values share a row.
Synthetic registrations are distributed across the full 150-day history so
the default 30-day window includes recent acquisition and matured D1/D7 cohorts;
D30 remains N/A when that date window contains no fully matured registrations.

<a id="revenue"></a>
### revenue — Revenue bridge

- **Question:** How much gaming revenue remains after defined deductions?
- **Grain/output:** Selected period; GGR and five deduction lines, final NGR.
- **Formula:** GGR = settled stakes - wins.
  NGR = GGR - consumed bonuses - gaming tax - PSP fees - provider fees -
  chargeback principal. Demo tax = 15% of positive per-fact GGR; provider fee =
  8% of positive per-fact GGR; PSP fee = 2% of successful deposit amount.
- **Inputs:** Settled rounds, bonus cost, tax/fee and chargeback ledgers in production.
- **Acceptance:** Sum of displayed bridge components reconciles to underlying NGR
  before display rounding. Not EBITDA, cash flow or standardized regulatory GGY.

<a id="trend"></a>
### trend — Daily revenue trend

- **Question:** Which settlement days drive revenue changes?
- **Grain/output:** UTC day; NGR bars, title with GGR/NGR/net cash flow.
- **Formula:** Sum each metric by fact date; include zero-activity days.
  Bar height = absolute NGR / maximum absolute daily NGR; negative bars are red.
- **Inputs:** Same financial fact ledger as revenue.
- **Acceptance:** Daily GGR/NGR sums equal period totals; negative values are not
  clamped to zero. Bars are focusable and have text accessible labels/titles.

<a id="cash"></a>
### cash — Cash movement

- **Question:** Are successful inflows covering paid outflows?
- **Grain/output:** Period deposits, paid withdrawals, net cash, gaming hold.
- **Formula:** Net cash = deposits - withdrawals; gaming hold = GGR / stakes.
- **Inputs:** Settled payments/payouts and rounds.
- **Acceptance:** No pending/failed payment amounts count as cash. Hold is a
  wagering margin, **not** deposits-minus-withdrawals/deposits.

<a id="payments"></a>
### payments — Payment performance

- **Question:** Which payment methods have approval or chargeback pressure?
- **Grain/output:** Payment method; attempts, approval rate, chargeback count,
  operational chargeback/approved-deposit count ratio.
- **Formula:** Approval = approved / attempts. CB ratio = chargebacks / approved.
- **Inputs:** Unique deposit attempts, approval settlements, chargeback events.
- **Acceptance:** Attempts >= approvals >= 0. Ratios with zero denominators are
  N/A. The period count ratio is not a card-network monitoring/cohort definition.

<a id="bonuses"></a>
### bonuses — Promotion efficiency

- **Question:** What is consumed promotion cost and suspected abuse exposure?
- **Grain/output:** Period cost, bonus/GGR, claims, suspected abusive claim rate.
- **Formula:** Bonus/GGR uses positive aggregate GGR only; abuse rate =
  flagged consumed claims / consumed claims.
- **Inputs:** Consumed bonus ledger and reviewed/flagged claim context.
- **Acceptance:** No awarded-but-unused bonus face value is counted as cost.
  GGR <= 0 => bonus/GGR N/A. A suspicion is never labeled confirmed fraud.

<a id="concentration"></a>
### concentration — Player revenue concentration

- **Question:** Is revenue concentrated in a small set of players?
- **Grain/output:** Top ten active synthetic player IDs by selected-period NGR.
- **Formula:** Sum top-ten NGR / all scoped NGR, only if all-player NGR > 0.
- **Inputs:** Player-keyed settled financial facts.
- **Acceptance:** Top ten use the same filters as the denominator. Negative
  contributions remain; top-ten share can exceed 100% when other players lose
  operator revenue. No synthetic ID links to a real Customer record.

<a id="pipeline"></a>
### pipeline — Acquisition pipeline

- **Question:** How far did the new-lead cohort progress?
- **Grain/output:** Leads created within From..To and observed through To;
  cumulative Lead -> Registered -> FTD -> Trusted -> VIP milestone counts.
- **Formula:** Stage count = eligible cohort members with milestone <= To.
  Conversion = stage count / previous stage count.
- **Inputs:** Historical timestamped lifecycle events, not current status alone.
- **Acceptance:** Counts are nonincreasing. Dormant is not an acquisition
  milestone. Recent cohorts are right-censored; this is not eventual conversion.

<a id="lifecycle"></a>
### lifecycle — Retention lifecycle

- **Question:** Where is the scoped player base at the selected end date?
- **Grain/output:** Exclusive end-date counts using Customer edit statuses.
- **Formula:** Assign latest attained lifecycle state, with Dormant branching
  from depositing/trusted activity rather than following VIP.
- **Inputs:** Profile eligibility and timestamped demo milestones.
- **Acceptance:** Counts sum to scoped profiles. Explicitly a snapshot, **not**
  a longitudinal retention rate; self-exclusion is a separate protection marker.

<a id="channels"></a>
### channels — Acquisition economics

- **Question:** What does acquisition cost by channel, versus observed revenue?
- **Grain/output:** Acquisition channel; new FTDs, attributed spend, CAC/FTD,
  NGR ARPU.
- **Formula:** New FTD = first deposit timestamp in From..To; spend = attributed
  EUR acquisition cost of those FTDs; CAC = spend / new FTD; ARPU =
  all scoped channel-period NGR / unique active wagering players.
- **Inputs:** FTD timestamps, acquisition attribution/spend, financial facts.
- **Acceptance:** FTD/spend and ARPU have explicitly different populations.
  Spend uses the same site/dimension filters; it is attributed acquisition cost,
  not independently reconciled marketing invoices.

<a id="retention"></a>
### retention — Registration cohort retention

- **Question:** Which new registrants returned to wager on day 1, 7 or 30?
- **Grain/output:** D1/D7/D30 rows; matured registrations, returned players, rate.
- **Formula:** Eligible = registered >= From and registered + N days <= To.
  Returned = eligible with >=1 settled real-money activity fact on exact day N.
- **Inputs:** Registration timestamps, complete wagering history.
- **Acceptance:** Immature players excluded individually for each N. No eligible
  players => N/A, not 0%. Not rolling N-day activity or FTD-based retention.

#### Retention growth chart (below the cohort table)

- **Question:** How many players from the selected registration cohort have
  accumulated repeat wagering activity as the selected period progresses?
- **Grain:** Daily UTC cumulative series across From..To, sharing every filter.
- **Fixed denominator:** Scoped profiles registered within From..To.
- **Numerator at day T:** Cohort members with wagering on at least two distinct
  UTC dates within the selected window through T. Multiple sessions/rounds on
  one day do not count as a return.
- **Rate:** Cumulative returning players / fixed cohort size. This is a repeat-day
  cumulative growth curve, not exact-day cohort retention or a period-over-period
  uplift percentage. The denominator includes the complete selected registration
  cohort even at earlier dates; it does not shift from day to day.
- **Output:** 0–100% line with dated points, tooltips/accessible point labels,
  start/end dates, final numerator/denominator and expandable daily data table.
- **Acceptance:** Numerator is nondecreasing, <= fixed denominator, final count
  reconciles to players with two distinct activity dates. No registrations =>
  explicit no-data state, not a fabricated flat retention rate. Partial today is
  disclosed and may add incomplete current-day activity.

<a id="value"></a>
### value — Observed player value

- **Question:** What is the period's realized per-player revenue and acquisition cost?
- **Grain/output:** Active wagering players, NGR ARPU, new FTDs, CAC, period
  NGR/new FTD.
- **Formula:** See channels. Period NGR/new FTD includes all scoped player
  NGR, not just new depositors.
- **Inputs:** Period financials, activity, FTD and attributed acquisition cost.
- **Acceptance:** Explicitly **not LTV, ROAS, payback or forecast**. No extrapolation
  from a short observation window. Do not interpret the NGR/FTD ratio as cohort value.

<a id="exposure"></a>
### exposure — Risk exposure

- **Question:** How many scoped profiles have suspected flags and how much chargeback
  principal is observed?
- **Grain/output:** Suspected risk flag; profile/active counts and NGR; total
  chargeback principal separately.
- **Formula:** Flagged = profiles whose flag != None. Loss indicator = sum
  chargeback principal, excluding hypothetical fines/fees/recoveries.
- **Inputs:** Risk-case snapshot plus chargeback ledger.
- **Acceptance:** Suspected bonus abuse, multi-accounting and payment risk
  do not assert guilt. NGR is context, not a fraud-loss estimate.

<a id="verification"></a>
### verification — KYC & AML workload

- **Question:** How many profiles are pending verification or AML review?
- **Grain/output:** Separate KYC-state and AML-state count tables.
- **Formula:** Unique scoped profiles per fixed demo state.
- **Inputs:** Effective-dated compliance state in production.
- **Acceptance:** Each table reconciles to scoped profiles; no implied
  SAR count, case-age, regulatory filing or throughput from snapshot counts.

<a id="protection"></a>
### protection — Player protection

- **Question:** What is the excluded/intervention population and are excluded
  profiles generating wagering facts?
- **Grain/output:** Exclusion markers, intervention markers, excluded wagering
  fact count in period.
- **Formula:** Distinct marked profiles; facts joined to excluded players.
- **Inputs:** Exclusions/interventions and wagering activity, with effective
  times required in production.
- **Acceptance:** Demo excluded wagering = 0. No reactivation, targeting or
  monetization controls for protected players. Counts alone do not prove compliance.

<a id="products"></a>
### products — Game & provider performance

- **Question:** Which content or audience dimensions contribute activity/revenue?
- **Grain/output:** Any selected group dimension (choose Game or Provider for
  those views); unique active players, GGR, NGR, turnover, observed RTP.
- **Formula:** Observed RTP = sum wins / sum stakes, not mean of game RTPs.
- **Inputs:** Game/provider round ledger and attributed costs.
- **Acceptance:** Group sums reconcile to scoped totals; observed RTP can
  exceed 100% and diverge from theoretical RTP over a sample.

<a id="engagement"></a>
### engagement — Engagement & content mix

- **Question:** What playing volume and audience mix accompany revenue?
- **Grain/output:** Period sessions, rounds, average stake/round and grouped
  unique active players/GGR/NGR.
- **Formula:** Avg stake = total stakes / settled rounds. Sessions/rounds =
  sums of synthetic player/day aggregates.
- **Inputs:** Deduplicated real session IDs and settled round IDs in production.
- **Acceptance:** No ratios of averages; group financials reconcile. Distinct
  players across overlapping production segments must not be summed blindly.

## Research and saturation log

Public-source synthesis, no external AI service required. Definitions were
checked directly against the URLs below. This is a bounded inventory of
management-report families, not a claim of exhaustive regulatory coverage.
No published operator revenue, fraud percentage or benchmark is used as demo data.

| Pass | Verified source | Contribution |
|---|---|---|
| 1 | [SOFTSWISS GGR](https://www.softswiss.com/glossary/ggr/) | Settled bets minus wins, volatility, revenue vs turnover |
| 2 | [SOFTSWISS NGR](https://www.softswiss.com/glossary/ngr/) | Explicit operator-defined deductions, no universal NGR definition |
| 3 | [SEON iGaming fraud prevention](https://seon.io/resources/igaming-fraud-prevention/) | Multi-accounting, bonus abuse, affiliate fraud, risk/identity/AML context; no unverified loss benchmarks reused |
| 4 | [UKGC regulatory returns changes](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/regulatory-returns-changes-effective-from-1-july-2024) | Reporting cadence, jurisdiction-specific regulatory reporting distinct from this demo |
| 5 | [SOFTSWISS retention](https://www.softswiss.com/glossary/retention/) | Time-window repeat activity; D1/D7/D30 cohort family |
| 6 | [SOFTSWISS ARPU](https://www.softswiss.com/glossary/arpu/) | Confirms revenue/active-player definition already covered by revenue and player-value inventory; no new report family |
| 7 | [SOFTSWISS CAC](https://www.softswiss.com/glossary/cac/) | Confirms acquisition-spend/acquired-player definition already covered by acquisition economics; no new report family |

An initial broad research pass also explored operator investor reports and
platform-vendor reporting pages to identify candidate families. Only the
directly checked definitions above are relied on here. Two final successive
definition checks added no distinct family, so iteration stopped. This is
**inventory saturation within this bounded search**, not proof that no other
useful reports exist.

Not implemented as measured reports: projected LTV, EBITDA, true invoice-based
marketing ROAS/payback, liability/safeguarding balances, SAR filings, case SLA,
game uptime, affiliate fraud adjudication, jurisdictional tax returns.
These need independent real source data and policies; fabricating them from
profile snapshots would mislead management.

## Validation

Run `python3 crm/api/test/analytics_browser_test.py` for route, filter, reconciliation,
cohort maturity, funnel, CSV, empty/invalid/error recovery and responsive checks.
Run `python3 crm/api/test/navigation_browser_test.py` for the complete navigation
index. Static frontend only; no new server routes or private persistence files.
# Casino ownership and operational context

The CRM header context does not filter, regenerate or reset Analytics. Reporting
catalog requests use the read-only `/crm/ui-api/v1/reporting/*` boundary and
independently configured `CRM_REPORTING_CASINOS` permissions. Segment, game,
category and provider IDs are qualified with casino identity; duplicate names
are labeled with casino name/ID instead of merging definitions.

The existing fictional website dimension remains fictional: no historical
facts are relabeled as real casino events. Synthetic players use their selected
catalog game's owner only when evaluating that owner's rules. Imported legacy
targeting tags have no inferred synthetic membership. Rules concerning ordinary
game/category/provider names evaluate against original business names, while
report labels disambiguate their owners.

Creating/editing a segment requires explicitly selecting its operational owner
inside the segment dialog. This does not infer an owner from the header or All
websites; changes use normal owner-authorized operational APIs.
