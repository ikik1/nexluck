const { useState, useEffect, useRef } = React;
const CUSTOMER_API = '/crm/ui-api/v1/customers';
const CUSTOMER_FIELDS = [
  ['external_id', NexLuckI18n.t("External ID")], ['name', NexLuckI18n.t("Name")], ['DocumentINo', 'DocumentINo'],
  ['country', NexLuckI18n.t("Country")], ['currency', NexLuckI18n.t("Currency")], ['lang', NexLuckI18n.t("Language")], ['gender', NexLuckI18n.t("Gender")],
  ['addr1', NexLuckI18n.t("Address line 1")], ['addr12', NexLuckI18n.t("Address line 2 (addr12)")],
  ['mfa_type', NexLuckI18n.t("MFA type")], ['risk_score', NexLuckI18n.t("Risk score")],
  ['kyc_status', NexLuckI18n.t("KYC status")], ['birthday', NexLuckI18n.t("Birthday")], ['aml_status', NexLuckI18n.t("AML status")], ['funnel_status', NexLuckI18n.t("Funnel status")], ['info', NexLuckI18n.t("Info")]
];
const CUSTOMER_OPTIONS = {
  get country() { return CRMContext.catalogs.countries.map(record => record.code).sort((a, b) => COUNTRIES[a][0].localeCompare(COUNTRIES[b][0])); },
  get currency() { return CRMContext.catalogs.currencies.map(record => record.code); },
  get lang() { return CRMContext.catalogs.languages.map(record => record.code); },
  gender: ['Female', "Male", 'Non-binary', 'Undisclosed'],
  mfa_type: ['NONE', 'TOTP', 'SMS', 'EMAIL'],
  kyc_status: ['NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED'],
  aml_status: ['CLEAR', 'REVIEW', 'BLOCKED'],
  funnel_status: ['Lead', "Registered", 'FTD', 'Trusted', 'VIP', 'Dormant']
};
const CUSTOMER_RISKS = [
  ['rdw', 'RDW', 'Rapid Deposit and Withdrawal cycles'],
  ['multiple_payment_methods', NexLuckI18n.t("Multiple payment methods"), 'Use of multiple payment methods'],
  ['pof_pow_violations', NexLuckI18n.t("PoF/PoW violations"), "Proof of Funds / Proof of Wealth: amounts do not match the client's wealth"],
  ['abnormal_activity', NexLuckI18n.t("Abnormal activity"), 'Unusual transaction or gaming patterns'],
  ['bonus_abuse', NexLuckI18n.t("Bonus abuse"), 'Multiple accounts used to abuse bonuses'],
  ['bot_activity', NexLuckI18n.t("Bot activity"), 'Suspected automated play'],
  ['device_fingerprint_mismatches', NexLuckI18n.t("Device fingerprint mismatches"), 'Inconsistent device fingerprints'],
  ['failed_kyc_attempts', NexLuckI18n.t("Failed KYC attempts"), 'Unsuccessful identity verification attempts'],
  ['vpn_multiple_ips', NexLuckI18n.t("VPN / Multiple IPs"), 'VPN use or multiple IP addresses']
];
const dateText = value => new Date(value).toLocaleString(NexLuckI18n.formatLocale, { dateStyle: 'medium', timeStyle: 'short' });
const amountText = (value, currency) => value.toLocaleString(NexLuckI18n.formatLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;

async function customerRequest(path = '', options = {}) {
  return apiRequest(CUSTOMER_API + path, options);
}

function CustomerStatus({ value }) {
  if (['NOT_STARTED', 'CLEAR'].includes(value)) return <span className="hint" aria-label={NexLuckI18n.t("No alert")}>—</span>;
  const tone = ['VERIFIED', 'CLEAR'].includes(value) ? 'good' : ['REJECTED', 'BLOCKED'].includes(value) ? 'bad' : 'warn';
  return <span className={'status ' + tone}>{NexLuckI18n.t(value.replace(/_/g, ' '))}</span>;
}

function FunnelStatus({ value }) {
  return <span className={'status funnel funnel-' + value.toLowerCase()}>{NexLuckI18n.t(value)}</span>;
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
      <h2>{NexLuckI18n.t("Segments ")}<button type="button" className="btn" disabled={segmentState.loading || Boolean(segmentState.error)} onClick={() => setSegmentWidget(true)}>{NexLuckI18n.t("Segments")}</button></h2>
      {segmentState.loading && <p role="status" className="hint">{NexLuckI18n.t("Loading segments…")}</p>}
      {segmentState.error && <p role="alert" className="error">{segmentState.error} <button type="button" className="btn" onClick={segmentState.load}>{NexLuckI18n.t("Retry segments")}</button></p>}
      <SegmentTags segments={segmentState.segments.filter(s => selectedSegments.includes(s.id))} onRemove={id => { setSelectedSegments(old => old.filter(s => s !== id)); setPage(0); }} />
      <p className="hint">{NexLuckI18n.t("Select segment tags to filter customers. Selected segments use OR; other filters use AND.")}</p>
    </section>
    <div className="customer-tools">
      <label className="field search-field">{NexLuckI18n.t("Search customers")}<input type="search" placeholder={NexLuckI18n.t("ID, external ID, name, document, country, currency…")} value={query} onChange={e => change(setQuery, e.target.value)} /></label>
      {[['Country', country, setCountry, CUSTOMER_OPTIONS.country], ['Funnel status', funnel, setFunnel, CUSTOMER_OPTIONS.funnel_status], ['KYC status', kyc, setKyc, CUSTOMER_OPTIONS.kyc_status], ['AML status', aml, setAml, CUSTOMER_OPTIONS.aml_status]].map(([label, value, setter, options]) =>
        <label className="field" key={label}>{NexLuckI18n.t(label)}<select aria-label={NexLuckI18n.t(label)} value={value} onChange={e => change(setter, e.target.value)}><option value="">{NexLuckI18n.t("All")}</option>{options.map(v => <option key={v} value={v}>{NexLuckI18n.t(label === 'Country' ? COUNTRIES[v][0] : v.replace(/_/g, ' '))}</option>)}</select></label>)}
      <button className="btn" onClick={() => { setQuery(''); setCountry(''); setKyc(''); setAml(''); setFunnel(''); setSelectedSegments([]); setPage(0); }}>{NexLuckI18n.t("Clear filters")}</button>
    </div>
    {loading && <p role="status">{NexLuckI18n.t("Loading customers…")}</p>}
    {error && <div className="error" role="alert">{error} <button className="btn" onClick={load}>{NexLuckI18n.t("Retry")}</button></div>}
    {!loading && !error && <>
      <p className="count">{filtered.length}{NexLuckI18n.t(" of ")}{customers.length}{NexLuckI18n.t(" customers")}</p>
      <div className="customer-table"><table>
        <thead><tr>{['Customer', "Segments", 'Funnel status', 'External ID', 'DocumentINo', 'Country', 'Currency', 'Language', 'MFA', 'KYC', 'AML', 'Risk', 'Created', 'Info'].map(label => <th key={label}>{NexLuckI18n.t(label)}</th>)}</tr></thead>
        <tbody>{filtered.slice(currentPage * 10, (currentPage + 1) * 10).map(c => <tr key={c.id}>
          <td><a href={'/crm/c/i/?id=' + encodeURIComponent(c.id)}>{c.name}</a><small>{c.id}</small></td>
          <td>{segmentState.loading ? 'Loading…' : segmentState.error ? 'Unavailable' : <SegmentTags segments={segmentState.segments.filter(s => membership[c.id]?.includes(s.id))} />}</td>
          <td><FunnelStatus value={c.funnel_status} /></td>
          <td>{c.external_id}</td><td>{c.DocumentINo}</td><td>{COUNTRIES[c.country][0]}</td><td>{c.currency}</td><td>{c.lang}</td><td>{c.mfa_type}</td>
          <td><CustomerStatus value={c.kyc_status} /></td><td><CustomerStatus value={c.aml_status} /></td><td>{segmentState.loading || segmentState.error ? '—' : <CustomerRiskScore score={customerSegmentRisk(c, segmentState.segments, segmentState.parameters)} stored={c.risk_score} />}</td><td>{dateText(c.created_at)}</td>
          <td><a className="btn" href={'/crm/c/i/?id=' + encodeURIComponent(c.id)} aria-label={NexLuckI18n.t("View ") + c.name}>{NexLuckI18n.t("View")}</a></td>
        </tr>)}</tbody>
      </table>{!filtered.length && <div className="empty">{NexLuckI18n.t("No customers match these filters.")}</div>}</div>
      {pages > 1 && <div className="pager"><button className="btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{NexLuckI18n.t("Previous")}</button><span>{NexLuckI18n.t("Page ")}{currentPage + 1}{NexLuckI18n.t(" of ")}{pages}</span><button className="btn" disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>{NexLuckI18n.t("Next")}</button></div>}
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
      <h2 id="edit-title">{NexLuckI18n.t("Edit customer info ")}<button className="btn" type="button" disabled={busy} onClick={onClose} aria-label={NexLuckI18n.t("Close")}>×</button></h2>
      <div className="edit-grid">
        <label className="field">{NexLuckI18n.t("Customer ID")}<input readOnly value={customer.id} /></label>
        {CUSTOMER_FIELDS.map(([key, label]) => <label className={'field' + (key === 'info' ? ' full' : '') + (fields[key] ? ' invalid' : '')} key={key}>
          {NexLuckI18n.t(label)}
          {CUSTOMER_OPTIONS[key] ? <select aria-label={NexLuckI18n.t(label)} value={draft[key]} disabled={busy} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}>{CUSTOMER_OPTIONS[key].map(v => <option key={v} value={v}>{NexLuckI18n.t(key === 'country' ? COUNTRIES[v][0] : v.replace(/_/g, ' '))}</option>)}</select>
            : key === 'info' ? <textarea aria-label={NexLuckI18n.t(label)} value={draft[key]} maxLength={4000} disabled={busy} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
            : <input aria-label={NexLuckI18n.t(label)} type={key === 'risk_score' ? 'number' : key === 'birthday' ? 'date' : 'text'} value={draft[key]} required={['name', 'external_id', 'birthday', 'risk_score'].includes(key)} min={key === 'risk_score' ? 0 : undefined} max={key === 'risk_score' ? 100 : key === 'birthday' ? new Date(Date.now() - 86400000).toISOString().slice(0, 10) : undefined} maxLength={200} disabled={busy} onChange={e => setDraft(d => ({ ...d, [key]: key === 'risk_score' && e.target.value !== '' ? Number(e.target.value) : e.target.value }))} />}
          {fields[key] && <span className="field-error">{fields[key]}</span>}
        </label>)}
        <label className="field">{NexLuckI18n.t("Created at")}<input readOnly value={dateText(customer.created_at)} /></label>
        <label className="field">{NexLuckI18n.t("Updated at")}<input readOnly value={dateText(customer.updated_at)} /></label>
      </div>
      <p className="notice">{NexLuckI18n.t("Passwords are write-only in a separate secured credential entity. Credential changes require an authenticated server-to-server request.")}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="customer-actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>{NexLuckI18n.t("Cancel")}</button><button className="btn pri" disabled={busy}>{busy ? NexLuckI18n.t("Saving…") : NexLuckI18n.t("Save customer")}</button></div>
    </form>
  </div>;
}

function Stats({ items }) {
  return <div className="stat-list">{items.map(([label, value]) => <div key={label}><span>{NexLuckI18n.t(label)}</span><b>{NexLuckI18n.t(value)}</b></div>)}</div>;
}

function CustomerLoyalty({ customer, segmentState, onSave }) {
  const [settings, setSettings] = useState(null);
  const [points, setPoints] = useState(customer.loyalty_points);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    setError('');
    try { setSettings(await apiRequest('/crm/ui-api/v1/loyalty')); }
    catch (err) { setError(err.message); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setPoints(customer.loyalty_points); }, [customer.loyalty_points]);
  useEffect(() => {
    CRMContext.setDirty('loyalty-points', points !== customer.loyalty_points);
    return () => CRMContext.setDirty('loyalty-points', false);
  }, [points, customer.loyalty_points]);
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      onSave(await customerRequest('/' + customer.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loyalty_points: points }) }));
      setMessage(NexLuckI18n.t('Loyalty points saved.'));
    } catch (err) { setError(err.fields?.loyalty_points || err.message); }
    finally { setBusy(false); }
  };
  const ready = settings && !segmentState.loading && !segmentState.error;
  const status = ready ? NexLuckLoyalty.status(customer, settings.tiers, segmentState.segments, segmentState.parameters) : null;
  return <>
    <div className="loyalty-grid"><div><strong>{customer.loyalty_points.toLocaleString(NexLuckI18n.formatLocale)}</strong><small>LP</small></div>
      {status && <div><strong>{status.current?.name || NexLuckI18n.t('Unranked')}</strong><small>{NexLuckI18n.t('Current tier')}</small></div>}
      <a className="btn" href="/crm/loyalty/">{NexLuckI18n.t('Tier settings')}</a>
    </div>
    {!ready && !error && !segmentState.error && <p role="status">{NexLuckI18n.t('Loading loyalty…')}</p>}
    {segmentState.error && <p className="error" role="alert">{segmentState.error} <button className="btn" onClick={segmentState.load}>{NexLuckI18n.t('Retry segments')}</button></p>}
    {status?.next && <>
      <progress className="loyalty-progress" max="100" value={status.progress} aria-label={NexLuckI18n.t('Progress to next tier')} />
      <p>{NexLuckI18n.t('Next tier: {tier} — {points} LP remaining.', { tier: status.next.name, points: status.remaining.toLocaleString(NexLuckI18n.formatLocale) })}</p>
      {status.missingSegments.length > 0 && <p className="hint">{NexLuckI18n.t('Required segments still to match')}: {status.missingSegments.map(id => segmentState.segments.find(segment => segment.id === id)?.name || id).join(', ')}</p>}
    </>}
    {status && !status.next && <p className="hint">{NexLuckI18n.t(status.current ? 'Highest tier reached.' : 'No tiers configured. Add a tier to start.')}</p>}
    <form className="loyalty-points-form" onSubmit={save}>
      <label className="field">{NexLuckI18n.t('Loyalty points (LP)')}<input type="number" step="1" min="0" max={Number.MAX_SAFE_INTEGER} required value={points} disabled={busy} onChange={event => setPoints(event.target.value === '' ? '' : Number(event.target.value))} /></label>
      <button className="btn" disabled={busy || points === customer.loyalty_points}>{NexLuckI18n.t(busy ? 'Saving…' : 'Save points')}</button>
    </form>
    {error && <p className="error" role="alert">{error} {!settings && <button className="btn" onClick={load}>{NexLuckI18n.t('Retry')}</button>}</p>}
    {message && <p role="status" className="notice ok">{message}</p>}
    <p className="hint">{NexLuckI18n.t('Points are a saved integer customer attribute. Formulas and rewards are configuration only.')}</p>
  </>;
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
    if (!id || !/^CU-\d+$/.test(id)) { setError(NexLuckI18n.t("A valid customer ID is required. Select a customer from the list.")); return; }
    try { setCustomer(await customerRequest('/' + encodeURIComponent(id))); }
    catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, [id]);
  const viewSegments = async () => {
    setSegmentCustomerError('');
    try { setSegmentCustomers((await customerRequest()).items); setSegmentWidget(true); }
    catch (e) { setSegmentCustomerError(e.message); }
  };
  if (error) return <><a className="btn" href="/crm/c/list/">{NexLuckI18n.t("Back to customers")}</a><p className="error" role="alert">{error}</p><button className="btn" onClick={load}>{NexLuckI18n.t("Retry")}</button></>;
  if (!customer) return <p role="status">{NexLuckI18n.t("Loading customer…")}</p>;
  const activity = customerActivity(customer.id);
  const profileFields = CUSTOMER_FIELDS.filter(([key]) => !['name', 'funnel_status'].includes(key));
  const lastLoginDays = customer.activity.last_login_at === null ? null : Math.max(0, Math.floor((Date.now() - Date.parse(customer.activity.last_login_at)) / 86400000));
  return <>
    <a className="btn" href="/crm/c/list/">{NexLuckI18n.t("← Customer list")}</a>
    {message && <p className="notice ok" role="status">{message}</p>}
    <p className="notice">{NexLuckI18n.t("Demo activity from Finance wallets; rolling turnover periods end now (1 month = 30 days, 1 year = 365 days). Monetary values remain in each wallet's currency. Profile edits are saved on the server.")}</p>
    <div className="customer-sat">
      <div className="customer-center-column">
      <section className="customer-card customer-center">
        <div className="customer-identity">
          <dl className="customer-timestamps"><dt>{NexLuckI18n.t("created_at")}</dt><dd>{dateText(customer.created_at)}</dd><dt>{NexLuckI18n.t("updated_at")}</dt><dd>{dateText(customer.updated_at)}</dd></dl>
          <div className="avatar" aria-hidden="true">{customer.name.slice(0, 2).toUpperCase()}</div>
          <button className="btn" onClick={() => { setMessage(''); setEditing(true); }}>{NexLuckI18n.t("Edit")}</button>
        </div>
        <h2>{customer.name}</h2><p className="customer-id">{customer.id}</p>
        <ol className="customer-pipeline" aria-label={NexLuckI18n.t("CRM funnel")}>
          {CUSTOMER_OPTIONS.funnel_status.map(status => <li key={status} aria-current={status === customer.funnel_status ? 'step' : undefined}><FunnelStatus value={status} /></li>)}
        </ol>
        <div className="profile-segments">
          <div className="profile-segment-actions">
          <button type="button" className="btn" disabled={segmentState.loading || Boolean(segmentState.error)} onClick={viewSegments}>{NexLuckI18n.t("View customer segments")}</button>
          <button type="button" className="btn" disabled={segmentState.loading || Boolean(segmentState.error)} onClick={() => setViewParameters(true)}>{NexLuckI18n.t("View segment parameters")}</button>
          </div>
          {segmentState.error && <p role="alert" className="error">{segmentState.error} <button className="btn" onClick={segmentState.load}>{NexLuckI18n.t("Retry segments")}</button></p>}
          {segmentCustomerError && <p role="alert" className="error">{segmentCustomerError}</p>}
        </div>
        <dl className="detail-list">{profileFields.map(([key, label]) => <React.Fragment key={key}><dt>{NexLuckI18n.t(label)}</dt><dd>{key === 'country' ? COUNTRIES[customer.country][0] : key === 'risk_score' ? segmentState.loading || segmentState.error ? '—' : <CustomerRiskScore score={customerSegmentRisk(customer, segmentState.segments, segmentState.parameters)} stored={customer[key]} /> : ['kyc_status', 'aml_status'].includes(key) ? <CustomerStatus value={customer[key]} /> : customer[key] === '' ? '—' : customer[key]}</dd></React.Fragment>)}</dl>
        <p className="hint">{NexLuckI18n.t("Password: separate secured credential entity (never returned).")}</p>
      </section>
      <CustomerActivityLogs customer={customer} activityItems={[
          ['Last login', lastLoginDays === null ? 'No recorded login' : lastLoginDays === 0 ? 'Today' : `${lastLoginDays} day${lastLoginDays === 1 ? '' : 's'} ago`],
          ['Last session', `${customer.activity.last_session_hours} hours`],
          ['Overall game hours', new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(customer.activity.overall_game_hours).toUpperCase() + ' h'],
          ['Devices (demo)', customer.devices.join(', ')], ['Sessions per week (demo)', customer.sessions_per_week]
        ]} />
      </div>
      <section className="customer-card" style={{ gridArea: 'risk', '--c': '#ba0517' }}>
        <h2>{NexLuckI18n.t("Risk indicators")}</h2>
        <p className="hint">{NexLuckI18n.t("Demo review signals, not verified findings.")}</p>
        <ul className="risk-indicators">{CUSTOMER_RISKS.map(([key, label, hint]) => {
          const flagged = customer.risk_indicators.includes(key);
          return <li key={key} className={flagged ? 'flagged' : ''}>
            <span>{NexLuckI18n.t(label)} <button type="button" className="risk-help" aria-label={label + ': ' + hint}>?<span role="tooltip">{NexLuckI18n.t(hint)}</span></button></span>
            <b className={'status ' + (flagged ? 'bad' : '')}>{flagged ? 'Flagged' : 'No demo flag'}</b>
          </li>;
        })}</ul>
      </section>
      <section className="customer-card" style={{ gridArea: 'wallets', '--c': '#0a7d8c' }}>
        <h2>{NexLuckI18n.t("Wallets")}</h2>
        {activity.wallets.length ? activity.stats.map(s => <div className="currency-stats" key={s.currency}><h3>{s.currency}</h3>
          <Stats items={activity.wallets.filter(w => w.currency === s.currency).map(w => [w.type + ' balance', amountText(w.balance, s.currency)])} />
          <h3 style={{ marginTop: 14 }}>{NexLuckI18n.t("Deposit turnover")}</h3><Stats items={['1 day', '7 days', '1 month', '1 year'].map((period, i) => [period, amountText(s.deposits[i], s.currency)])} />
        </div>) : <p className="hint">{NexLuckI18n.t("No wallets for this customer.")}</p>}
      </section>
      <section className="customer-card" style={{ gridArea: 'gaming', '--c': '#e8590c' }}>
        <h2>{NexLuckI18n.t("Gaming")}</h2>
        <div className="gaming-favourites">
          {[['games', NexLuckI18n.t("Favourite games")], ['categories', NexLuckI18n.t("Favourite categories")], ['providers', NexLuckI18n.t("Favourite game providers")]].map(([key, title]) => <div key={key}>
            <h3>{NexLuckI18n.t(title)}</h3>
            {activity.favourites[key].length ? <ol>{activity.favourites[key].map(([name, rounds]) => <li key={name}><span>{name}</span><b>{rounds} {rounds === 1 ? 'round' : 'rounds'}</b></li>)}</ol>
              : <p className="hint">{NexLuckI18n.t("No recorded real-wallet bets yet.")}</p>}
          </div>)}
          <p className="hint">{NexLuckI18n.t("Top 3 by recorded real-wallet bet rounds across currencies; ties sorted by name. Categories and providers use the demo game catalog.")}</p>
        </div>
        {activity.stats.map(s => <div className="currency-stats" key={s.currency}><h3>{s.currency}{NexLuckI18n.t(" · recorded demo activity")}</h3><Stats items={[
          ['Bets / losses (stakes)', amountText(s.bets, s.currency)], ['Wins (payouts)', amountText(s.wins, s.currency)],
          ['Gross gaming revenue', amountText(s.ggr, s.currency)], ['Wins minus losses', amountText(s.net, s.currency)],
          ['Bet rounds', s.rounds], ['RTP', s.rtp === null ? 'N/A' : s.rtp.toFixed(2) + '%']
        ]} /></div>)}
        <p className="hint">{NexLuckI18n.t("GGR = bets − wins. Player net = wins − staked amounts. RTP = wins ÷ bets. Real-wallet gaming only.")}</p>
      </section>
      <section className="customer-card" style={{ gridArea: 'bonus', '--c': '#c23934' }}>
        <h2>{NexLuckI18n.t("Bonus activity")}</h2>
        <Stats items={[['Wagering completion (demo)', customer.bonus_wr_rate + '%']]} />
        {activity.stats.map(s => <div className="currency-stats" key={s.currency}><h3>{s.currency}{NexLuckI18n.t(" · recorded demo activity")}</h3><Stats items={[
          ['Bonuses granted', amountText(s.granted, s.currency)], ['Bonus wagering', amountText(s.wagered, s.currency)],
          ['Bonuses cancelled', amountText(s.cancelled, s.currency)], ['Bonus activity events', s.bonusEvents]
        ]} /></div>)}
        <p className="hint">{NexLuckI18n.t("Wagering requirements and completion are not available in the demo ledger.")}</p>
      </section>
      <section className="customer-card" style={{ gridArea: 'loyalty', '--c': '#b8860b' }}>
        <h2>{NexLuckI18n.t("Loyalty points")}</h2>
        <CustomerLoyalty customer={customer} segmentState={segmentState} onSave={setCustomer} />
      </section>
    </div>
    {editing && <CustomerEdit customer={customer} onClose={() => setEditing(false)} onSave={saved => { setCustomer(saved); setEditing(false); setMessage('Customer updated successfully.'); }} />}
    {segmentWidget && <SegmentWidget state={segmentState} customers={segmentCustomers} customer={customer} onClose={() => setSegmentWidget(false)} />}
    {viewParameters && <SegmentParameters customer={customer} parameters={segmentState.parameters} onClose={() => setViewParameters(false)} />}
  </>;
}

CRMContext.mount(() => ReactDOM.createRoot(document.getElementById('root')).render(location.pathname.includes('/c/i') ? <CustomerInfo /> : <CustomerList />));
