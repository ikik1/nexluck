const loyaltyText = key => NexLuckI18n.t(key);
const tierDefaults = { name: '', minimum_points: 1000, game_weight: 1, eur_per_point: 10, segment_ids: [], bonus_ids: [], cashback: 15, rakeback: 10 };

function TierEditor({ tier, segments, bonuses, onClose, onSave }) {
  const [draft, setDraft] = React.useState(() => Object.fromEntries(Object.keys(tierDefaults).map(key => [key, tier[key]])));
  const [error, setError] = React.useState('');
  const [fields, setFields] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    ref.current.querySelector('input').focus();
    CRMContext.setDirty('loyalty-tier', true);
    return () => { CRMContext.setDirty('loyalty-tier', false); previous?.focus(); };
  }, []);
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setFields({});
    try {
      await apiRequest('/crm/ui-api/v1/loyalty/tiers' + (tier.id ? '/' + tier.id : ''), {
        method: tier.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft)
      });
      onSave();
    } catch (err) { setError(err.message); setFields(err.fields || {}); }
    finally { setBusy(false); }
  };
  const number = (key, label, min, max, step = 'any') => <label className="field">{loyaltyText(label)}
    <input type="number" aria-label={loyaltyText(label)} required min={min} max={max} step={step} disabled={busy} value={draft[key]}
      onChange={event => setDraft(old => ({ ...old, [key]: event.target.value === '' ? '' : Number(event.target.value) }))} />
    {fields[key] && <span className="field-error">{fields[key]}</span>}
  </label>;
  const choices = (key, title, records) => <fieldset disabled={busy}><legend>{loyaltyText(title)}</legend>
    <div className="loyalty-options">{records.map(record => <label key={record.id}>
      <input type="checkbox" checked={draft[key].includes(record.id)} onChange={event => setDraft(old => ({ ...old,
        [key]: event.target.checked ? [...old[key], record.id] : old[key].filter(id => id !== record.id) }))} />{record.tag_name || record.name}
    </label>)}
      {!records.length && <span className="hint">{loyaltyText('No options available.')}</span>}
      {draft[key].filter(id => !records.some(record => record.id === id)).map(id => <label key={id}><input type="checkbox" checked onChange={() => setDraft(old => ({ ...old, [key]: old[key].filter(value => value !== id) }))} />{loyaltyText('Unavailable selection')}: {id}</label>)}
    </div>{fields[key] && <p className="field-error">{fields[key]}</p>}
  </fieldset>;
  return <dialog ref={ref} className="customer-modal" aria-labelledby="tier-editor-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form className="loyalty-form" onSubmit={save}>
      <h2 id="tier-editor-title">{loyaltyText(tier.id ? 'Edit tier' : 'Add tier')}</h2>
      <label className="field">{loyaltyText('Tier name')}<input required maxLength={100} value={draft.name} disabled={busy} onChange={event => setDraft(old => ({ ...old, name: event.target.value }))} />{fields.name && <span className="field-error">{fields.name}</span>}</label>
      <fieldset><legend>{loyaltyText('LP formula')}</legend>
        <label className="field">{loyaltyText('Total bet amount')}<input readOnly value={loyaltyText('Total bet amount (EUR)')} /></label>
        <div className="edit-grid">{number('game_weight', 'Game weight', 0.000001, 1000000)}{number('eur_per_point', 'Point rate: EUR per 1 LP', 0.000001, 1000000)}</div>
        <p className="hint">{loyaltyText('LP = Total bet amount (EUR) x Game weight x (1 / EUR per point). Configuration only; points are edited manually.')}</p>
      </fieldset>
      <fieldset><legend>{loyaltyText('Conditions')}</legend>
        {number('minimum_points', 'Minimum LP', 0, Number.MAX_SAFE_INTEGER, 1)}
        {choices('segment_ids', 'Required segments (ALL)', segments)}
        <p className="hint">{loyaltyText('Customer must match every selected segment. No segments selected means everyone.')}</p>
      </fieldset>
      <fieldset><legend>{loyaltyText('Rewards')}</legend>
        {choices('bonus_ids', 'Bonus list', bonuses)}
        <div className="edit-grid">{number('cashback', 'Cashback (%)', 0, 100)}{number('rakeback', 'Rakeback (%)', 0, 100)}</div>
        <p className="hint">{loyaltyText('Rewards are configuration only; no bonuses or payments are issued automatically.')}</p>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="customer-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>{loyaltyText('Cancel')}</button><button className="btn pri" disabled={busy}>{loyaltyText(busy ? 'Saving…' : 'Save tier')}</button></div>
    </form>
  </dialog>;
}

function Loyalty() {
  const segmentState = useCustomerSegments();
  const [data, setData] = React.useState(null);
  const [customers, setCustomers] = React.useState([]);
  const [error, setError] = React.useState('');
  const [editing, setEditing] = React.useState(null);
  const [removing, setRemoving] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [period, setPeriod] = React.useState('30');
  const [from, setFrom] = React.useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = React.useState(new Date().toISOString().slice(0, 10));
  const load = async () => {
    setError('');
    try {
      const [settings, profiles] = await Promise.all([apiRequest('/crm/ui-api/v1/loyalty'), apiRequest('/crm/ui-api/v1/customers')]);
      setData(settings); setCustomers(profiles.items);
    } catch (err) { setError(err.message); }
  };
  React.useEffect(() => { load(); }, []);
  const remove = async () => {
    setBusy(true); setError('');
    try { await apiRequest('/crm/ui-api/v1/loyalty/tiers/' + removing.id, { method: 'DELETE' }); setRemoving(null); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  if (!data || segmentState.loading || segmentState.error) return <>
    {error || segmentState.error ? <p role="alert" className="error">{error || segmentState.error} <button className="btn" onClick={() => { load(); segmentState.load(); }}>{loyaltyText('Retry')}</button></p> : <p role="status">{loyaltyText('Loading loyalty…')}</p>}
  </>;
  const now = Date.now();
  const start = period === 'custom' ? Date.parse(from + 'T00:00:00Z') : now - Number(period) * 86400000;
  const end = period === 'custom' ? Date.parse(to + 'T23:59:59.999Z') : now;
  const validPeriod = Number.isFinite(start) && Number.isFinite(end) && start <= end;
  const stats = validPeriod ? NexLuckLoyalty.breakdown(customers, data.tiers, segmentState.segments, segmentState.parameters, start, end, now) : null;
  const names = (ids, records) => ids.map(id => records.find(record => record.id === id)?.name || loyaltyText('Unavailable selection') + ': ' + id).join(', ');
  return <>
    <p className="notice">{loyaltyText('Current tiers use saved LP and all selected segments. Active customers placed at least one recorded bet in the selected period; each customer is counted once in their current tier. Demo ledger data; not historical tier membership.')}</p>
    <section aria-labelledby="loyalty-stats-title">
      <div className="loyalty-tools"><h2 id="loyalty-stats-title">{loyaltyText('Active customers by tier')}</h2>
        <label className="field">{loyaltyText('Period')}<select aria-label={loyaltyText('Period')} value={period} onChange={event => setPeriod(event.target.value)}>
          {[['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['365', 'Last 365 days'], ['custom', 'Custom period']].map(([value, label]) => <option value={value} key={value}>{loyaltyText(label)}</option>)}
        </select></label>
        {period === 'custom' && <><label className="field">{loyaltyText('From (UTC)')}<input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label><label className="field">{loyaltyText('To (UTC)')}<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></label></>}
      </div>
      {!validPeriod && <p className="error" role="alert">{loyaltyText('Select a valid period: start must not be after end.')}</p>}
      {stats && <div className="loyalty-stats">{data.tiers.map((tier, index) => <article className="loyalty-stat" key={tier.id} data-tier-id={tier.id}>
        <h3>{NexLuckI18n.t('Tier {number}', { number: index + 1 })} ({tier.name})</h3><strong>{stats.counts[tier.id]}</strong><small>{loyaltyText('Active customers')}</small>
      </article>)}<article className="loyalty-stat" data-tier-id="unranked"><h3>{loyaltyText('Unranked')}</h3><strong>{stats.unranked}</strong><small>{loyaltyText('Active customers')}</small></article></div>}
    </section>
    {error && <p className="error" role="alert">{error} <button className="btn" onClick={load}>{loyaltyText('Retry')}</button></p>}
    <section aria-labelledby="tier-settings-title">
      <div className="loyalty-tools"><h2 id="tier-settings-title">{loyaltyText('Tier settings')}</h2><button className="btn pri" onClick={() => setEditing(tierDefaults)}>{loyaltyText('Add tier')}</button></div>
      <p className="hint">{loyaltyText('Tiers are ordered by LP threshold. The highest eligible tier applies. Removing a tier does not remove customer points.')}</p>
      {!data.tiers.length && <p className="notice">{loyaltyText('No tiers configured. Add a tier to start.')}</p>}
      <div className="loyalty-tiers">{data.tiers.map((tier, index) => <article className="loyalty-tier" key={tier.id} data-tier-id={tier.id}>
        <h3>{NexLuckI18n.t('Tier {number}', { number: index + 1 })}: {tier.name}</h3>
        <dl><dt>{loyaltyText('LP formula')}</dt><dd>{loyaltyText('Total bet amount')} x {tier.game_weight} x (1 / {tier.eur_per_point} EUR)</dd>
          <dt>{loyaltyText('Minimum LP')}</dt><dd>{tier.minimum_points.toLocaleString(NexLuckI18n.formatLocale)} LP</dd>
          <dt>{loyaltyText('Required segments (ALL)')}</dt><dd>{names(tier.segment_ids, segmentState.segments) || loyaltyText('Everyone')}</dd>
          <dt>{loyaltyText('Bonus list')}</dt><dd>{names(tier.bonus_ids, data.bonus_options) || loyaltyText('None')}</dd>
          <dt>{loyaltyText('Cashback')}</dt><dd>{tier.cashback}%</dd><dt>{loyaltyText('Rakeback')}</dt><dd>{tier.rakeback}%</dd>
        </dl><div className="customer-actions"><button className="btn" onClick={() => setEditing(tier)}>{loyaltyText('Edit tier')}</button><button className="btn" onClick={() => setRemoving(tier)}>{loyaltyText('Remove tier')}</button></div>
      </article>)}</div>
    </section>
    {editing && <TierEditor tier={editing} segments={segmentState.segments} bonuses={data.bonus_options} onClose={() => setEditing(null)} onSave={() => { setEditing(null); load(); }} />}
    {removing && <RemoveTier tier={removing} busy={busy} error={error} onCancel={() => setRemoving(null)} onRemove={remove} />}
  </>;
}

function RemoveTier({ tier, busy, error, onCancel, onRemove }) {
  const ref = React.useRef(null);
  React.useEffect(() => { const previous = document.activeElement; ref.current.showModal(); return () => previous?.focus(); }, []);
  return <dialog ref={ref} className="customer-modal" aria-labelledby="remove-tier-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="remove-tier-title">{loyaltyText('Remove tier')}: {tier.name}</h2><p>{loyaltyText('Customer points are kept; tier eligibility will be recalculated.')}</p>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="customer-actions"><button className="btn" disabled={busy} onClick={onCancel}>{loyaltyText('Cancel')}</button><button className="btn pri" disabled={busy} onClick={onRemove}>{loyaltyText('Remove tier')}</button></div>
  </dialog>;
}
CRMContext.mount(() => ReactDOM.createRoot(document.getElementById('root')).render(<Loyalty />));
