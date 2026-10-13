const SEGMENT_API = '/crm/ui-api/v1/segments';
const SEGMENT_OPS = { list: ['IS', '=', '!='], boolean: ['IS', '=', '!='], number: ['IS', '<', '>', '!=', '=', '>=', '=<'], date: ['IS', '<', '>', '!=', '=', '>=', '=<'] };

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
      case 'net_cash_flow': return tx.filter(t => ['Deposit', 'Withdrawal'].includes(t.type) && t.ts >= now - rule.days * 86400000)
        .reduce((sum, t) => sum + (t.type === 'Deposit' ? Math.abs(t.amount) : -Math.abs(t.amount)), 0);
      default: throw new Error('Unknown monetary segmentation parameter: ' + rule.field);
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
    if (!parameter) throw new Error('Unknown segmentation parameter: ' + node.field);
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
      default: throw new Error('Unknown segment operator: ' + node.operator);
    }
  }
  return node.not && result !== null ? !result : result;
}

function customerSegmentIds(customer, segments, parameters, now = Date.now()) {
  const facts = segmentFacts(customer, now);
  return segments.filter(segment => evaluateSegment(segment.rules, facts, parameters) === true).map(segment => segment.id);
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
  const saved = segment => setSegments(old => old.some(s => s.id === segment.id) ? old.map(s => s.id === segment.id ? segment : s) : [...old, segment]);
  return { segments, parameters, error, loading, load, saved };
}

function SegmentTags({ segments, onRemove }) {
  return <div className="segment-tags">{segments.map(segment => <span className="segment-tag" key={segment.id} title={segment.name}>
    {segment.name}{onRemove && <button type="button" aria-label={'Remove segment filter ' + segment.name} onClick={() => onRemove(segment.id)}>×</button>}
  </span>)}</div>;
}

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
    return typeof value === 'number' ? value.toLocaleString('en-GB', { maximumFractionDigits: 4 }) : value;
  };
  return <SegmentDialog title="Customer segment parameters" wide onClose={onClose}>
    <p className="notice">{customer.name} · {customer.id}. Current values used by segment rules. Activity, devices, session frequency, bonus completion and risk signals include demo data.</p>
    <label className="field parameter-days">Net cash flow days<input aria-label="Parameter cash flow days" type="number" min="1" max="36500" value={days}
      onChange={e => setDays(e.target.value === '' ? '' : Number(e.target.value))} /></label>
    {!validDays && <p className="error" role="alert">Enter a whole number of days between 1 and 36500.</p>}
    <div className="parameter-groups">{groups.map(group => <section className="parameter-group" key={group}>
      <h3>{group}</h3><dl>{parameters.filter(p => p.group === group).map(parameter => <React.Fragment key={parameter.key}>
        <dt>{parameter.label}{parameter.hint && <small>{parameter.hint}</small>}</dt>
        <dd data-parameter={parameter.key}>{parameter.money
          ? currencies.length ? currencies.map(currency => <div key={currency}>
            <b>{currency}</b>: {parameter.key === 'net_cash_flow' && !validDays ? 'Invalid period' : format(facts.monetary({ field: parameter.key, currency, days }))}
          </div>) : 'No wallets recorded'
          : format(facts.values[parameter.key])}</dd>
      </React.Fragment>)}</dl>
    </section>)}</div>
    <div className="customer-actions"><button type="button" className="btn" onClick={onClose}>Done</button></div>
  </SegmentDialog>;
}

function SegmentDialog({ title, children, onClose, busy = false, wide = false }) {
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
  return <div className="segment-overlay"><section className={'segment-dialog' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
    <h2>{title}<button className="btn" type="button" aria-label={'Close ' + title} disabled={busy} onClick={onClose}>×</button></h2>{children}
  </section></div>;
}

function SegmentValuePicker({ parameter, initial, onSave, onClose }) {
  const [values, setValues] = React.useState(initial);
  const [query, setQuery] = React.useState('');
  const label = value => parameter.key === 'country' ? value + ' · ' + COUNTRIES[value][0] : value;
  const options = parameter.options.filter(value => label(value).toLowerCase().includes(query.trim().toLowerCase()));
  return <SegmentDialog title={parameter.label + ' list editor'} onClose={onClose}>
    <label className="field">Search values<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <p className="hint">{values.length} selected · values in this list are matched with OR.</p>
    <div className="segment-options">{options.map(value => <label key={value} className={'segment-choice' + (values.includes(value) ? ' on' : '')}>
      <input type="checkbox" checked={values.includes(value)} onChange={() => setValues(old => old.includes(value) ? old.filter(v => v !== value) : [...old, value])} />{label(value)}
    </label>)}</div>
    {!options.length && <p className="hint">No values match this search.</p>}
    <div className="customer-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="button" className="btn pri" disabled={!values.length} onClick={() => onSave(parameter.options.filter(v => values.includes(v)))}>Apply values</button></div>
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
    <legend>{depth ? 'Rule group' : 'Segment rules'}</legend>
    <div className="segment-rule-toolbar">
      <label className="segment-not"><input type="checkbox" checked={node.not} onChange={e => onChange({ ...node, not: e.target.checked })} />NOT</label>
      <label className="field">Combine rules<select aria-label={'Combine rules at level ' + depth} value={node.operator} onChange={e => onChange({ ...node, operator: e.target.value })}><option>AND</option><option>OR</option></select></label>
      {onRemove && <button type="button" className="btn" onClick={onRemove}>Remove group</button>}
    </div>
    {node.children.map((child, i) => <React.Fragment key={i}>
      {i > 0 && <div className="segment-join">{node.operator}</div>}
      <SegmentRuleNode node={child} parameters={parameters} depth={depth + 1} busy={busy}
        onChange={updated => onChange({ ...node, children: node.children.map((old, j) => i === j ? updated : old) })}
        onRemove={() => onChange({ ...node, children: node.children.filter((_, j) => j !== i) })}
        onPick={onPick} />
    </React.Fragment>)}
    <div className="segment-rule-toolbar">
      <button type="button" className="btn" disabled={depth >= 5 || countNodes(node) >= 100} onClick={() => onChange({ ...node, children: [...node.children, newSegmentRule(parameters[0])] })}>+ Add rule</button>
      <button type="button" className="btn" disabled={depth >= 4 || countNodes(node) >= 99} onClick={() => onChange({ ...node, children: [...node.children, { kind: 'group', operator: 'OR', not: false, children: [newSegmentRule(parameters[0])] }] })}>+ Add AND/OR group</button>
    </div>
  </fieldset>;
  const parameter = parameters.find(p => p.key === node.field);
  const valuesText = Array.isArray(node.value) ? node.value.slice(0, 2).join('/') : '';
  return <fieldset className="segment-rule" disabled={busy}>
    <legend>Condition</legend>
    <label className="segment-not"><input type="checkbox" checked={node.not} onChange={e => onChange({ ...node, not: e.target.checked })} />NOT</label>
    <label className="field">Parameter<select aria-label="Segmentation parameter" value={node.field} onChange={e => onChange(newSegmentRule(parameters.find(p => p.key === e.target.value)))}>
      {groups.map(group => <optgroup label={group} key={group}>{parameters.filter(p => p.group === group).map(p => <option value={p.key} key={p.key}>{p.label}</option>)}</optgroup>)}
    </select></label>
    <label className="field">Operator<select aria-label="Rule operator" value={node.operator} onChange={e => onChange({ ...node, operator: e.target.value })}>{SEGMENT_OPS[parameter.type].map(op => <option key={op}>{op}</option>)}</select></label>
    {parameter.type === 'list' ? <div className="field">Values<button type="button" className="btn segment-value" aria-label={'Edit ' + parameter.label + ' values'} onClick={() => onPick(parameter, node.value, values => onChange({ ...node, value: values }))}>
      <span>{valuesText || 'Select values'}</span><span>…</span>
    </button></div> : parameter.type === 'boolean' ? <label className="segment-boolean"><input type="checkbox" checked={node.value} onChange={e => onChange({ ...node, value: e.target.checked })} />{node.value ? 'True' : 'False'}</label>
      : <label className="field">Value<input aria-label="Rule value" type={parameter.type === 'date' ? 'date' : 'number'} step="any" value={node.value}
        onChange={e => onChange({ ...node, value: parameter.type === 'date' || e.target.value === '' ? e.target.value : Number(e.target.value) })} /></label>}
    {parameter.money && <label className="field">Wallet currency<select aria-label="Rule currency" value={node.currency} onChange={e => onChange({ ...node, currency: e.target.value })}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></label>}
    {node.field === 'net_cash_flow' && <label className="field">Net cash flow days<input aria-label="Net cash flow period" type="number" min="1" max="36500" value={node.days} onChange={e => onChange({ ...node, days: e.target.value === '' ? '' : Number(e.target.value) })} /></label>}
    <button type="button" className="btn" onClick={onRemove} aria-label={'Remove ' + parameter.label + ' rule'}>Remove</button>
    {parameter.hint && <p className="hint segment-rule-hint">{parameter.hint}</p>}
  </fieldset>;
}

function segmentDraftError(node, parameters) {
  let count = 0;
  const visit = (n, depth) => {
    if (++count > 100 || depth > 5) return 'Use at most 100 conditions/groups and 5 nesting levels.';
    if (n.kind === 'group') {
      if (!n.children.length) return 'Every group needs at least one rule.';
      return n.children.map(child => visit(child, depth + 1)).find(Boolean);
    }
    const p = parameters.find(p => p.key === n.field);
    if (p.type === 'list' && !n.value.length) return 'Choose at least one value for ' + p.label + '.';
    if (p.type === 'number' && (typeof n.value !== 'number' || !Number.isFinite(n.value))) return 'Enter a number for ' + p.label + '.';
    if (p.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(n.value)) return 'Enter a date for ' + p.label + '.';
    if (n.field === 'net_cash_flow' && (!Number.isInteger(n.days) || n.days < 1 || n.days > 36500)) return 'Net cash flow period must be a whole number from 1 to 36500.';
    return null;
  };
  return visit(node, 0);
}

function SegmentEditor({ segment, parameters, customers, onSave, onClose }) {
  const [rules, setRules] = React.useState(() => {
    if (!segment) return { kind: 'group', operator: 'AND', not: false, children: [newSegmentRule(parameters[0])] };
    const rules = JSON.parse(JSON.stringify(segment.rules));
    return rules.kind === 'group' ? rules : { kind: 'group', operator: 'AND', not: false, children: [rules] };
  });
  const [name, setName] = React.useState(segment?.name || '');
  const [manualName, setManualName] = React.useState(Boolean(segment));
  const [picker, setPicker] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const generated = segmentAutoName(rules).slice(0, 200);
  const currentName = manualName ? name : generated;
  const validation = segmentDraftError(rules, parameters);
  const matching = validation ? null : customers.filter(customer => evaluateSegment(rules, segmentFacts(customer), parameters) === true);
  const save = async e => {
    e.preventDefault();
    if (validation) { setError(validation); return; }
    setBusy(true); setError('');
    try {
      const saved = await apiRequest(SEGMENT_API + (segment ? '/' + segment.id : ''), {
        method: segment ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: currentName, rules })
      });
      onSave(saved);
    } catch (e) { setError(e.fields && Object.keys(e.fields).length ? Object.entries(e.fields).map(([key, value]) => key + ': ' + value).join('; ') : e.message); }
    finally { setBusy(false); }
  };
  return <SegmentDialog title={segment ? 'Edit segment' : 'New segment'} wide busy={busy} onClose={onClose}>
    <form onSubmit={save}>
      <label className="field">Segment name<input aria-label="Segment name" value={currentName} maxLength={200} required disabled={busy} onChange={e => { setName(e.target.value); setManualName(true); }} /></label>
      <button type="button" className="btn" disabled={busy} onClick={() => setManualName(false)}>Use automatic name</button>
      <p className="notice">Membership is calculated from current demo customer and wallet data. Money rules use their selected currency. Missing data does not match, including under NOT.</p>
      <SegmentRuleNode node={rules} parameters={parameters} onChange={setRules} busy={busy} onPick={(parameter, initial, apply) => setPicker({ parameter, initial, apply })} />
      <p className="segment-preview">{segmentRuleText(rules, parameters)}</p>
      <p role="status" className="hint">{validation || `${matching.length} of ${customers.length} customers match`}</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="customer-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy || Boolean(validation)}>{busy ? 'Saving…' : 'Save segment'}</button></div>
    </form>
    {picker && <SegmentValuePicker parameter={picker.parameter} initial={picker.initial} onClose={() => setPicker(null)} onSave={values => { picker.apply(values); setPicker(null); }} />}
  </SegmentDialog>;
}

function SegmentWidget({ state, customers, customer = null, selected = [], onToggle, onClose }) {
  const [query, setQuery] = React.useState('');
  const [editor, setEditor] = React.useState(null);
  const memberships = state.segments.map(segment => ({ ...segment,
    members: customers.filter(c => evaluateSegment(segment.rules, segmentFacts(c), state.parameters) === true)
  }));
  const shown = memberships.filter(s => (!customer || customerSegmentIds(customer, [s], state.parameters).length) &&
    (s.name + ' ' + segmentRuleText(s.rules, state.parameters)).toLowerCase().includes(query.toLowerCase().trim()));
  return <SegmentDialog title={customer ? customer.name + ' segments' : 'Segments'} wide onClose={onClose}>
    <div className="segment-widget-tools"><label className="field">Search segments<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label><button type="button" className="btn pri" onClick={() => setEditor({ segment: null })}>+ New segment</button></div>
    {customer && <p className="hint">Only segments currently matching this customer are shown. Membership is calculated, not manually assigned.</p>}
    <div className="segment-library">{shown.map(segment => <div className="segment-library-item" key={segment.id}>
      <div>{onToggle ? <label className="segment-choice"><input type="checkbox" checked={selected.includes(segment.id)} onChange={() => onToggle(segment.id)} /><SegmentTags segments={[segment]} /></label> : <SegmentTags segments={[segment]} />}
        <p className="segment-preview">{segmentRuleText(segment.rules, state.parameters)}</p><p className="hint">{segment.members.length} matching {segment.members.length === 1 ? 'customer' : 'customers'}</p>
      </div>
      <button type="button" className="btn" onClick={() => setEditor({ segment })} aria-label={'Edit segment ' + segment.name}>Edit</button>
    </div>)}</div>
    {!shown.length && <p className="hint">No matching segments.</p>}
    <div className="customer-actions"><button type="button" className="btn" onClick={onClose}>Done</button></div>
    {editor && <SegmentEditor segment={editor.segment} parameters={state.parameters} customers={customers}
      onClose={() => setEditor(null)} onSave={segment => { state.saved(segment); setEditor(null); }} />}
  </SegmentDialog>;
}
