const ANALYTICS_DAY = 86400000;
const analyticsDate = ms => new Date(ms).toISOString().slice(0, 10);
const analyticsSum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const analyticsRatio = (a, b) => b ? a / b : null;
const ANALYTICS_SITES = ['NexLuck Aurora · aurora.example', 'NexLuck Coast · coast.example', 'NexLuck Crown · crown.example'];
const ANALYTICS_DIMENSIONS = [
  ['site', 'Casino website'], ['country', 'Country'], ['currency', 'Original currency'],
  ['channel', 'Acquisition channel'], ['campaign', 'Campaign'], ['device', 'Device'],
  ['segment', 'Segments'], ['status', 'Funnel status'], ['kyc', 'KYC status'], ['aml', 'AML status'],
  ['risk', 'Risk flag'], ['provider', 'Provider'], ['game', 'Game'], ['category', 'Game category'],
  ['payment', 'Payment method']
];

function createAnalyticsDemo(games, categories, publishers, statuses, today = Date.now()) {
  const end = Math.floor(today / ANALYTICS_DAY) * ANALYTICS_DAY;
  const progress = (today - end) / ANALYTICS_DAY;
  const start = end - 149 * ANALYTICS_DAY;
  const players = [], rows = [];
  const staticCategories = categories.filter(c => c.kind === 'static');
  const currencies = ['EUR', 'USD', 'GBP'];
  const fx = { EUR: 1, USD: 0.92, GBP: 1.18 };
  for (let i = 0; i < 480; i++) {
    const game = games[(i * 17) % games.length];
    const category = staticCategories.find(c => c.game_ids.includes(game.id));
    const registration = start + ((i * 13) % 150) * ANALYTICS_DAY;
    const level = Math.floor(i / 5) % statuses.length;
    const registered = level >= 1 ? registration : null;
    const ftd = level >= 2 ? registration + (1 + i % 4) * ANALYTICS_DAY : null;
    const trusted = level >= 3 ? registration + 9 * ANALYTICS_DAY : null;
    const vip = level === 4 ? registration + 20 * ANALYTICS_DAY : null;
    const dormant = level === 5 ? registration + 50 * ANALYTICS_DAY : null;
    const player = {
      id: 'DEMO-' + (i + 1), site: ANALYTICS_SITES[i % 3],
      country: ['DE', 'GB', 'CA', 'SE', 'BR'][Math.floor(i / 3) % 5],
      currency: currencies[Math.floor(i / 5) % 3],
      channel: ['Organic', 'Affiliate', 'Paid search', 'CRM'][Math.floor(i / 7) % 4],
      campaign: ['Evergreen', 'Autumn launch', 'VIP return'][Math.floor(i / 11) % 3],
      device: ['Desktop', 'Mobile', 'Tablet'][Math.floor(i / 13) % 3],
      kyc: ['VERIFIED', 'PENDING', 'NOT_STARTED', 'REJECTED'][Math.floor(i / 17) % 4],
      aml: ['CLEAR', 'REVIEW', 'BLOCKED'][Math.floor(i / 23) % 3],
      risk: ['None', 'Bonus abuse', 'Multi-accounting', 'Payment risk'][Math.floor(i / 19) % 4],
      provider: publishers.find(p => p.id === game.publisher_id).name,
      game: game.name, category: category?.name || 'Uncategorized',
      payment: ['Card', 'Bank transfer', 'E-wallet'][Math.floor(i / 29) % 3],
      theoreticalRtp: game.rtp,
      lead: registration - ANALYTICS_DAY, registered, ftd, trusted, vip, dormant,
      acquisitionCost: 20 + i % 80,
      excluded: i % 43 === 0, intervention: i % 19 === 0,
      statusAt: date => dormant !== null && dormant <= date ? 'Dormant' :
        vip !== null && vip <= date ? 'VIP' : trusted !== null && trusted <= date ? 'Trusted' :
          ftd !== null && ftd <= date ? 'FTD' : registered !== null && registered <= date ? 'Registered' : 'Lead'
    };
    players.push(player);
    if (ftd === null) continue;
    for (let day = Math.max(0, Math.round((ftd - start) / ANALYTICS_DAY)); day <= 149; day++) {
      const date = start + day * ANALYTICS_DAY;
      if (player.excluded || (dormant !== null && date >= dormant) || (day + i * 3) % 7 > 2) continue;
      if (day === 149 && (i % 24 + 0.5) / 24 > progress) continue;
      const rate = fx[player.currency];
      const stake = (80 + (i * 47 + day * 31) % 1200) * rate;
      const wins = stake * (0.88 + ((i + day) % 15) / 100);
      const ggr = stake - wins;
      const bonus = (day + i) % 5 === 0 ? 8 * rate : 0;
      const attempts = 1 + (day + i) % 3;
      const approved = attempts - ((day + i) % 7 === 0 ? 1 : 0);
      const deposits = approved * (30 + i % 120) * rate;
      const withdrawals = (day + i) % 4 === 0 ? 60 * rate : 0;
      const chargebacks = (day + i * 2) % 97 === 0 && approved ? 1 : 0;
      const tax = Math.max(ggr, 0) * 0.15;
      const fees = deposits * 0.02;
      const providerFee = Math.max(ggr, 0) * 0.08;
      const chargebackLoss = chargebacks * 30 * rate;
      rows.push({ player: player.id, date: analyticsDate(date), ms: date,
        stake, wins, ggr, bonus, tax, fees, providerFee, chargebackLoss,
        ngr: ggr - bonus - tax - fees - providerFee - chargebackLoss,
        attempts, approved, deposits, withdrawals, chargebacks, rounds: 20 + (i + day) % 80,
        sessions: 1 + i % 3, claims: bonus ? 1 : 0,
        abusiveClaims: bonus && player.risk === 'Bonus abuse' ? 1 : 0 });
    }
  }
  const rowsByPlayer = new Map(players.map(p => [p.id, []]));
  rows.forEach(row => rowsByPlayer.get(row.player).push(row));
  return { players, rows, rowsByPlayer, start: analyticsDate(start), end: analyticsDate(end), statuses,
    partialDate: analyticsDate(end), generatedAt: new Date(today).toISOString(), segmentDefinitions: [], parameters: [] };
}

function analyticsSegmentIds(data, player, asOf) {
  const history = data.rowsByPlayer.get(player.id).filter(r => r.ms <= asOf);
  const registered = player.registered !== null && player.registered <= asOf ? player.registered : null;
  const values = {
    country: player.country, currency: player.currency, funnel_status: player.statusAt(asOf),
    registration_date: registered === null ? null : analyticsDate(registered),
    account_age: registered === null ? null : Math.floor((asOf - registered) / ANALYTICS_DAY),
    kyc_status: player.kyc, devices: [player.device], favourite_game: [player.game],
    favourite_category: [player.category], favourite_provider: [player.provider],
    risk_bonus_abuse: player.risk === 'Bonus abuse',
    number_of_deposits: analyticsSum(history, 'approved')
  };
  const facts = { values, monetary: node => {
    if (!['lifetime_ggr', 'net_cash_flow', 'average_bet', 'win_over_loss'].includes(node.field)) return null;
    const rate = { EUR: 1, USD: 0.92, GBP: 1.18 }[node.currency];
    if (!rate || node.currency !== player.currency) return null;
    const rows = node.field === 'net_cash_flow' ? history.filter(r => r.ms >= asOf - node.days * ANALYTICS_DAY) : history;
    if (node.field === 'average_bet') return analyticsRatio(analyticsSum(rows, 'stake'), analyticsSum(rows, 'rounds')) === null
      ? null : analyticsSum(rows, 'stake') / analyticsSum(rows, 'rounds') / rate;
    const amount = node.field === 'net_cash_flow' ? analyticsSum(rows, 'deposits') - analyticsSum(rows, 'withdrawals') : analyticsSum(rows, 'ggr') * (node.field === 'win_over_loss' ? -1 : 1);
    return amount / rate;
  } };
  return data.segmentDefinitions.filter(s => evaluateSegment(s.rules, facts, data.parameters) === true).map(s => s.id);
}

function analyticsScope(data, filters) {
  const asOf = Date.parse(filters.to);
  const players = data.players.filter(p => p.lead <= asOf).map(p => {
    const segmentIds = analyticsSegmentIds(data, p, asOf);
    return { ...p, segmentIds, segment: data.segmentDefinitions.filter(s => segmentIds.includes(s.id)).map(s => s.name).sort().join(' + ') || 'No matching segments' };
  }).filter(p => ANALYTICS_DIMENSIONS.every(([key]) => key === 'segment'
    ? !filters.segment?.length || filters.segment.some(id => p.segmentIds.includes(id))
    : !filters[key] || (key === 'status' ? p.statusAt(asOf) : p[key]) === filters[key]));
  const ids = new Set(players.map(p => p.id));
  const rows = data.rows.filter(r => ids.has(r.player) && r.date >= filters.from && r.date <= filters.to);
  return { players, rows, asOf, from: Date.parse(filters.from),
    completeThrough: data.partialDate === filters.to ? asOf - ANALYTICS_DAY : asOf };
}

function analyticsSummary(scope) {
  const totals = Object.fromEntries(['stake', 'wins', 'ggr', 'bonus', 'tax', 'fees', 'providerFee', 'chargebackLoss', 'ngr',
    'attempts', 'approved', 'deposits', 'withdrawals', 'chargebacks', 'rounds', 'sessions', 'claims', 'abusiveClaims'].map(key => [key, analyticsSum(scope.rows, key)]));
  const active = new Set(scope.rows.map(r => r.player)).size;
  const acquired = scope.players.filter(p => p.ftd !== null && p.ftd >= scope.from && p.ftd <= scope.asOf);
  return { ...totals, active, netCash: totals.deposits - totals.withdrawals,
    hold: analyticsRatio(totals.ggr, totals.stake), rtp: analyticsRatio(totals.wins, totals.stake),
    arpu: analyticsRatio(totals.ngr, active), paymentSuccess: analyticsRatio(totals.approved, totals.attempts),
    newFtd: acquired.length, spend: analyticsSum(acquired, 'acquisitionCost'),
    cac: analyticsRatio(analyticsSum(acquired, 'acquisitionCost'), acquired.length) };
}

function analyticsGroups(scope, dimension) {
  const groups = new Map();
  scope.players.forEach(p => {
    const name = dimension === 'status' ? p.statusAt(scope.asOf) : p[dimension];
    if (!groups.has(name)) groups.set(name, { players: [], rows: [], asOf: scope.asOf, from: scope.from });
    groups.get(name).players.push(p);
  });
  const byId = new Map(scope.players.map(p => [p.id, p]));
  scope.rows.forEach(r => {
    const p = byId.get(r.player);
    groups.get(dimension === 'status' ? p.statusAt(scope.asOf) : p[dimension]).rows.push(r);
  });
  return [...groups].map(([name, group]) => ({ name, ...analyticsSummary(group), players: group.players.length })).sort((a, b) => b.ngr - a.ngr || a.name.localeCompare(b.name));
}

function analyticsRetention(scope, days) {
  const eligible = scope.players.filter(p => p.registered !== null && p.registered >= scope.from &&
    p.registered + days * ANALYTICS_DAY <= (scope.completeThrough ?? scope.asOf));
  const activity = new Set(scope.rows.map(r => r.player + ':' + r.date));
  const returned = eligible.filter(p => activity.has(p.id + ':' + analyticsDate(p.registered + days * ANALYTICS_DAY))).length;
  return { eligible: eligible.length, returned, rate: analyticsRatio(returned, eligible.length) };
}

function analyticsPrevious(data, filters) {
  if (filters.to === data.partialDate) return null;
  const length = Date.parse(filters.to) - Date.parse(filters.from) + ANALYTICS_DAY;
  const to = analyticsDate(Date.parse(filters.from) - ANALYTICS_DAY);
  const from = analyticsDate(Date.parse(filters.from) - length);
  return from < data.start ? null : { from, to, scope: analyticsScope(data, { ...filters, from, to }) };
}

function analyticsRetentionGrowth(scope) {
  const cohort = scope.players.filter(p => p.registered !== null && p.registered >= scope.from && p.registered <= scope.asOf);
  const activity = new Map(cohort.map(p => [p.id, []]));
  scope.rows.forEach(r => { if (activity.has(r.player)) activity.get(r.player).push(r.ms); });
  const secondVisit = [...activity.values()].map(dates => [...new Set(dates)].sort((a, b) => a - b)[1]).filter(ms => ms !== undefined);
  const points = [];
  for (let ms = scope.from; ms <= scope.asOf; ms += ANALYTICS_DAY) {
    const returned = secondVisit.filter(date => date <= ms).length;
    points.push({ date: analyticsDate(ms), returned, cohort: cohort.length, rate: analyticsRatio(returned, cohort.length) });
  }
  return points;
}

function analyticsAsk(data, currentFilters, request) {
  const text = request.toLowerCase().trim();
  if (!text) return { error: 'Enter a request about GGR, highest-GGR customers, or affiliate campaign results.' };
  if (text.length > 500) return { error: 'Keep requests within 500 characters.' };
  const top = /\b(highest|higherst|top|best)\b/.test(text) && /\b(customer|customers|cusomers|players?)\b/.test(text) && /\bggr\b/.test(text);
  const campaign = /\b(affiliate|campaign|compaign)\b/.test(text);
  if (!top && !campaign && !/\bggr\b/.test(text)) return { error: 'Supported locally: GGR by named segment/date, highest-GGR customers, and affiliate campaign results. No external AI is connected.' };
  const filters = { ...currentFilters, segment: [...(currentFilters.segment || [])] };
  if (/\btoday\b/.test(text)) filters.from = filters.to = data.end;
  else if (/\byesterday\b/.test(text)) filters.from = filters.to = analyticsDate(Date.parse(data.end) - ANALYTICS_DAY);
  else {
    const window = text.match(/\blast\s+(7|30)\s+days\b/);
    const dates = text.match(/\b\d{4}-\d{2}-\d{2}\b/g);
    if (window) { filters.to = data.end; filters.from = analyticsDate(Date.parse(data.end) - (Number(window[1]) - 1) * ANALYTICS_DAY); }
    else if (dates) {
      if (dates.length > 2 || dates.some(date => !Number.isFinite(Date.parse(date)) || analyticsDate(Date.parse(date)) !== date)) return { error: 'Use one valid YYYY-MM-DD date, or two dates for a range.' };
      [filters.from, filters.to] = [dates[0], dates[1] || dates[0]];
    } else if (/\b(tomorrow|week|month|year|days)\b/.test(text)) return { error: 'Supported dates: today, yesterday, last 7 days, last 30 days, or YYYY-MM-DD ranges.' };
  }
  if (!filters.from || !filters.to || filters.from < data.start || filters.to > data.end || filters.from > filters.to) return { error: 'Requested dates must be within ' + data.start + ' — ' + data.end + '.' };
  const matchedSegments = data.segmentDefinitions.filter(s => {
    const escaped = s.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9_])' + escaped + '($|[^a-z0-9_])').test(text);
  });
  if (/\bsegments?\b/.test(text) && !matchedSegments.length) return { error: 'Name a saved Customer segment, e.g. VIP, or choose segments in the dashboard filters.' };
  if (matchedSegments.length && (/\bsegments?\b/.test(text) || !campaign)) filters.segment = matchedSegments.map(s => s.id);
  let campaignName = '';
  if (campaign) {
    filters.channel = 'Affiliate';
    const named = [...new Set(data.players.map(p => p.campaign))].filter(name => text.includes(name.toLowerCase()));
    if (named.length > 1) return { error: 'Choose one campaign per request.' };
    if (named.length) filters.campaign = named[0];
    else if (/\b(recent|latest)\b/.test(text)) {
      const candidates = analyticsScope(data, { ...filters, campaign: '' }).players;
      const latest = candidates.sort((a, b) => b.lead - a.lead || a.campaign.localeCompare(b.campaign))[0];
      if (!latest) return { error: 'No affiliate campaign matches the current scope.' };
      filters.campaign = latest.campaign;
    } else if (/\b(campaign|compaign)\b/.test(text) || !/\baffiliate\b/.test(text)) return { error: 'Name a campaign from the filter list, or ask for the recent affiliate campaign.' };
    campaignName = filters.campaign || 'All affiliate campaigns';
  }
  const scope = analyticsScope(data, filters);
  const totals = analyticsSummary(scope);
  const rows = top ? analyticsGroups(scope, 'id').filter(g => g.active).sort((a, b) => b.ggr - a.ggr || a.name.localeCompare(b.name)).slice(0, 10) : [];
  return { filters, totals, rows, title: top ? 'Customers with highest GGR' : campaign ? 'Affiliate results: ' + campaignName : 'GGR result',
    context: filters.from + ' — ' + filters.to + ' · ' + (filters.site || 'All casino websites') + ' · ' +
      (filters.segment.length ? 'Segments (OR): ' + data.segmentDefinitions.filter(s => filters.segment.includes(s.id)).map(s => s.name).join(', ') : 'All segments') +
      (filters.to === data.partialDate ? ' · TODAY IS PARTIAL; no period comparison' : '') };
}

function analyticsChange(value, previous, percentage = false) {
  if (value === null || previous === null || !Number.isFinite(value) || !Number.isFinite(previous)) return null;
  if (percentage) return (value - previous) * 100;
  return previous === 0 ? value === 0 ? 0 : null : (value - previous) / Math.abs(previous) * 100;
}

function analyticsHealth(value, rule) {
  if (value === null || !Number.isFinite(value)) return 'neutral';
  if (rule.direction === 'low') return value <= rule.good ? 'good' : value <= rule.bad ? 'warn' : 'bad';
  return value >= rule.good ? 'good' : value >= rule.bad ? 'warn' : 'bad';
}

const ANALYTICS_SIGNALS = {
  revenue: { label: 'NGR margin', direction: 'high', good: 0.02, bad: 0, percentage: true },
  trend: { label: 'NGR', direction: 'high', good: 0, bad: 0 },
  cash: { label: 'Net cash flow', direction: 'high', good: 0, bad: 0 },
  payments: { label: 'Deposit approval', direction: 'high', good: 0.95, bad: 0.9, percentage: true },
  bonuses: { label: 'Suspected abusive claim rate', direction: 'low', good: 0.05, bad: 0.15, percentage: true },
  concentration: { label: 'Top 10 NGR share', direction: 'low', good: 0.3, bad: 0.5, percentage: true },
  pipeline: { label: 'Lead to FTD', direction: 'high', good: 0.2, bad: 0.1, percentage: true },
  lifecycle: { label: 'Dormant profile share', direction: 'low', good: 0.15, bad: 0.3, percentage: true },
  channels: { label: 'CAC / FTD', direction: 'low', good: 50, bad: 80, money: true },
  retention: { label: 'D7 retention', direction: 'high', good: 0.25, bad: 0.1, percentage: true },
  value: { label: 'NGR ARPU', direction: 'high', good: 0, bad: 0, money: true },
  exposure: { label: 'Flagged profile share', direction: 'low', good: 0.1, bad: 0.3, percentage: true },
  verification: { label: 'KYC pending share', direction: 'low', good: 0.1, bad: 0.25, percentage: true },
  protection: { label: 'Excluded wagering facts', direction: 'low', good: 0, bad: 0 },
  products: { label: 'Gaming hold', direction: 'high', good: 0.03, bad: 0, percentage: true },
  engagement: { label: 'Sessions / active player', direction: 'high', good: 3, bad: 1 }
};

function analyticsReportValues(scope) {
  const t = analyticsSummary(scope);
  const entrants = scope.players.filter(p => p.lead >= scope.from);
  const top = analyticsGroups(scope, 'id').filter(p => p.active).slice(0, 10);
  const excluded = new Set(scope.players.filter(p => p.excluded).map(p => p.id));
  const hasFacts = scope.rows.length > 0;
  return {
    revenue: hasFacts ? analyticsRatio(t.ngr, t.stake) : null, trend: hasFacts ? t.ngr : null,
    cash: hasFacts ? t.netCash : null, payments: t.paymentSuccess,
    bonuses: analyticsRatio(t.abusiveClaims, t.claims),
    concentration: t.ngr > 0 ? analyticsSum(top, 'ngr') / t.ngr : null,
    pipeline: analyticsRatio(entrants.filter(p => p.ftd !== null && p.ftd <= scope.asOf).length, entrants.length),
    lifecycle: analyticsRatio(scope.players.filter(p => p.statusAt(scope.asOf) === 'Dormant').length, scope.players.length),
    channels: t.cac, retention: analyticsRetention(scope, 7).rate, value: t.arpu,
    exposure: analyticsRatio(scope.players.filter(p => p.risk !== 'None').length, scope.players.length),
    verification: analyticsRatio(scope.players.filter(p => p.kyc === 'PENDING').length, scope.players.length),
    protection: scope.players.length ? scope.rows.filter(r => excluded.has(r.player)).length : null,
    products: t.hold, engagement: analyticsRatio(t.sessions, t.active)
  };
}
