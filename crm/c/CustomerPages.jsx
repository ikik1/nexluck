const { useState, useEffect, useRef } = React;
const CUSTOMER_API = '/crm/ui-api/v1/customers';
const CUSTOMER_FIELDS = [
  ['external_id', 'External ID'], ['name', 'Name'], ['DocumentINo', 'DocumentINo'],
  ['country', 'Country'], ['currency', 'Currency'], ['lang', 'Language'], ['gender', 'Gender'],
  ['addr1', 'Address line 1'], ['addr12', 'Address line 2 (addr12)'],
  ['mfa_type', 'MFA type'], ['risk_score', 'Risk score'],
  ['kyc_status', 'KYC status'], ['birthday', 'Birthday'], ['aml_status', 'AML status'], ['funnel_status', 'Funnel status'], ['info', 'Info']
];
const CUSTOMER_OPTIONS = {
  get country() { return CRMContext.catalogs.countries.map(record => record.code).sort((a, b) => COUNTRIES[a][0].localeCompare(COUNTRIES[b][0])); },
  get currency() { return CRMContext.catalogs.currencies.map(record => record.code); },
  get lang() { return CRMContext.catalogs.languages.map(record => record.code); },
  gender: ['Female', 'Male', 'Non-binary', 'Undisclosed'],
  mfa_type: ['NONE', 'TOTP', 'SMS', 'EMAIL'],
  kyc_status: ['NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED'],
  aml_status: ['CLEAR', 'REVIEW', 'BLOCKED'],
  funnel_status: ['Lead', 'Registered', 'FTD', 'Trusted', 'VIP', 'Dormant']
};
const CUSTOMER_RISKS = [
  ['rdw', 'RDW', 'Rapid Deposit and Withdrawal cycles'],
  ['multiple_payment_methods', 'Multiple payment methods', 'Use of multiple payment methods'],
  ['pof_pow_violations', 'PoF/PoW violations', "Proof of Funds / Proof of Wealth: amounts do not match the client's wealth"],
  ['abnormal_activity', 'Abnormal activity', 'Unusual transaction or gaming patterns'],
  ['bonus_abuse', 'Bonus abuse', 'Multiple accounts used to abuse bonuses'],
  ['bot_activity', 'Bot activity', 'Suspected automated play'],
  ['device_fingerprint_mismatches', 'Device fingerprint mismatches', 'Inconsistent device fingerprints'],
  ['failed_kyc_attempts', 'Failed KYC attempts', 'Unsuccessful identity verification attempts'],
  ['vpn_multiple_ips', 'VPN / Multiple IPs', 'VPN use or multiple IP addresses']
];
const dateText = value => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const amountText = (value, currency) => value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;

async function customerRequest(path = '', options = {}) {
  return apiRequest(CUSTOMER_API + path, options);
}

function CustomerStatus({ value }) {
  if (['NOT_STARTED', 'CLEAR'].includes(value)) return <span className="hint" aria-label="No alert">—</span>;
  const tone = ['VERIFIED', 'CLEAR'].includes(value) ? 'good' : ['REJECTED', 'BLOCKED'].includes(value) ? 'bad' : 'warn';
  return <span className={'status ' + tone}>{value.replace(/_/g, ' ')}</span>;
}

function FunnelStatus({ value }) {
  return <span className={'status funnel funnel-' + value.toLowerCase()}>{value}</span>;
}

function CustomerList() {
  const segmentState = useCustomerSegments();
  const [segmentWidget, setSegmentWidget] = useState(false);
  const [selectedSegments, setSelectedSegments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [kyc, setKyc] = useState('');
  const [aml, setAml] = useState('');
  const [funnel, setFunnel] = useState('');
  const [page, setPage] = useState(0);
  const load = async () => {
    setLoading(true); setError('');
    try { setCustomers((await customerRequest()).items); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const membership = segmentState.loading || segmentState.error ? {} : Object.fromEntries(customers.map(c => [c.id, customerSegmentIds(c, segmentState.segments, segmentState.parameters)]));
  const filtered = customers.filter(c => (!country || c.country === country) && (!kyc || c.kyc_status === kyc) && (!aml || c.aml_status === aml) && (!funnel || c.funnel_status === funnel)
    && (!selectedSegments.length || selectedSegments.some(id => membership[c.id]?.includes(id)))
    && terms.every(term => [c.id, c.external_id, c.name, c.DocumentINo, c.country, COUNTRIES[c.country]?.[0], c.currency, c.lang, c.funnel_status].join(' ').toLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages - 1);
  const change = (setter, value) => { setter(value); setPage(0); };
  return <>
    <section className="customer-segments">
      <h2>Segments <button type="button" className="btn" disabled={segmentState.loading || Boolean(segmentState.error)} onClick={() => setSegmentWidget(true)}>Segments</button></h2>
      {segmentState.loading && <p role="status" className="hint">Loading segments…</p>}
      {segmentState.error && <p role="alert" className="error">{segmentState.error} <button type="button" className="btn" onClick={segmentState.load}>Retry segments</button></p>}
      <SegmentTags segments={segmentState.segments.filter(s => selectedSegments.includes(s.id))} onRemove={id => { setSelectedSegments(old => old.filter(s => s !== id)); setPage(0); }} />
      <p className="hint">Select segment tags to filter customers. Selected segments use OR; other filters use AND.</p>
    </section>
    <div className="customer-tools">
      <label className="field search-field">Search customers<input type="search" placeholder="ID, external ID, name, document, country, currency…" value={query} onChange={e => change(setQuery, e.target.value)} /></label>
      {[['Country', country, setCountry, CUSTOMER_OPTIONS.country], ['Funnel status', funnel, setFunnel, CUSTOMER_OPTIONS.funnel_status], ['KYC status', kyc, setKyc, CUSTOMER_OPTIONS.kyc_status], ['AML status', aml, setAml, CUSTOMER_OPTIONS.aml_status]].map(([label, value, setter, options]) =>
        <label className="field" key={label}>{label}<select aria-label={label} value={value} onChange={e => change(setter, e.target.value)}><option value="">All</option>{options.map(v => <option key={v} value={v}>{label === 'Country' ? COUNTRIES[v][0] : v.replace(/_/g, ' ')}</option>)}</select></label>)}
      <button className="btn" onClick={() => { setQuery(''); setCountry(''); setKyc(''); setAml(''); setFunnel(''); setSelectedSegments([]); setPage(0); }}>Clear filters</button>
    </div>
    {loading && <p role="status">Loading customers…</p>}
    {error && <div className="error" role="alert">{error} <button className="btn" onClick={load}>Retry</button></div>}
    {!loading && !error && <>
      <p className="count">{filtered.length} of {customers.length} customers</p>
      <div className="customer-table"><table>
        <thead><tr>{['Customer', 'Segments', 'Funnel status', 'External ID', 'DocumentINo', 'Country', 'Currency', 'Language', 'MFA', 'KYC', 'AML', 'Risk', 'Created', 'Info'].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{filtered.slice(currentPage * 10, (currentPage + 1) * 10).map(c => <tr key={c.id}>
          <td><a href={'/crm/c/i/?id=' + encodeURIComponent(c.id)}>{c.name}</a><small>{c.id}</small></td>
          <td>{segmentState.loading ? 'Loading…' : segmentState.error ? 'Unavailable' : <SegmentTags segments={segmentState.segments.filter(s => membership[c.id]?.includes(s.id))} />}</td>
          <td><FunnelStatus value={c.funnel_status} /></td>
          <td>{c.external_id}</td><td>{c.DocumentINo}</td><td>{COUNTRIES[c.country][0]}</td><td>{c.currency}</td><td>{c.lang}</td><td>{c.mfa_type}</td>
          <td><CustomerStatus value={c.kyc_status} /></td><td><CustomerStatus value={c.aml_status} /></td><td>{c.risk_score} / 100</td><td>{dateText(c.created_at)}</td>
          <td><a className="btn" href={'/crm/c/i/?id=' + encodeURIComponent(c.id)} aria-label={'View ' + c.name}>View</a></td>
        </tr>)}</tbody>
      </table>{!filtered.length && <div className="empty">No customers match these filters.</div>}</div>
      {pages > 1 && <div className="pager"><button className="btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pages}</span><button className="btn" disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
    </>}
    {segmentWidget && <SegmentWidget state={segmentState} customers={customers} selected={selectedSegments} onClose={() => setSegmentWidget(false)}
      onToggle={id => { setSelectedSegments(old => old.includes(id) ? old.filter(s => s !== id) : [...old, id]); setPage(0); }} />}
  </>;
}

function CustomerEdit({ customer, onClose, onSave }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(CUSTOMER_FIELDS.map(([key]) => [key, customer[key]])));
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  useEffect(() => {
    CRMContext.setDirty('customer-editor', true);
    return () => CRMContext.setDirty('customer-editor', false);
  }, []);
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    formRef.current.querySelector('input').focus();
    const keyboard = e => {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key === 'Tab') {
        const controls = [...formRef.current.querySelectorAll('input,select,textarea,button:not(:disabled)')];
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [busy]);
  const save = async e => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    try {
      onSave(await customerRequest('/' + customer.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }));
    } catch (err) { setError(err.message); setFields(err.fields || {}); }
    finally { setBusy(false); }
  };
  return <div className="customer-modal-overlay">
    <form className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title" onSubmit={save} ref={formRef}>
      <h2 id="edit-title">Edit customer info <button className="btn" type="button" disabled={busy} onClick={onClose} aria-label="Close">×</button></h2>
      <div className="edit-grid">
        <label className="field">Customer ID<input readOnly value={customer.id} /></label>
        {CUSTOMER_FIELDS.map(([key, label]) => <label className={'field' + (key === 'info' ? ' full' : '') + (fields[key] ? ' invalid' : '')} key={key}>
          {label}
          {CUSTOMER_OPTIONS[key] ? <select aria-label={label} value={draft[key]} disabled={busy} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}>{CUSTOMER_OPTIONS[key].map(v => <option key={v} value={v}>{key === 'country' ? COUNTRIES[v][0] : v.replace(/_/g, ' ')}</option>)}</select>
            : key === 'info' ? <textarea aria-label={label} value={draft[key]} maxLength={4000} disabled={busy} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
            : <input aria-label={label} type={key === 'risk_score' ? 'number' : key === 'birthday' ? 'date' : 'text'} value={draft[key]} required={['name', 'external_id', 'birthday', 'risk_score'].includes(key)} min={key === 'risk_score' ? 0 : undefined} max={key === 'risk_score' ? 100 : key === 'birthday' ? new Date(Date.now() - 86400000).toISOString().slice(0, 10) : undefined} maxLength={200} disabled={busy} onChange={e => setDraft(d => ({ ...d, [key]: key === 'risk_score' && e.target.value !== '' ? Number(e.target.value) : e.target.value }))} />}
          {fields[key] && <span className="field-error">{fields[key]}</span>}
        </label>)}
        <label className="field">Created at<input readOnly value={dateText(customer.created_at)} /></label>
        <label className="field">Updated at<input readOnly value={dateText(customer.updated_at)} /></label>
      </div>
      <p className="notice">Passwords are write-only in a separate secured credential entity. Credential changes require an authenticated server-to-server request.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="customer-actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy}>{busy ? 'Saving…' : 'Save customer'}</button></div>
    </form>
  </div>;
}

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

function Stats({ items }) {
  return <div className="stat-list">{items.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>;
}

function CustomerInfo() {
  const segmentState = useCustomerSegments();
  const [segmentWidget, setSegmentWidget] = useState(false);
  const [viewParameters, setViewParameters] = useState(false);
  const [segmentCustomers, setSegmentCustomers] = useState([]);
  const [segmentCustomerError, setSegmentCustomerError] = useState('');
  const id = new URLSearchParams(location.search).get('id');
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    setError('');
    if (!id || !/^CU-\d+$/.test(id)) { setError('A valid customer ID is required. Select a customer from the list.'); return; }
    try { setCustomer(await customerRequest('/' + encodeURIComponent(id))); }
    catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, [id]);
  const viewSegments = async () => {
    setSegmentCustomerError('');
    try { setSegmentCustomers((await customerRequest()).items); setSegmentWidget(true); }
    catch (e) { setSegmentCustomerError(e.message); }
  };
  if (error) return <><a className="btn" href="/crm/c/list/">Back to customers</a><p className="error" role="alert">{error}</p><button className="btn" onClick={load}>Retry</button></>;
  if (!customer) return <p role="status">Loading customer…</p>;
  const activity = customerActivity(customer.id);
  const profileFields = CUSTOMER_FIELDS.filter(([key]) => !['name', 'funnel_status'].includes(key));
  const lastLoginDays = customer.activity.last_login_at === null ? null : Math.max(0, Math.floor((Date.now() - Date.parse(customer.activity.last_login_at)) / 86400000));
  return <>
    <a className="btn" href="/crm/c/list/">← Customer list</a>
    {message && <p className="notice ok" role="status">{message}</p>}
    <p className="notice">Demo activity from Finance wallets; rolling turnover periods end now (1 month = 30 days, 1 year = 365 days). Monetary values remain in each wallet's currency. Profile edits are saved on the server.</p>
    <div className="customer-sat">
      <section className="customer-card customer-center">
        <div className="customer-identity">
          <dl className="customer-timestamps"><dt>created_at</dt><dd>{dateText(customer.created_at)}</dd><dt>updated_at</dt><dd>{dateText(customer.updated_at)}</dd></dl>
          <div className="avatar" aria-hidden="true">{customer.name.slice(0, 2).toUpperCase()}</div>
          <button className="btn" onClick={() => { setMessage(''); setEditing(true); }}>Edit</button>
        </div>
        <h2>{customer.name}</h2><p className="customer-id">{customer.id}</p>
        <ol className="customer-pipeline" aria-label="CRM funnel">
          {CUSTOMER_OPTIONS.funnel_status.map(status => <li key={status} aria-current={status === customer.funnel_status ? 'step' : undefined}><FunnelStatus value={status} /></li>)}
        </ol>
        <div className="profile-segments">
          <div className="profile-segment-actions">
          <button type="button" className="btn" disabled={segmentState.loading || Boolean(segmentState.error)} onClick={viewSegments}>View customer segments</button>
          <button type="button" className="btn" disabled={segmentState.loading || Boolean(segmentState.error)} onClick={() => setViewParameters(true)}>View segment parameters</button>
          </div>
          {segmentState.error && <p role="alert" className="error">{segmentState.error} <button className="btn" onClick={segmentState.load}>Retry segments</button></p>}
          {segmentCustomerError && <p role="alert" className="error">{segmentCustomerError}</p>}
        </div>
        <dl className="detail-list">{profileFields.map(([key, label]) => <React.Fragment key={key}><dt>{label}</dt><dd>{key === 'country' ? COUNTRIES[customer.country][0] : key === 'risk_score' ? `${customer[key]} / 100` : ['kyc_status', 'aml_status'].includes(key) ? <CustomerStatus value={customer[key]} /> : customer[key] === '' ? '—' : customer[key]}</dd></React.Fragment>)}</dl>
        <h3 className="activity-title">Activity info</h3>
        <Stats items={[
          ['Last login', lastLoginDays === null ? 'No recorded login' : lastLoginDays === 0 ? 'Today' : `${lastLoginDays} day${lastLoginDays === 1 ? '' : 's'} ago`],
          ['Last session', `${customer.activity.last_session_hours} hours`],
          ['Overall game hours', new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(customer.activity.overall_game_hours).toUpperCase() + ' h'],
          ['Devices (demo)', customer.devices.join(', ')], ['Sessions per week (demo)', customer.sessions_per_week]
        ]} />
        <p className="hint">Activity is seeded demo data. Last session shows duration.</p>
        <p className="hint">Password: separate secured credential entity (never returned).</p>
      </section>
      <section className="customer-card" style={{ gridArea: 'risk', '--c': '#ba0517' }}>
        <h2>Risk indicators</h2>
        <p className="hint">Demo review signals, not verified findings.</p>
        <ul className="risk-indicators">{CUSTOMER_RISKS.map(([key, label, hint]) => {
          const flagged = customer.risk_indicators.includes(key);
          return <li key={key} className={flagged ? 'flagged' : ''}>
            <span>{label} <button type="button" className="risk-help" aria-label={label + ': ' + hint}>?<span role="tooltip">{hint}</span></button></span>
            <b className={'status ' + (flagged ? 'bad' : '')}>{flagged ? 'Flagged' : 'No demo flag'}</b>
          </li>;
        })}</ul>
      </section>
      <section className="customer-card" style={{ gridArea: 'wallets', '--c': '#0a7d8c' }}>
        <h2>Wallets</h2>
        {activity.wallets.length ? activity.stats.map(s => <div className="currency-stats" key={s.currency}><h3>{s.currency}</h3>
          <Stats items={activity.wallets.filter(w => w.currency === s.currency).map(w => [w.type + ' balance', amountText(w.balance, s.currency)])} />
          <h3 style={{ marginTop: 14 }}>Deposit turnover</h3><Stats items={['1 day', '7 days', '1 month', '1 year'].map((period, i) => [period, amountText(s.deposits[i], s.currency)])} />
        </div>) : <p className="hint">No wallets for this customer.</p>}
      </section>
      <section className="customer-card" style={{ gridArea: 'gaming', '--c': '#e8590c' }}>
        <h2>Gaming</h2>
        <div className="gaming-favourites">
          {[['games', 'Favourite games'], ['categories', 'Favourite categories'], ['providers', 'Favourite game providers']].map(([key, title]) => <div key={key}>
            <h3>{title}</h3>
            {activity.favourites[key].length ? <ol>{activity.favourites[key].map(([name, rounds]) => <li key={name}><span>{name}</span><b>{rounds} {rounds === 1 ? 'round' : 'rounds'}</b></li>)}</ol>
              : <p className="hint">No recorded real-wallet bets yet.</p>}
          </div>)}
          <p className="hint">Top 3 by recorded real-wallet bet rounds across currencies; ties sorted by name. Categories and providers use the demo game catalog.</p>
        </div>
        {activity.stats.map(s => <div className="currency-stats" key={s.currency}><h3>{s.currency} · recorded demo activity</h3><Stats items={[
          ['Bets / losses (stakes)', amountText(s.bets, s.currency)], ['Wins (payouts)', amountText(s.wins, s.currency)],
          ['Gross gaming revenue', amountText(s.ggr, s.currency)], ['Wins minus losses', amountText(s.net, s.currency)],
          ['Bet rounds', s.rounds], ['RTP', s.rtp === null ? 'N/A' : s.rtp.toFixed(2) + '%']
        ]} /></div>)}
        <p className="hint">GGR = bets − wins. Player net = wins − staked amounts. RTP = wins ÷ bets. Real-wallet gaming only.</p>
      </section>
      <section className="customer-card" style={{ gridArea: 'bonus', '--c': '#c23934' }}>
        <h2>Bonus activity</h2>
        <Stats items={[['Wagering completion (demo)', customer.bonus_wr_rate + '%']]} />
        {activity.stats.map(s => <div className="currency-stats" key={s.currency}><h3>{s.currency} · recorded demo activity</h3><Stats items={[
          ['Bonuses granted', amountText(s.granted, s.currency)], ['Bonus wagering', amountText(s.wagered, s.currency)],
          ['Bonuses cancelled', amountText(s.cancelled, s.currency)], ['Bonus activity events', s.bonusEvents]
        ]} /></div>)}
        <p className="hint">Wagering requirements and completion are not available in the demo ledger.</p>
      </section>
      <section className="customer-card" style={{ gridArea: 'loyalty', '--c': '#b8860b' }}>
        <h2>Loyalty points</h2><div className="loyalty-grid">
          <div><strong>{activity.points.toLocaleString()}</strong><small>Available demo points</small></div>
          <div><strong>{activity.tier}</strong><small>Loyalty status</small></div>
          <span className="status warn">{activity.tier} badge</span>
          {customer.kyc_status === 'VERIFIED' && <span className="status good">Verified customer badge</span>}
        </div><p className="hint">Demo rule: 100 points per recorded real-wallet bet; Silver at 200 points, Gold at 500 points.</p>
      </section>
    </div>
    {editing && <CustomerEdit customer={customer} onClose={() => setEditing(false)} onSave={saved => { setCustomer(saved); setEditing(false); setMessage('Customer updated successfully.'); }} />}
    {segmentWidget && <SegmentWidget state={segmentState} customers={segmentCustomers} customer={customer} onClose={() => setSegmentWidget(false)} />}
    {viewParameters && <SegmentParameters customer={customer} parameters={segmentState.parameters} onClose={() => setViewParameters(false)} />}
  </>;
}

CRMContext.mount(() => ReactDOM.createRoot(document.getElementById('root')).render(location.pathname.includes('/c/i') ? <CustomerInfo /> : <CustomerList />));
