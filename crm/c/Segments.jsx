const SEGMENT_API = '/crm/ui-api/v1/segments';
async function apiRequest(url, options = {}) {
  const response = await CRMContext.fetch(url, options);
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error(NexLuckI18n.t("CRM API unavailable (HTTP {value1}). Start or update the CRM API server.", { value1: response.status }));
  }
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || NexLuckI18n.t("Request failed ({value1})", { value1: response.status }));
    error.status = response.status;
    error.fields = body.fields || {};
    throw error;
  }
  return body;
}
const SEGMENT_OPS = { list: ['IS', '=', '!='], boolean: ['IS', '=', '!='], number: ['IS', '<', '>', '!=', '=', '>=', '=<'], date: ['IS', '<', '>', '!=', '=', '>=', '=<'] };

// Shared with CustomerPages and Compliance: demo wallet activity used by segment facts and profile tiles.
function customerActivity(id, now = Date.now()) {
  const index = Number(id.slice(3)) - 1001;
  const wallets = WALLETS.filter(w => w.customer_id === id || (!w.customer_id && [String(7000 + index * 2), String(7001 + index * 2)].includes(w.id.slice(2))));
  const transactions = WALLET_TX.filter(t => wallets.some(w => w.id === t.wallet) && t.ts <= now);
  const stats = [...new Set(wallets.map(w => w.currency))].map(currency => {
    const tx = transactions.filter(t => t.currency === currency);
    const sum = type => tx.filter(t => t.type === type).reduce((total, t) => total + Math.abs(t.amount), 0);
    const bets = sum('Bet'), wins = sum('Win'), wagered = sum('Bonus wagering'), granted = sum('Bonus granted');
    return {
      currency, bets, wins, ggr: bets - wins, net: wins - bets, rounds: tx.filter(t => t.type === 'Bet').length,
      rtp: bets ? wins / bets * 100 : null, wagered, granted, cancelled: sum('Bonus cancelled'),
      bonusEvents: tx.filter(t => t.type.startsWith('Bonus ')).length,
      deposits: [1, 7, 30, 365].map(days => tx.filter(t => t.type === 'Deposit' && t.ts >= now - days * 86400000).reduce((total, t) => total + t.amount, 0))
    };
  });
  const bets = transactions.filter(t => t.type === 'Bet' && wallets.some(w => w.id === t.wallet && w.type === 'Real'));
  const rank = names => {
    const counts = new Map();
    names.forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
    return [...counts].sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b)).slice(0, 3);
  };
  const games = bets.map(t => DEMO_GAME_CATALOG.find(game => game.name === t.note));
  const favourites = {
    games: rank(bets.map(t => t.note)),
    categories: rank(games.map(game => game ? game.category : 'Unmapped category')),
    providers: rank(games.map(game => game ? game.provider : 'Unmapped provider'))
  };
  const points = bets.length * 100;
  return { wallets, transactions, stats, favourites, points, tier: points >= 500 ? 'Gold' : points >= 200 ? 'Silver' : 'Bronze' };
}

function segmentFacts(customer, now = Date.now()) {
  const activity = customerActivity(customer.id, now);
  const transactions = activity.transactions;
  const real = transactions.filter(t => activity.wallets.some(w => w.id === t.wallet && w.type === 'Real'));
  const deposits = real.filter(t => t.type === 'Deposit'), withdrawals = real.filter(t => t.type === 'Withdrawal');
  const daysOld = Math.max(0, Math.floor((now - Date.parse(customer.created_at)) / 86400000));
  const birthday = new Date(customer.birthday + 'T00:00:00Z'), today = new Date(now);
  const birthdayPending = today.getUTCMonth() < birthday.getUTCMonth() ||
    (today.getUTCMonth() === birthday.getUTCMonth() && today.getUTCDate() < birthday.getUTCDate());
  const risks = customer.risk_indicators;
  const values = {
    country: customer.country, geo_zone: COUNTRIES[customer.country]?.[1], currency: customer.currency, lang: customer.lang,
    age: today.getUTCFullYear() - birthday.getUTCFullYear() - Number(birthdayPending), gender: customer.gender,
    funnel_status: customer.funnel_status, registration_date: customer.created_at.slice(0, 10), account_age: daysOld,
    legacy_group: customer.legacy_groups || [],
    kyc_status: customer.kyc_status,
    days_since_login: customer.activity.last_login_at ? Math.max(0, Math.floor((now - Date.parse(customer.activity.last_login_at)) / 86400000)) : null,
    hours_in_game: customer.activity.overall_game_hours, session_time: customer.activity.last_session_hours,
    sessions_per_week: customer.sessions_per_week, devices: customer.devices,
    number_of_deposits: deposits.length, deposit_frequency: deposits.length * 7 / Math.max(1, daysOld),
    favourite_game: activity.favourites.games.map(([name]) => name),
    favourite_category: activity.favourites.categories.map(([name]) => name),
    favourite_provider: activity.favourites.providers.map(([name]) => name),
    favourite_type: activity.favourites.categories.map(([name]) => name),
    bonus_wr_rate: customer.bonus_wr_rate, loyalty_points: activity.points,
    rdw_rate: withdrawals.length ? deposits.length / withdrawals.length : null
  };
  const riskFields = {
    risk_rdw: 'rdw', risk_bonus_abuse: 'bonus_abuse', risk_multiple_payment_methods: 'multiple_payment_methods',
    risk_abnormal_activity: 'abnormal_activity', risk_failed_kyc_attempts: 'failed_kyc_attempts', risk_multiple_ips: 'vpn_multiple_ips'
  };
  Object.entries(riskFields).forEach(([key, flag]) => { values[key] = Array.isArray(risks) ? risks.includes(flag) : null; });
  const monetary = rule => {
    const wallets = activity.wallets.filter(w => w.currency === rule.currency);
    if (!wallets.length) return null;
    const tx = real.filter(t => t.currency === rule.currency);
    const sum = type => tx.filter(t => t.type === type).reduce((total, t) => total + Math.abs(t.amount), 0);
    const bets = tx.filter(t => t.type === 'Bet'), stakes = sum('Bet'), wins = sum('Win');
    switch (rule.field) {
      case 'lifetime_ggr': return stakes - wins;
      case 'win_over_loss': return wins - stakes;
      case 'average_bet': return bets.length ? stakes / bets.length : null;
      case 'real_balance': return wallets.filter(w => w.type === 'Real').reduce((sum, w) => sum + w.balance, 0);
      case 'bonus_balance': return wallets.filter(w => w.type === 'Bonus').reduce((sum, w) => sum + w.balance, 0);
      case 'net_cash_flow': return tx.filter(t => ['Deposit', "Withdrawal"].includes(t.type) && t.ts >= now - rule.days * 86400000)
        .reduce((sum, t) => sum + (t.type === 'Deposit' ? Math.abs(t.amount) : -Math.abs(t.amount)), 0);
      default: throw new Error(NexLuckI18n.t("Unknown monetary segmentation parameter: ") + rule.field);
    }
  };
  return { values, monetary };
}

function evaluateSegment(node, facts, parameters) {
  let result;
  if (node.kind === 'group') {
    const children = node.children.map(child => evaluateSegment(child, facts, parameters));
    result = node.operator === 'AND'
      ? children.includes(false) ? false : children.includes(null) ? null : true
      : children.includes(true) ? true : children.includes(null) ? null : false;
  } else {
    const parameter = parameters.find(p => p.key === node.field);
    if (!parameter) throw new Error(NexLuckI18n.t("Unknown segmentation parameter: ") + node.field);
    const actual = parameter.money ? facts.monetary(node) : facts.values[node.field];
    if (actual === undefined || actual === null || (typeof actual === 'number' && !Number.isFinite(actual))) return null;
    const equal = parameter.type === 'list'
      ? node.value.some(value => (Array.isArray(actual) ? actual : [actual]).includes(value)) : actual === node.value;
    switch (node.operator) {
      case 'IS': case '=': result = equal; break;
      case '!=': result = !equal; break;
      case '<': result = actual < node.value; break;
      case '>': result = actual > node.value; break;
      case '>=': result = actual >= node.value; break;
      case '=<': case '<=': result = actual <= node.value; break;
      default: throw new Error(NexLuckI18n.t("Unknown segment operator: ") + node.operator);
    }
  }
  return node.not && result !== null ? !result : result;
}

function customerSegmentIds(customer, segments, parameters, now = Date.now()) {
  const facts = segmentFacts(customer, now);
  return segments.filter(segment => evaluateSegment(segment.rules, facts, parameters) === true).map(segment => segment.id);
}

function customerSegmentRisk(customer, segments, parameters, now = Date.now()) {
  const ids = customerSegmentIds(customer, segments, parameters, now);
  return segments.filter(segment => ids.includes(segment.id)).reduce((max, segment) => Math.max(max, NexLuckSegmentTags.riskScore(segment)), 0);
}

function CustomerRiskScore({ score, stored }) {
  const level = NexLuckSegmentTags.riskLevel(score);
  return <span className={'segment-risk-score segment-risk-' + level}
    title={NexLuckI18n.t("Highest risk matrix score among matching segments ({value1}). Stored profile value: {value2}/100", { value1: NexLuckI18n.t(level), value2: stored ?? 0 })}>{score} / 100</span>;
}

function segmentAutoName(node) {
  if (node.kind === 'group') {
    const parts = node.children.map(segmentAutoName);
    const name = parts.join(node.operator === 'AND' ? '_' : '_OR_');
    return (node.not ? 'NOT_' : '') + (node.children.length > 1 && (node.operator === 'OR' || node.not) ? '[' + name + ']' : name);
  }
  const aliases = { lifetime_ggr: 'GGR', risk_bonus_abuse: 'BONUS_ABUSER', number_of_deposits: 'DEPOSITS', average_bet: 'AVG_BET' };
  const key = aliases[node.field] || node.field.replace(/^risk_/, '').toUpperCase();
  const op = { '>': 'G', '<': 'L', '>=': 'GE', '=<': 'LE', '<=': 'LE', '!=': 'NE', '=': 'EQ', IS: '' }[node.operator];
  const value = Array.isArray(node.value) ? '[' + node.value.slice(0, 2).join(', ') + (node.value.length > 2 ? ' ...' : '') + ']'
    : typeof node.value === 'boolean' ? node.value ? '' : 'FALSE' : String(node.value);
  return [node.not ? 'NOT' : '', key, op, value, node.currency || '', node.days ? node.days + 'D' : ''].filter(Boolean).join('_');
}

function segmentRuleText(node, parameters) {
  if (node.kind === 'group') return (node.not ? 'NOT ' : '') + '(' + node.children.map(child => segmentRuleText(child, parameters)).join(' ' + node.operator + ' ') + ')';
  const label = parameters.find(p => p.key === node.field)?.label || node.field;
  return (node.not ? 'NOT ' : '') + label + ' ' + node.operator + ' ' +
    (Array.isArray(node.value) ? node.value.join('/') : String(node.value)) +
    (node.currency ? ' ' + node.currency : '') + (node.days ? ' over ' + node.days + ' days' : '');
}

function useCustomerSegments() {
  const [segments, setSegments] = React.useState([]);
  const [parameters, setParameters] = React.useState([]);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [list, catalog] = await Promise.all([apiRequest(SEGMENT_API), apiRequest(SEGMENT_API + '/parameters')]);
      setSegments(list.items); setParameters(catalog.items);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  React.useEffect(() => { load(); }, []);
  React.useEffect(() => { if (!loading && !error) NexLuckSegmentTags.setCatalog(segments); }, [segments, loading, error]);
  const saved = segment => setSegments(old => old.some(s => s.id === segment.id) ? old.map(s => s.id === segment.id ? segment : s) : [...old, segment]);
  return { segments, parameters, error, loading, load, saved };
}

const SegmentTag = NexLuckSegmentTags.createSegmentTag(React);
function SegmentTags({ segments, onRemove, removeLabel = NexLuckI18n.t("Remove segment filter ") }) {
  return <div className="segment-tags">{segments.map(segment => <SegmentTag key={segment.id || segment.name} segment={segment}
    removeLabel={removeLabel} onRemove={onRemove && (() => onRemove(segment.id))} />)}</div>;
}
globalThis.SegmentTag = SegmentTag;
globalThis.SegmentTags = SegmentTags;

function SegmentParameters({ customer, parameters, onClose }) {
  const [days, setDays] = React.useState(30);
  const facts = segmentFacts(customer);
  const currencies = [...new Set(customerActivity(customer.id).wallets.map(w => w.currency))];
  const groups = [...new Set(parameters.map(p => p.group))];
  const validDays = Number.isInteger(days) && days >= 1 && days <= 36500;
  const format = value => {
    if (value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value))) return 'Unavailable';
    if (Array.isArray(value)) return value.length ? value.join(' / ') : 'None recorded';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    return typeof value === 'number' ? value.toLocaleString(NexLuckI18n.formatLocale, { maximumFractionDigits: 4 }) : value;
  };
  return <SegmentDialog title={NexLuckI18n.t("Customer segment parameters")} wide onClose={onClose}>
    <p className="notice">{customer.name} · {customer.id}{NexLuckI18n.t(". Current values used by segment rules. Activity, devices, session frequency, bonus completion and risk signals include demo data.")}</p>
    <label className="field parameter-days">{NexLuckI18n.t("Net cash flow days")}<input aria-label={NexLuckI18n.t("Parameter cash flow days")} type="number" min="1" max="36500" value={days}
      onChange={e => setDays(e.target.value === '' ? '' : Number(e.target.value))} /></label>
    {!validDays && <p className="error" role="alert">{NexLuckI18n.t("Enter a whole number of days between 1 and 36500.")}</p>}
    <div className="parameter-groups">{groups.map(group => <section className="parameter-group" key={group}>
      <h3>{NexLuckI18n.t(group)}</h3><dl>{parameters.filter(p => p.group === group).map(parameter => <React.Fragment key={parameter.key}>
        <dt>{NexLuckI18n.t(parameter.label)}{parameter.hint && <small>{NexLuckI18n.t(parameter.hint)}</small>}</dt>
        <dd data-parameter={parameter.key}>{parameter.money
          ? currencies.length ? currencies.map(currency => <div key={currency}>
            <b>{currency}</b>: {parameter.key === 'net_cash_flow' && !validDays ? 'Invalid period' : format(facts.monetary({ field: parameter.key, currency, days }))}
          </div>) : 'No wallets recorded'
          : format(facts.values[parameter.key])}</dd>
      </React.Fragment>)}</dl>
    </section>)}</div>
    <div className="customer-actions"><button type="button" className="btn" onClick={onClose}>{NexLuckI18n.t("Done")}</button></div>
  </SegmentDialog>;
}

function SegmentDialog({ title, titleActions, children, onClose, busy = false, wide = false }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current.querySelector('input,button,select')?.focus();
    const keyboard = e => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const controls = [...ref.current.querySelectorAll('input:not(:disabled),button:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
        if (!controls.length) { e.preventDefault(); return; }
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [busy]);
  return <div className="segment-overlay"><section className={'segment-dialog' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={NexLuckI18n.t(title)} ref={ref}>
    <h2>{NexLuckI18n.t(title)}{titleActions}<button className="btn" type="button" aria-label={NexLuckI18n.t("Close ") + title} disabled={busy} onClick={onClose}>×</button></h2>{children}
  </section></div>;
}

function SegmentValuePicker({ parameter, initial, onSave, onClose }) {
  const [values, setValues] = React.useState(initial);
  const [query, setQuery] = React.useState('');
  const label = value => parameter.key === 'country' ? value + ' · ' + COUNTRIES[value][0] : value;
  const options = parameter.options.filter(value => label(value).toLowerCase().includes(query.trim().toLowerCase()));
  return <SegmentDialog title={parameter.label + NexLuckI18n.t(" list editor")} onClose={onClose}>
    <label className="field">{NexLuckI18n.t("Search values")}<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <p className="hint">{values.length}{NexLuckI18n.t(" selected · values in this list are matched with OR.")}</p>
    <div className="segment-options">{options.map(value => <label key={value} className={'segment-choice' + (values.includes(value) ? ' on' : '')}>
      <input type="checkbox" checked={values.includes(value)} onChange={() => setValues(old => old.includes(value) ? old.filter(v => v !== value) : [...old, value])} />{label(value)}
    </label>)}</div>
    {!options.length && <p className="hint">{NexLuckI18n.t("No values match this search.")}</p>}
    <div className="customer-actions"><button type="button" className="btn" onClick={onClose}>{NexLuckI18n.t("Cancel")}</button>
      <button type="button" className="btn pri" disabled={!values.length} onClick={() => onSave(parameter.options.filter(v => values.includes(v)))}>{NexLuckI18n.t("Apply values")}</button></div>
  </SegmentDialog>;
}

function newSegmentRule(parameter) {
  return { kind: 'rule', field: parameter.key, operator: 'IS', not: false,
    value: parameter.type === 'list' ? [] : parameter.type === 'boolean' ? true : parameter.type === 'date' ? new Date().toISOString().slice(0, 10) : 0,
    ...(parameter.money ? { currency: 'EUR' } : {}),
    ...(parameter.key === 'net_cash_flow' ? { days: 30 } : {}) };
}

function SegmentRuleNode({ node, parameters, onChange, onRemove, onPick, depth = 0, busy }) {
  const groups = [...new Set(parameters.map(p => p.group))];
  const countNodes = n => n.kind === 'group' ? 1 + n.children.reduce((sum, child) => sum + countNodes(child), 0) : 1;
  if (node.kind === 'group') return <fieldset className="segment-rule-group" disabled={busy}>
    <legend>{depth ? NexLuckI18n.t("Rule group") : NexLuckI18n.t("Segment rules")}</legend>
    <div className="segment-rule-toolbar">
      <label className="segment-not"><input type="checkbox" checked={node.not} onChange={e => onChange({ ...node, not: e.target.checked })} />{NexLuckI18n.t("NOT")}</label>
      <label className="field">{NexLuckI18n.t("Combine rules")}<select aria-label={NexLuckI18n.t("Combine rules at level ") + depth} value={node.operator} onChange={e => onChange({ ...node, operator: e.target.value })}><option value={"AND"}>{NexLuckI18n.t("AND")}</option><option value={"OR"}>{NexLuckI18n.t("OR")}</option></select></label>
      {onRemove && <button type="button" className="btn" onClick={onRemove}>{NexLuckI18n.t("Remove group")}</button>}
    </div>
    {node.children.map((child, i) => <React.Fragment key={i}>
      {i > 0 && <div className="segment-join">{node.operator}</div>}
      <SegmentRuleNode node={child} parameters={parameters} depth={depth + 1} busy={busy}
        onChange={updated => onChange({ ...node, children: node.children.map((old, j) => i === j ? updated : old) })}
        onRemove={() => onChange({ ...node, children: node.children.filter((_, j) => j !== i) })}
        onPick={onPick} />
    </React.Fragment>)}
    <div className="segment-rule-toolbar">
      <button type="button" className="btn" disabled={depth >= 5 || countNodes(node) >= 100} onClick={() => onChange({ ...node, children: [...node.children, newSegmentRule(parameters[0])] })}>{NexLuckI18n.t("+ Add rule")}</button>
      <button type="button" className="btn" disabled={depth >= 4 || countNodes(node) >= 99} onClick={() => onChange({ ...node, children: [...node.children, { kind: 'group', operator: 'OR', not: false, children: [newSegmentRule(parameters[0])] }] })}>{NexLuckI18n.t("+ Add AND/OR group")}</button>
    </div>
  </fieldset>;
  const parameter = parameters.find(p => p.key === node.field);
  const valuesText = Array.isArray(node.value) ? node.value.slice(0, 2).join('/') : '';
  return <fieldset className="segment-rule" disabled={busy}>
    <legend>{NexLuckI18n.t("Condition")}</legend>
    <label className="segment-not"><input type="checkbox" checked={node.not} onChange={e => onChange({ ...node, not: e.target.checked })} />{NexLuckI18n.t("NOT")}</label>
    <label className="field">{NexLuckI18n.t("Parameter")}<select aria-label={NexLuckI18n.t("Segmentation parameter")} value={node.field} onChange={e => onChange(newSegmentRule(parameters.find(p => p.key === e.target.value)))}>
      {groups.map(group => <optgroup label={NexLuckI18n.t(group)} key={group}>{parameters.filter(p => p.group === group).map(p => <option value={p.key} key={p.key}>{NexLuckI18n.t(p.label)}</option>)}</optgroup>)}
    </select></label>
    <label className="field">{NexLuckI18n.t("Operator")}<select aria-label={NexLuckI18n.t("Rule operator")} value={node.operator} onChange={e => onChange({ ...node, operator: e.target.value })}>{SEGMENT_OPS[parameter.type].map(op => <option key={op} value={op}>{NexLuckI18n.t(op)}</option>)}</select></label>
    {parameter.type === "list" ? <div className="field">{NexLuckI18n.t("Values")}<button type="button" className="btn segment-value" aria-label={NexLuckI18n.t("Edit ") + parameter.label + NexLuckI18n.t(" values")} onClick={() => onPick(parameter, node.value, values => onChange({ ...node, value: values }))}>
      <span>{valuesText || NexLuckI18n.t("Select values")}</span><span>…</span>
    </button></div> : parameter.type === "boolean" ? <label className="segment-boolean"><input type="checkbox" checked={node.value} onChange={e => onChange({ ...node, value: e.target.checked })} />{node.value ? NexLuckI18n.t("True") : NexLuckI18n.t("False")}</label>
      : <label className="field">{NexLuckI18n.t("Value")}<input aria-label={NexLuckI18n.t("Rule value")} type={parameter.type === 'date' ? 'date' : 'number'} step="any" value={node.value}
        onChange={e => onChange({ ...node, value: parameter.type === 'date' || e.target.value === '' ? e.target.value : Number(e.target.value) })} /></label>}
    {parameter.money && <label className="field">{NexLuckI18n.t("Wallet currency")}<select aria-label={NexLuckI18n.t("Rule currency")} value={node.currency} onChange={e => onChange({ ...node, currency: e.target.value })}>{CURRENCIES.map(currency => <option key={currency} value={currency}>{NexLuckI18n.t(currency)}</option>)}</select></label>}
    {node.field === 'net_cash_flow' && <label className="field">{NexLuckI18n.t("Net cash flow days")}<input aria-label={NexLuckI18n.t("Net cash flow period")} type="number" min="1" max="36500" value={node.days} onChange={e => onChange({ ...node, days: e.target.value === '' ? '' : Number(e.target.value) })} /></label>}
    <button type="button" className="btn" onClick={onRemove} aria-label={NexLuckI18n.t("Remove ") + parameter.label + NexLuckI18n.t(" rule")}>{NexLuckI18n.t("Remove")}</button>
    {parameter.hint && <p className="hint segment-rule-hint">{NexLuckI18n.t(parameter.hint)}</p>}
  </fieldset>;
}

function segmentDraftError(node, parameters) {
  let count = 0;
  const visit = (n, depth) => {
    if (++count > 100 || depth > 5) return NexLuckI18n.t("Use at most 100 conditions/groups and 5 nesting levels.");
    if (n.kind === 'group') {
      if (!n.children.length) return NexLuckI18n.t("Every group needs at least one rule.");
      return n.children.map(child => visit(child, depth + 1)).find(Boolean);
    }
    const p = parameters.find(p => p.key === n.field);
    if (p.type === 'list' && !n.value.length) return NexLuckI18n.t("Choose at least one value for ") + p.label + '.';
    if (p.type === 'number' && (typeof n.value !== 'number' || !Number.isFinite(n.value))) return NexLuckI18n.t("Enter a number for ") + p.label + '.';
    if (p.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(n.value)) return NexLuckI18n.t("Enter a date for ") + p.label + '.';
    if (n.field === 'net_cash_flow' && (!Number.isInteger(n.days) || n.days < 1 || n.days > 36500)) return NexLuckI18n.t("Net cash flow period must be a whole number from 1 to 36500.");
    return null;
  };
  return visit(node, 0);
}

function SegmentEditor({ segment, parameters, customers, ownerId, onSave, onClose }) {
  const [rules, setRules] = React.useState(() => {
    if (!segment) return { kind: 'group', operator: 'AND', not: false, children: [newSegmentRule(parameters[0])] };
    const rules = JSON.parse(JSON.stringify(segment.rules));
    return rules.kind === 'group' ? rules : { kind: 'group', operator: 'AND', not: false, children: [rules] };
  });
  const [name, setName] = React.useState(segment?.name || '');
  const [manualName, setManualName] = React.useState(Boolean(segment));
  const [tagName, setTagName] = React.useState(segment?.tag_name || '');
  const [picker, setPicker] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const generated = segmentAutoName(rules).slice(0, 200);
  const currentName = manualName ? name : generated;
  const validation = segmentDraftError(rules, parameters);
  const matching = validation || !customers ? null : customers.filter(customer => evaluateSegment(rules, segmentFacts(customer), parameters) === true);
  const save = async e => {
    e.preventDefault();
    if (validation) { setError(validation); return; }
    setBusy(true); setError('');
    try {
      const response = await apiRequest(SEGMENT_API + (segment ? '/' + (segment.object_id || segment.id) : ''), {
        casinoId: ownerId, method: segment ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: currentName, tag_name: tagName.trim(), rules })
      });
      const saved = { risk_score: segment?.risk_score ?? 0, ...response };
      onSave(CRMContext.reporting ? { ...saved, original_name: saved.name, object_id: saved.id, id: ownerId + ':' + saved.id, casino_id: ownerId,
        name: saved.name + ' (' + CRMContext.casinos.find(site => site.id === ownerId)?.name + ', ' + ownerId + ')' } : saved);
    } catch (e) { setError(e.fields && Object.keys(e.fields).length ? Object.entries(e.fields).map(([key, value]) => key + ': ' + value).join('; ') : e.message); }
    finally { setBusy(false); }
  };
  return <SegmentDialog title={segment ? NexLuckI18n.t("Edit segment") : NexLuckI18n.t("New segment")} wide busy={busy} onClose={onClose}>
    <form onSubmit={save}>
      {ownerId && <p className="notice">{NexLuckI18n.t("Owner casino: ")}{CRMContext.casinos.find(site => site.id === ownerId)?.name} ({ownerId}{NexLuckI18n.t("). This saves operational configuration, not report filters.")}</p>}
      <label className="field">{NexLuckI18n.t("Segment name")}<input aria-label={NexLuckI18n.t("Segment name")} value={currentName} maxLength={200} required disabled={busy} onChange={e => { setName(e.target.value); setManualName(true); }} /></label>
      <button type="button" className="btn" disabled={busy} onClick={() => setManualName(false)}>{NexLuckI18n.t("Use automatic name")}</button>
      <label className="field">{NexLuckI18n.t("Tag name")}<input aria-label={NexLuckI18n.t("Tag name")} value={tagName} maxLength={200} disabled={busy} placeholder={currentName} onChange={e => setTagName(e.target.value)} /></label>
      <p className="hint">{NexLuckI18n.t("Optional friendly label shown on segment tags. Leave blank to show the technical segment name.")}</p>
      <p className="notice">{NexLuckI18n.t("Membership is calculated from current demo customer and wallet data. Money rules use their selected currency. Missing data does not match, including under NOT.")}</p>
      <SegmentRuleNode node={rules} parameters={parameters} onChange={setRules} busy={busy} onPick={(parameter, initial, apply) => setPicker({ parameter, initial, apply })} />
      <p className="segment-preview">{segmentRuleText(rules, parameters)}</p>
      {(validation || matching) && <p role="status" className="hint">{validation || NexLuckI18n.t("{value1} of {value2} customers match", { value1: matching.length, value2: customers.length })}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="customer-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>{NexLuckI18n.t("Cancel")}</button><button className="btn pri" disabled={busy || Boolean(validation)}>{busy ? NexLuckI18n.t("Saving…") : NexLuckI18n.t("Save segment")}</button></div>
    </form>
    {picker && <SegmentValuePicker parameter={picker.parameter} initial={picker.initial} onClose={() => setPicker(null)} onSave={values => { picker.apply(values); setPicker(null); }} />}
  </SegmentDialog>;
}

const SegmentSelection = globalThis.createSegmentSelection(React);
function SegmentWidget({ state, customers = null, customer = null, selected = [], onToggle, onSelect, extraNames = [], selectionOwner = 'bonus', onClose }) {
  const [query, setQuery] = React.useState('');
  const [editor, setEditor] = React.useState(null);
  const [ownerId, setOwnerId] = React.useState('');
  const [ownerParameters, setOwnerParameters] = React.useState([]);
  const [ownerError, setOwnerError] = React.useState('');
  const [ownerLoading, setOwnerLoading] = React.useState(false);
  React.useEffect(() => {
    if (!CRMContext.reporting || !ownerId) return;
    let current = true;
    setOwnerLoading(true); setOwnerParameters([]); setOwnerError('');
    apiRequest(SEGMENT_API + '/parameters', { casinoId: ownerId })
      .then(result => { if (current) setOwnerParameters(result.items); })
      .catch(error => { if (current) setOwnerError(error.message); })
      .finally(() => { if (current) setOwnerLoading(false); });
    return () => { current = false; };
  }, [ownerId]);
  const memberships = state.segments.map(segment => ({ ...segment,
    members: customers ? customers.filter(c => evaluateSegment(segment.rules, segmentFacts(c), state.parameters) === true) : null
  }));
  const entries = [...memberships, ...[...new Set(extraNames)].filter(name => !memberships.some(s => s.name === name))
    .map(name => ({ id: 'legacy:' + name, name, rules: null, members: null }))];
  const shown = entries.filter(s => (!customer || customerSegmentIds(customer, [s], state.parameters).length) &&
    (s.name + ' ' + (s.tag_name || '') + ' ' + (s.rules ? segmentRuleText(s.rules, state.parameters) : '')).toLowerCase().includes(query.toLowerCase().trim()));
  const isSelected = segment => selected.includes(onSelect ? segment.name : segment.id);
  const select = segment => onSelect ? onSelect(segment) : onToggle?.(segment.id);
  return <SegmentDialog title={customer ? customer.name + NexLuckI18n.t(" segments") : NexLuckI18n.t("Segments")} wide onClose={onClose}>
    {CRMContext.reporting && <label className="field">{NexLuckI18n.t("Owner casino for segment changes")}<select aria-label={NexLuckI18n.t("Owner casino for segment changes")} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
      <option value="">{NexLuckI18n.t("Select owner explicitly")}</option>{CRMContext.casinos.map(site => <option value={site.id} key={site.id}>{site.name} ({site.id})</option>)}
    </select></label>}
    {ownerError && <p role="alert" className="error">{ownerError}</p>}
    <div className="segment-widget-tools"><label className="field">{NexLuckI18n.t("Search segments")}<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label><button type="button" className="btn pri" disabled={state.loading || Boolean(state.error) || (CRMContext.reporting && (!ownerId || ownerLoading || !ownerParameters.length))} onClick={() => setEditor({ segment: null })}>{NexLuckI18n.t("+ New segment")}</button></div>
    {state.loading && <p role="status" className="hint">{NexLuckI18n.t("Loading segments...")}</p>}
    {state.error && <p role="alert" className="error">{state.error} <button type="button" className="btn" onClick={state.load}>{NexLuckI18n.t("Retry")}</button></p>}
    {onSelect && <p className="hint">{NexLuckI18n.t("Double-click a row to toggle selection. Keyboard: focus a row and press Enter or Space. Selections are saved with the ")}{selectionOwner}.</p>}
    {customer && <p className="hint">{NexLuckI18n.t("Only segments currently matching this customer are shown. Membership is calculated, not manually assigned.")}</p>}
    {!state.loading && !state.error && <SegmentSelection entries={shown}
      selected={shown.filter(isSelected).map(s => s.id)} onSelect={select} checkbox={Boolean(onToggle)}
      renderDetails={segment => <>{segment.rules ? <p className="segment-preview">{segmentRuleText(segment.rules, state.parameters)}</p> : <p className="segment-preview">{NexLuckI18n.t("Existing ")}{selectionOwner}{NexLuckI18n.t(" segment")}</p>}
        {segment.members && <p className="hint">{segment.members.length}{NexLuckI18n.t(" matching ")}{segment.members.length === 1 ? 'customer' : 'customers'}</p>}</>}
      renderActions={segment => segment.rules && <button type="button" className="btn" disabled={CRMContext.reporting && (ownerId !== segment.casino_id || ownerLoading || !ownerParameters.length)} onClick={() => setEditor({ segment })} aria-label={NexLuckI18n.t("Edit segment ") + NexLuckSegmentTags.friendlyName(segment)}>{NexLuckI18n.t("Edit")}</button>} />}
    {!state.loading && !state.error && !shown.length && <p className="hint">{NexLuckI18n.t("No matching segments.")}</p>}
    <div className="customer-actions"><button type="button" className="btn" onClick={onClose}>{NexLuckI18n.t("Done")}</button></div>
    {editor && <SegmentEditor segment={editor.segment && CRMContext.reporting ? { ...editor.segment, name: editor.segment.original_name } : editor.segment} ownerId={CRMContext.reporting ? ownerId : undefined} parameters={CRMContext.reporting ? ownerParameters : state.parameters} customers={customers}
      onClose={() => setEditor(null)} onSave={segment => { state.saved(segment); setEditor(null); }} />}
  </SegmentDialog>;
}
