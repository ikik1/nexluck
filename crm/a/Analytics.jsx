const analyticsMoney = value => value === null ? 'N/A' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
const analyticsNumber = value => value === null ? 'N/A' : value.toLocaleString(NexLuckI18n.formatLocale, { maximumFractionDigits: 1 });
const analyticsPercent = value => value === null ? 'N/A' : (value * 100).toFixed(1) + '%';
const ANALYTICS_REPORTS = [
  ['financial', NexLuckI18n.t("Financial performance"), [
    ['revenue', NexLuckI18n.t("Revenue bridge"), 'GGR = settled stakes minus wins. Demo NGR deducts bonus cost, gaming tax, PSP fees, provider fees and chargeback principal. Not EBITDA or a regulatory return.'],
    ['trend', NexLuckI18n.t("Daily revenue trend"), 'UTC settlement date. Hover or focus each bar for GGR, NGR and cash flow. Negative revenue is retained.'],
    ['cash', NexLuckI18n.t("Cash movement"), 'Successful deposits minus paid withdrawals is cash flow, not gaming revenue.'],
    ['payments', NexLuckI18n.t("Payment performance"), 'Successful deposit attempts / all deposit attempts. Chargeback count / successful deposits is an operational ratio, not a card-network compliance rate.'],
    ['bonuses', NexLuckI18n.t("Promotion efficiency"), 'Consumed bonus cost, claims and suspected abusive claims. Flags require review and do not establish fraud.'],
    ['concentration', NexLuckI18n.t("Player revenue concentration"), 'Top 10 players by selected-period NGR. Share uses all-player NGR; N/A when that denominator is nonpositive.']
  ]],
  ['acquisition', NexLuckI18n.t("Player acquisition & retention"), [
    ['pipeline', NexLuckI18n.t("Acquisition pipeline"), 'Cumulative milestones among leads created during the selected date range. Not the current-status distribution. Conversion uses each previous milestone as denominator.'],
    ['lifecycle', NexLuckI18n.t("Retention lifecycle"), 'Exclusive customer statuses at the end of the selected period, using the Customer edit funnel vocabulary. Dormant is a branch, not a stage after VIP.'],
    ['channels', NexLuckI18n.t("Acquisition economics"), 'Attributed acquisition spend / first depositors in period = demo CAC. NGR / active wagering players = NGR ARPU. Not lifetime value or profit.'],
    ['retention', NexLuckI18n.t("Registration cohort retention"), 'Exact-day real-money wagering on D1, D7 and D30 after registration. Only fully observed players in the selected registration cohort enter each denominator.'],
    ['value', NexLuckI18n.t("Observed player value"), 'Selected-period NGR per active player and NGR per newly acquired first depositor. The latter includes all scoped NGR; it is not cohort LTV or ROAS.']
  ]],
  ['risk', NexLuckI18n.t("Risk / Fraud reports"), [
    ['exposure', NexLuckI18n.t("Risk exposure"), 'Snapshot flags and selected-period chargeback principal. Suspicions are not confirmed fraud loss.'],
    ['verification', NexLuckI18n.t("KYC & AML workload"), 'End-date profile snapshot counts, not historical case throughput or a regulatory filing.'],
    ['protection', NexLuckI18n.t("Player protection"), 'Synthetic self-exclusions and intervention markers. Excluded players never have wagering facts. No targeting or reactivation of excluded players.']
  ]],
  ['product', NexLuckI18n.t("Product overall performance"), [
    ['products', NexLuckI18n.t("Game & provider performance"), 'Real-money turnover, GGR, observed RTP and unique active players. Observed RTP uses aggregate wins / stakes; theoretical RTP is not an observed payout guarantee.'],
    ['engagement', NexLuckI18n.t("Engagement & content mix"), 'Sessions, rounds, average stake per round and NGR by the chosen dimension. Session counts are demo daily aggregates.']
  ]]
];

function AnalyticsTable({ columns, rows, caption }) {
  return <div className="analytics-table"><table><caption>{NexLuckI18n.t(caption)}</caption><thead><tr>{columns.map(([key, label]) => <th key={key}>{NexLuckI18n.t(label)}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={row.id || row.name || i}>{columns.map(([key, , format]) => <td key={key}>{format ? format(row[key]) : row[key]}</td>)}</tr>)}</tbody></table>
    {!rows.length && <p className="analytics-empty">{NexLuckI18n.t("No matching data.")}</p>}</div>;
}

function AnalyticsTrend({ value, previous, percentage = false, lowerBetter = false }) {
  const change = analyticsChange(value, previous, percentage);
  const tone = change === null || change === 0 ? 'neutral' : (change > 0) !== lowerBetter ? 'good' : 'bad';
  return <span className={'analytics-trend ' + tone} title="Immediately preceding equal-length period; pp = percentage points">
    {change === null ? NexLuckI18n.t("Trend N/A") : (change > 0 ? '↑ +' : change < 0 ? '↓ ' : '→ ') + change.toFixed(1) + (percentage ? NexLuckI18n.t(" pp") : '%')}
  </span>;
}

function AnalyticsSignal({ id, value, previous }) {
  const rule = ANALYTICS_SIGNALS[id], tone = analyticsHealth(value, rule);
  const label = { good: 'On target', warn: 'Watch', bad: 'Off target', neutral: 'No data' }[tone];
  const format = rule.percentage ? analyticsPercent : rule.money ? analyticsMoney : analyticsNumber;
  const target = rule.direction === 'low' ? 'At most ' : 'At least ';
  return <div className="analytics-signal" title={NexLuckI18n.t("Demo target: ") + target + format(rule.good) + NexLuckI18n.t("; off target ") + (rule.direction === "low" ? NexLuckI18n.t("above ") : NexLuckI18n.t("below ")) + format(rule.bad)}>
    <span className={'analytics-light ' + tone} role="img" aria-label={label + NexLuckI18n.t(" (demo target)")} />
    <span>{NexLuckI18n.t(rule.label)}: <b>{format(value)}</b> <small>{NexLuckI18n.t(label)}</small></span>
    <AnalyticsTrend value={value} previous={previous} percentage={rule.percentage} lowerBetter={rule.direction === 'low'} />
  </div>;
}

function AnalyticsPipeline({ items, label, snapshot = false }) {
  const maximum = Math.max(1, ...items.map(i => i.count));
  return <ol className={'analytics-pipeline' + (snapshot ? ' lifecycle' : '')} aria-label={NexLuckI18n.t(label)}>{items.map((item, index) =>
    <li key={item.name} className={'stage-' + item.name.toLowerCase()}>
      <span className="pipeline-stage">{item.name}</span><strong>{item.count}</strong>
      <div className="pipeline-track"><span style={{ width: (item.count / maximum * 100) + '%' }} /></div>
      <small>{snapshot ? 'Current status' : index === 0 ? 'Cohort entry' : analyticsPercent(analyticsRatio(item.count, items[index - 1].count)) + NexLuckI18n.t(" from ") + items[index - 1].name}</small>
      {!snapshot && <small className="pipeline-share">{analyticsPercent(analyticsRatio(item.count, items[0].count))}{NexLuckI18n.t(" of leads")}</small>}
      {!snapshot && index < items.length - 1 && <svg className="pipeline-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10h15m-5-5 5 5-5 5" /></svg>}
    </li>)}</ol>;
}

function AnalyticsRetentionChart({ scope }) {
  const points = analyticsRetentionGrowth(scope);
  const path = points.map((p, i) => (i ? 'L' : 'M') + (40 + i / Math.max(1, points.length - 1) * 600) + ' ' + (170 - (p.rate || 0) * 140)).join(' ');
  return <section className="retention-growth" aria-label={NexLuckI18n.t("Retention growth chart")}><h4>{NexLuckI18n.t("Retention growth during selected period")}</h4>
    <p>{NexLuckI18n.t("Cumulative players with activity on at least two distinct days, divided by the fixed registration cohort. Not exact-day D7/D30 retention.")}{scope.completeThrough < scope.asOf && NexLuckI18n.t(" Today is partial.")}</p>
    {!points[0]?.cohort ? <p className="analytics-empty">{NexLuckI18n.t("No registrations in this scope.")}</p> : <>
      <svg viewBox="0 0 680 210" role="img" aria-label={NexLuckI18n.t("Cumulative repeat-player rate from 0 to 100 percent")}>
        <text x="0" y="35">100%</text><text x="12" y="175">0%</text>
        <path d="M40 30v140h600" className="retention-axis" /><path d={path} className="retention-line" />
        {points.map((p, i) => <circle key={p.date} tabIndex={0} cx={40 + i / Math.max(1, points.length - 1) * 600} cy={170 - p.rate * 140} r="3"
          aria-label={p.date + ': ' + p.returned + ' / ' + p.cohort + ', ' + analyticsPercent(p.rate)}>
          <title>{p.date}: {p.returned} / {p.cohort} ({analyticsPercent(p.rate)})</title></circle>)}
        <text x="40" y="200">{points[0].date}</text><text x="640" y="200" textAnchor="end">{points[points.length - 1].date}</text>
      </svg>
      <p>{points[points.length - 1].returned}{NexLuckI18n.t(" returning players / ")}{points[0].cohort}{NexLuckI18n.t(" registrations · ")}{analyticsPercent(points[points.length - 1].rate)}</p>
      <details className="retention-daily"><summary>{NexLuckI18n.t("Daily retention growth data")}</summary><AnalyticsTable caption={NexLuckI18n.t("Fixed registration cohort; cumulative second active day")} columns={[['date', 'Date'], ['returned', 'Returning'], ['cohort', 'Cohort'], ['rate', 'Rate', analyticsPercent]]} rows={points} /></details>
    </>}
  </section>;
}

function AnalyticsAskDialog({ data, filters, onApply, onClose }) {
  const [request, setRequest] = React.useState('');
  const [messages, setMessages] = React.useState([]);
  const chat = React.useRef(null);
  React.useEffect(() => {
    if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
  }, [messages]);
  const examples = ['Show me GGR for a customer segment VIP for today', "What are my customers with highest GGR", 'Show me results for the recent affiliate campaign'];
  const submit = text => {
    const result = analyticsAsk(data, filters, text);
    setMessages(old => [...old, { request: text, result }]); setRequest('');
  };
  return <SegmentDialog title={NexLuckI18n.t("Ask AI")} wide onClose={onClose}>
    <p className="analytics-ai-notice">{NexLuckI18n.t("Local demo request interpreter — no external AI or live customer data. Supports GGR, top-GGR players and affiliate campaign results. Unmentioned filters keep the dashboard scope.")}</p>
    <div className="analytics-ai-examples">{examples.map(text => <button type="button" className="btn" key={text} onClick={() => submit(text)}>{NexLuckI18n.t(text)}</button>)}</div>
    <div className="analytics-chat" ref={chat} role="log" aria-label={NexLuckI18n.t("Analytics conversation")} aria-live="polite">{messages.map(({ request: text, result }, i) => <div className="analytics-chat-turn" key={i}>
      <p className="analytics-chat-request">{examples.includes(text) ? NexLuckI18n.t(text) : text}</p>
      {result.error ? <p className="analytics-error" role="alert">{result.error}</p> : <>
        <h3>{result.title}</h3><p>{result.context}</p>
        <details><summary>{NexLuckI18n.t("All applied filters")}</summary><ul>{ANALYTICS_DIMENSIONS.filter(([key]) => key !== 'segment' && result.filters[key]).map(([key, label]) => <li key={key}>{NexLuckI18n.t(label)}: {result.filters[key]}</li>)}</ul></details>
        <p>{NexLuckI18n.t("GGR: ")}<strong>{analyticsMoney(result.totals.ggr)}</strong>{NexLuckI18n.t(" · NGR: ")}{analyticsMoney(result.totals.ngr)}{NexLuckI18n.t(" · Active players: ")}{result.totals.active}{NexLuckI18n.t(" · New FTD: ")}{result.totals.newFtd}</p>
        {!result.totals.active && <p>{NexLuckI18n.t("No wagering facts match this scope.")}</p>}
        {!!result.rows.length && <AnalyticsTable caption={NexLuckI18n.t("Synthetic players ranked by selected-period GGR")} columns={[['name', 'Player'], ['ggr', 'GGR', analyticsMoney], ['ngr', 'NGR', analyticsMoney]]} rows={result.rows} />}
        <button type="button" className="btn" onClick={() => onApply(result.filters)}>{NexLuckI18n.t("Apply this scope to dashboard")}</button>
      </>}
    </div>)}</div>
    <form className="analytics-ai-form" onSubmit={e => { e.preventDefault(); submit(request); }}>
      <label className="field">{NexLuckI18n.t("Your request")}<input required maxLength={500} value={request} onChange={e => setRequest(e.target.value)} placeholder={NexLuckI18n.t("Ask about GGR, customers or campaigns...")} /></label>
      <button className="btn pri" disabled={!request.trim()}>{NexLuckI18n.t("Ask")}</button>
    </form>
  </SegmentDialog>;
}

function AnalyticsPage() {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [filters, setFilters] = React.useState({});
  const [groupBy, setGroupBy] = React.useState('site');
  const [filtersOpen, setFiltersOpen] = React.useState(true);
  const [segmentsOpen, setSegmentsOpen] = React.useState(false);
  const [askOpen, setAskOpen] = React.useState(false);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const paths = ['games', "games/categories", 'games/publishers', 'segments/parameters', 'segments'];
      const responses = await Promise.all(paths.map(async path => {
        const response = await CRMContext.fetch('/crm/ui-api/v1/' + path);
        if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error(NexLuckI18n.t("CRM API unavailable. Start or update the CRM API server."));
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || NexLuckI18n.t("Analytics catalog request failed (HTTP ") + response.status + ').');
        if (!Array.isArray(body.items)) throw new Error(NexLuckI18n.t("Invalid analytics catalog response."));
        return body.items;
      }));
      const [games, categories, publishers, parameters, segments] = responses;
      const statuses = parameters.find(p => p.key === 'funnel_status')?.options;
      if (!games.length || !categories.every(c => Array.isArray(c.game_ids)) ||
          !Array.isArray(statuses) || ['Lead', "Registered", 'FTD', 'Trusted', 'VIP', 'Dormant'].some(s => !statuses.includes(s))) {
        throw new Error(NexLuckI18n.t("Analytics requires the current game catalog and Customer funnel parameter catalog."));
      }
      const demo = createAnalyticsDemo(games, categories, publishers, statuses);
      demo.segmentDefinitions = segments; demo.parameters = parameters;
      setData(demo);
      setFilters({ from: analyticsDate(Date.parse(demo.end) - 29 * ANALYTICS_DAY), to: demo.end });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  React.useEffect(() => { load(); }, []);
  if (loading) return <p role="status">{NexLuckI18n.t("Loading analytics catalogs...")}</p>;
  if (error) return <div role="alert" className="analytics-error">{error} <button className="btn" onClick={load}>{NexLuckI18n.t("Retry analytics")}</button></div>;
  if (!data) return null;
  const invalid = !filters.from || !filters.to || filters.from > filters.to || filters.from < data.start || filters.to > data.end;
  const scope = invalid ? null : analyticsScope(data, filters);
  const totals = scope && analyticsSummary(scope);
  const groups = scope && analyticsGroups(scope, groupBy);
  const comparison = invalid ? null : analyticsPrevious(data, filters);
  const previousTotals = comparison && analyticsSummary(comparison.scope);
  const reportValues = scope && analyticsReportValues(scope);
  const previousValues = comparison && analyticsReportValues(comparison.scope);
  const selectedSummary = [
    (filters.from || NexLuckI18n.t('Missing start')) + ' — ' + (filters.to || NexLuckI18n.t('Missing end')),
    ...ANALYTICS_DIMENSIONS.filter(([key]) => key === 'segment' ? filters.segment?.length : filters[key]).map(([key, label]) => NexLuckI18n.t(label) + ': ' +
      (key === 'segment' ? data.segmentDefinitions.filter(s => filters.segment.includes(s.id)).map(s => s.name).join(', ') : filters[key])),
    NexLuckI18n.t('Group: ') + NexLuckI18n.t(ANALYTICS_DIMENSIONS.find(([key]) => key === groupBy)[1])
  ].join(' · ');
  const options = key => key === 'status' ? data.statuses : [...new Set(data.players.map(p => p[key]))].sort();
  const update = (key, value) => setFilters(old => ({ ...old, [key]: value }));
  const metric = (label, value) => <div className="analytics-metric"><span>{NexLuckI18n.t(label)}</span><strong>{NexLuckI18n.t(value)}</strong></div>;
  const groupColumns = [['name', ANALYTICS_DIMENSIONS.find(([key]) => key === groupBy)[1]], ['active', NexLuckI18n.t("Active players"), analyticsNumber], ['ggr', 'GGR', analyticsMoney], ['ngr', 'NGR', analyticsMoney]];
  const content = id => {
    switch (id) {
      case 'revenue': return <div className="revenue-bridge">{[['ggr', 'GGR'], ['bonus', NexLuckI18n.t("Bonus cost")], ['tax', NexLuckI18n.t("Gaming tax")], ['fees', NexLuckI18n.t("PSP fees")], ['providerFee', NexLuckI18n.t("Provider fees")], ['chargebackLoss', NexLuckI18n.t("Chargeback principal")], ['ngr', 'NGR']].map(([key, label]) =>
        <div key={key} className={key === 'ngr' ? 'bridge-total' : ''}><span>{NexLuckI18n.t(label)}</span><strong>{analyticsMoney(totals[key])}</strong></div>)}</div>;
      case 'trend': {
        const days = [];
        for (let ms = scope.from; ms <= scope.asOf; ms += ANALYTICS_DAY) {
          const day = scope.rows.filter(r => r.ms === ms);
          days.push({ date: analyticsDate(ms), ggr: analyticsSum(day, 'ggr'), ngr: analyticsSum(day, 'ngr'), cash: analyticsSum(day, 'deposits') - analyticsSum(day, 'withdrawals') });
        }
        const max = Math.max(1, ...days.map(d => Math.abs(d.ngr)));
        return <div className="analytics-chart" role="img" aria-label={NexLuckI18n.t("Daily NGR bars; negative values shown in red")}>{days.map(d =>
          <div key={d.date} tabIndex={0} className={'analytics-bar ' + (d.ngr < 0 ? 'negative' : '')}
            style={{ height: Math.max(2, Math.abs(d.ngr) / max * 100) + '%' }}
            title={d.date + NexLuckI18n.t(" | GGR ") + analyticsMoney(d.ggr) + NexLuckI18n.t(" | NGR ") + analyticsMoney(d.ngr) + NexLuckI18n.t(" | Net cash ") + analyticsMoney(d.cash)}
            aria-label={d.date + NexLuckI18n.t(": NGR ") + analyticsMoney(d.ngr)} />)}</div>;
      }
      case 'cash': return <div className="analytics-metrics">{metric(NexLuckI18n.t("Deposits"), analyticsMoney(totals.deposits))}{metric(NexLuckI18n.t("Withdrawals"), analyticsMoney(totals.withdrawals))}{metric(NexLuckI18n.t("Net cash flow"), analyticsMoney(totals.netCash))}{metric(NexLuckI18n.t("Gaming hold"), analyticsPercent(totals.hold))}</div>;
      case 'payments': return <AnalyticsTable caption={NexLuckI18n.t("Deposit processing by payment method")} columns={[['name', 'Method'], ['attempts', 'Attempts', analyticsNumber], ['paymentSuccess', 'Approval', analyticsPercent], ['chargebacks', 'Chargebacks', analyticsNumber], ['cbRate', 'CB / approved', analyticsPercent]]}
        rows={analyticsGroups(scope, 'payment').map(g => ({ ...g, cbRate: analyticsRatio(g.chargebacks, g.approved) }))} />;
      case 'bonuses': return <div className="analytics-metrics">{metric(NexLuckI18n.t("Consumed bonus cost"), analyticsMoney(totals.bonus))}{metric(NexLuckI18n.t("Bonus / GGR"), analyticsPercent(totals.ggr > 0 ? totals.bonus / totals.ggr : null))}{metric(NexLuckI18n.t("Bonus claims"), analyticsNumber(totals.claims))}{metric(NexLuckI18n.t("Suspected abusive claims"), analyticsPercent(analyticsRatio(totals.abusiveClaims, totals.claims)))}</div>;
      case 'concentration': {
        const playerGroups = analyticsGroups(scope, 'id').filter(g => g.active).sort((a, b) => b.ngr - a.ngr);
        const top = playerGroups.slice(0, 10);
        return <>{metric(NexLuckI18n.t("Top 10 share of NGR"), analyticsPercent(totals.ngr > 0 ? analyticsSum(top, 'ngr') / totals.ngr : null))}
          <AnalyticsTable caption={NexLuckI18n.t("Top scoped players (synthetic IDs)")} columns={[['name', 'Player'], ['ngr', 'NGR', analyticsMoney], ['ggr', 'GGR', analyticsMoney]]} rows={top} /></>;
      }
      case 'pipeline': {
        const cohort = scope.players.filter(p => p.lead >= scope.from);
        return <><p className="analytics-period-caption">{NexLuckI18n.t("Leads acquired ")}{filters.from} — {filters.to}{NexLuckI18n.t("; milestones reached by ")}{filters.to}.</p><AnalyticsPipeline label={NexLuckI18n.t("Cumulative acquisition milestones")} items={['lead', 'registered', 'ftd', 'trusted', 'vip'].map((key, i) => ({
          name: ['Lead', 'Registered', 'FTD', 'Trusted', 'VIP'][i], count: cohort.filter(p => p[key] !== null && p[key] <= scope.asOf).length
        }))} /></>;
      }
      case 'lifecycle': return <AnalyticsPipeline snapshot label={NexLuckI18n.t("End-date lifecycle status")} items={data.statuses.map(name => ({
        name, count: scope.players.filter(p => p.statusAt(scope.asOf) === name).length
      }))} />;
      case 'channels': return <AnalyticsTable caption={NexLuckI18n.t("Attributed channel economics")} columns={[['name', 'Channel'], ['newFtd', 'New FTDs', analyticsNumber], ['spend', 'Spend', analyticsMoney], ['cac', 'CAC / FTD', analyticsMoney], ['arpu', 'NGR ARPU', analyticsMoney]]} rows={analyticsGroups(scope, 'channel')} />;
      case 'retention': return <><AnalyticsTable caption={NexLuckI18n.t("Exact-day registration cohort retention")} columns={[['name', 'Window'], ['eligible', 'Matured registrations'], ['returned', 'Returned players'], ['rate', 'Retention', analyticsPercent]]} rows={[1, 7, 30].map(day => ({ name: 'D' + day, ...analyticsRetention(scope, day) }))} /><AnalyticsRetentionChart scope={scope} /></>;
      case 'value': return <div className="analytics-metrics">{metric(NexLuckI18n.t("Active wagering players"), analyticsNumber(totals.active))}{metric(NexLuckI18n.t("NGR ARPU"), analyticsMoney(totals.arpu))}{metric(NexLuckI18n.t("New first depositors"), totals.newFtd)}{metric(NexLuckI18n.t("CAC per FTD"), analyticsMoney(totals.cac))}{metric(NexLuckI18n.t("Period NGR / new FTD"), analyticsMoney(analyticsRatio(totals.ngr, totals.newFtd)))}</div>;
      case 'exposure': return <><div className="analytics-metrics">{metric(NexLuckI18n.t("Flagged profiles"), scope.players.filter(p => p.risk !== 'None').length)}{metric(NexLuckI18n.t("Chargeback principal"), analyticsMoney(totals.chargebackLoss))}</div><AnalyticsTable caption={NexLuckI18n.t("Risk flags are suspected, not adjudicated")} columns={[['name', 'Flag'], ['players', 'Profiles'], ['active', 'Active'], ['ngr', 'NGR', analyticsMoney]]} rows={analyticsGroups(scope, 'risk')} /></>;
      case 'verification': return <><AnalyticsTable caption={NexLuckI18n.t("KYC status at selected end date")} columns={[['name', 'KYC'], ['players', 'Profiles']]} rows={analyticsGroups(scope, 'kyc')} />
        <AnalyticsTable caption={NexLuckI18n.t("AML status at selected end date")} columns={[['name', 'AML'], ['players', 'Profiles']]} rows={analyticsGroups(scope, 'aml')} /></>;
      case 'protection': return <div className="analytics-metrics">{metric(NexLuckI18n.t("Self-excluded profiles"), scope.players.filter(p => p.excluded).length)}{metric(NexLuckI18n.t("Intervention markers"), scope.players.filter(p => p.intervention).length)}{metric(NexLuckI18n.t("Wagering by excluded profiles"), scope.rows.filter(r => scope.players.find(p => p.id === r.player).excluded).length)}</div>;
      case 'products': return <AnalyticsTable caption={NexLuckI18n.t("Product performance by ") + ANALYTICS_DIMENSIONS.find(([key]) => key === groupBy)[1]} columns={[...groupColumns, ['stake', 'Turnover', analyticsMoney], ['rtp', 'Observed RTP', analyticsPercent]]} rows={groups} />;
      case 'engagement': return <><div className="analytics-metrics">{metric(NexLuckI18n.t("Sessions"), analyticsNumber(totals.sessions))}{metric(NexLuckI18n.t("Rounds"), analyticsNumber(totals.rounds))}{metric(NexLuckI18n.t("Average stake / round"), analyticsMoney(analyticsRatio(totals.stake, totals.rounds)))}</div><AnalyticsTable caption={NexLuckI18n.t("Content / audience mix")} columns={groupColumns} rows={groups} /></>;
    }
  };
  const exportRows = () => {
    const fields = ['name', "players", 'active', 'ggr', 'ngr', 'stake', 'deposits', 'withdrawals', 'rounds'];
    const csv = [fields, ...groups.map(g => fields.map(key => g[key]))].map(row => row.map(v => {
      const value = String(v);
      return '"' + (/^[=+\-@\t\r]/.test(value) && typeof v === 'string' ? "'" + value : value).replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'nexluck-demo-analytics.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <div className="analytics-notice"><strong>{NexLuckI18n.t("DEMO ANALYTICS")}</strong>{NexLuckI18n.t(" Synthetic players and event history; not live customer, payment or casino data. Websites are fictional and are not mapped to CRM casinos. Owner-qualified catalogs are reporting dimensions; synthetic segment evaluation uses the catalog owner, never the header context. Imported targeting tags have no inferred synthetic membership. All money is reported in EUR using fixed demo FX (USD 0.92, GBP 1.18). UTC, through ")}{data.end}{NexLuckI18n.t(" (today is partial; generated ")}{data.generatedAt}). <a href="/crm/a/REPORTS.md">{NexLuckI18n.t("Report specifications & sources")}</a></div>
    <nav className="analytics-topics" aria-label={NexLuckI18n.t("Report topics")}>{ANALYTICS_REPORTS.map(([key, title]) => <a key={key} href={'#' + key}>{NexLuckI18n.t(title)}</a>)}</nav>
    <div className="analytics-external-tools"><span role="link" aria-disabled="true" tabIndex={0} title={NexLuckI18n.t("External BI URL is not configured")}>{NexLuckI18n.t("Go to external BI system ")}<small>{NexLuckI18n.t("(not configured)")}</small></span><button type="button" className="btn pri" onClick={() => setAskOpen(true)}>{NexLuckI18n.t("Ask AI")}</button></div>
    <section className="analytics-filters" aria-label={NexLuckI18n.t("Global report filters")}>
      <h2><button type="button" className="analytics-filter-toggle" aria-expanded={filtersOpen} aria-controls="analytics-filter-body" onClick={() => setFiltersOpen(open => !open)}>
        <span>{filtersOpen ? NexLuckI18n.t("Filter every report") : NexLuckI18n.t("Filters: ") + selectedSummary}</span><svg viewBox="0 0 16 16" aria-hidden="true" className={filtersOpen ? 'expanded' : ''}><path d="m3 6 5 5 5-5" /></svg>
      </button></h2>
      <div id="analytics-filter-body" className={'analytics-filter-slide' + (filtersOpen ? ' open' : '')} inert={filtersOpen ? undefined : ''} aria-hidden={!filtersOpen}>
      <div className="analytics-filter-inner">
      <p>{NexLuckI18n.t("Dimensions combine with AND. Filters remain available even when they produce no matching data. Profile attributes are synthetic snapshots; dates limit events and define cohort entry.")}</p>
      <div className="analytics-filter-grid">
        {[['from', NexLuckI18n.t("From")], ['to', NexLuckI18n.t("To")]].map(([key, label]) => <label key={key}>{NexLuckI18n.t(label)}<input type="date" min={data.start} max={data.end} value={filters[key]} onChange={e => update(key, e.target.value)} /></label>)}
        {ANALYTICS_DIMENSIONS.filter(([key]) => key !== 'segment').map(([key, label]) => <label key={key}>{NexLuckI18n.t(label)}<select aria-label={NexLuckI18n.t(label)} value={filters[key] || ''} onChange={e => update(key, e.target.value)}><option value="">{NexLuckI18n.t("All")}</option>{options(key).map(value => <option key={value} value={value}>{NexLuckI18n.t(value)}</option>)}</select></label>)}
        <div className="analytics-segment-filter"><span>{NexLuckI18n.t("Segments (OR)")}</span><SegmentTags segments={data.segmentDefinitions.filter(s => filters.segment?.includes(s.id))}
          onRemove={id => update('segment', filters.segment.filter(value => value !== id))} />
          <button className="btn" type="button" onClick={() => setSegmentsOpen(true)}>{NexLuckI18n.t("Segments")}</button></div>
        <label>{NexLuckI18n.t("Group tables by")}<select aria-label={NexLuckI18n.t("Group tables by")} value={groupBy} onChange={e => setGroupBy(e.target.value)}>{ANALYTICS_DIMENSIONS.map(([key, label]) => <option key={key} value={key}>{NexLuckI18n.t(label)}</option>)}</select></label>
      </div>
      <div className="analytics-filter-actions"><button className="btn" onClick={() => setFilters({ from: analyticsDate(Date.parse(data.end) - 29 * ANALYTICS_DAY), to: data.end })}>{NexLuckI18n.t("Reset filters")}</button>
        <button className="btn pri" disabled={invalid} onClick={exportRows}>{NexLuckI18n.t("Export filtered summary CSV")}</button>
        <span role="status">{scope ? scope.players.length + NexLuckI18n.t(" scoped profiles / ") + scope.rows.length + NexLuckI18n.t(" activity facts") : NexLuckI18n.t("Invalid date range")}</span></div>
      </div></div>
    </section>
    {invalid ? <p role="alert" className="analytics-error">{NexLuckI18n.t("Choose dates between ")}{data.start}{NexLuckI18n.t(" and ")}{data.end}{NexLuckI18n.t(", with From no later than To.")}</p> : <>
      {!scope.players.length && <p role="status" className="analytics-empty">{NexLuckI18n.t("No matching data. All reports below reflect the empty selection.")}</p>}
      <p className="analytics-comparison-note">{NexLuckI18n.t("Demo traffic-light targets, not industry benchmarks. Trends compare ")}{comparison ? comparison.from + ' — ' + comparison.to : filters.to === data.partialDate ? NexLuckI18n.t("N/A: selected period includes partial today") : NexLuckI18n.t("an unavailable previous period (N/A)")}{NexLuckI18n.t(". Same filters, each period's own end-date status. ")}<a href="/crm/a/REPORTS.md#targets">{NexLuckI18n.t("Rules and thresholds")}</a></p>
      <div className="analytics-kpis">{[
        ['ggr', 'GGR', analyticsMoney, 'revenue'], ['ngr', 'NGR', analyticsMoney, 'trend'],
        ['active', "Active players", analyticsNumber, 'engagement'], ['netCash', "Net cash flow", analyticsMoney, 'cash'],
        ['arpu', "NGR ARPU", analyticsMoney, 'value'], ['paymentSuccess', "Deposit approval", analyticsPercent, 'payments']
      ].map(([key, label, format, report]) => <div className={'analytics-kpi kpi-' + key} key={key}><span>{NexLuckI18n.t(label)}</span><strong>{format(totals[key])}</strong>
        <AnalyticsTrend value={scope.rows.length ? totals[key] : null} previous={previousTotals && comparison.scope.rows.length ? previousTotals[key] : null} percentage={key === 'paymentSuccess'} />
        <span className={'analytics-light ' + analyticsHealth(reportValues[report], ANALYTICS_SIGNALS[report])} role="img"
          title={NexLuckI18n.t("Health based on ") + ANALYTICS_SIGNALS[report].label}
          aria-label={ANALYTICS_SIGNALS[report].label + NexLuckI18n.t(" demo target: ") + analyticsHealth(reportValues[report], ANALYTICS_SIGNALS[report])} />
      </div>)}</div>
      {ANALYTICS_REPORTS.map(([key, title, reports]) => <section className={'analytics-topic topic-' + key} key={key} id={key}><h2>{NexLuckI18n.t(title)}</h2>
        <div className="analytics-report-grid">{reports.map(([id, name, definition]) => <article className={'analytics-report report-' + id} key={id} data-report={id}><h3>{NexLuckI18n.t(name)}<span className="analytics-help"><button type="button" aria-label={NexLuckI18n.t("About ") + NexLuckI18n.t(name)} aria-describedby={'hint-' + id}>?</button><span role="tooltip" id={'hint-' + id}>{NexLuckI18n.t(definition)}</span></span></h3>
          <AnalyticsSignal id={id} value={reportValues[id]} previous={previousValues ? previousValues[id] : null} />{content(id)}
          <details><summary>{NexLuckI18n.t("Definition & specification")}</summary><p>{NexLuckI18n.t(definition)}</p><p>{NexLuckI18n.t("All global filters apply. Zero denominators display N/A. ")}<a href={'/crm/a/REPORTS.md#' + id}>{NexLuckI18n.t("Full specification: ")}{id}</a></p></details></article>)}</div>
      </section>)}
    </>}
    {segmentsOpen && <SegmentWidget state={{ segments: data.segmentDefinitions, parameters: data.parameters, loading: false, error: '', load,
      saved: saved => setData(old => ({ ...old, segmentDefinitions: old.segmentDefinitions.some(s => s.id === saved.id) ? old.segmentDefinitions.map(s => s.id === saved.id ? saved : s) : [...old.segmentDefinitions, saved] })) }}
      selected={filters.segment || []} onToggle={id => update('segment', (filters.segment || []).includes(id) ? filters.segment.filter(s => s !== id) : [...(filters.segment || []), id])}
      onClose={() => setSegmentsOpen(false)} />}
    {askOpen && <AnalyticsAskDialog data={data} filters={filters} onApply={selected => { setFilters(selected); setAskOpen(false); }} onClose={() => setAskOpen(false)} />}
  </>;
}
CRMContext.mount(() => ReactDOM.createRoot(document.getElementById('root')).render(<AnalyticsPage />));
