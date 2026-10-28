function CustomerActivityLogs({ customer, activityItems }) {
  const [result, setResult] = React.useState(null);
  const [tag, setTag] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const query = new URLSearchParams({ tag, from, to, offset: String(offset), limit: '10' });
    customerRequest('/' + customer.id + '/activity?' + query).then(data => {
      if (active) setResult(data);
    }).catch(err => {
      if (active) setError(Object.values(err.fields || {}).join(' · ') || err.message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customer.id, tag, from, to, offset, retry]);
  const change = (setter, value) => { setter(value); setOffset(0); };
  const text = value => NexLuckI18n.t(value);
  return <section className="customer-card customer-activity" aria-labelledby="customer-activity-title">
    <h2 id="customer-activity-title">{text('Activity info')}</h2>
    <Stats items={activityItems} />
    <p className="hint">{text('Activity is seeded demo data. Last session shows duration.')}</p>
    <h3>{text('Activity logs')}</h3>
    <p className="hint">{text('Latest event first. Date filters use inclusive UTC dates. Demo histories illustrate player behaviour; they are not an operational audit trail.')}</p>
    <div className="activity-filters">
      <label className="field">{text('From (UTC)')}<input type="date" aria-label={text('Activity from (UTC)')} value={from} max={to || undefined} onChange={event => change(setFrom, event.target.value)} /></label>
      <label className="field">{text('To (UTC)')}<input type="date" aria-label={text('Activity to (UTC)')} value={to} min={from || undefined} onChange={event => change(setTo, event.target.value)} /></label>
      <label className="field">{text('Event tag')}<select aria-label={text('Event tag')} value={tag} onChange={event => change(setTag, event.target.value)}>
        <option value="">{text('All tags')}</option>
        {(result?.tags || ['customer', 'game', 'finance', 'loyalty', 'bonus', 'compliance', 'segment']).map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <button className="btn" type="button" onClick={() => { setFrom(''); setTo(''); setTag(''); setOffset(0); }}>{text('Clear filters')}</button>
    </div>
    {loading && <p role="status">{text('Loading activity logs…')}</p>}
    {error && <p role="alert" className="error">{error} <button className="btn" onClick={() => setRetry(value => value + 1)}>{text('Retry')}</button></p>}
    {!loading && !error && result && <>
      <p className="hint">{NexLuckI18n.t('{count} activity events', { count: result.total })}</p>
      {!result.items.length && <p className="notice">{text('No activity logs match these filters.')}</p>}
      <ol className="activity-log-list" aria-label={text('Activity logs')}>
        {result.items.map(event => <li key={event.id} data-event-id={event.id}>
          <div className="activity-event-heading"><span className={'activity-tag tag-' + event.event_tag}>[{event.event_tag}]</span><strong>{text(event.event_type)}</strong></div>
          <dl className="activity-event-meta">
            <dt>{text('Created at')}</dt><dd><time dateTime={event.created_at}>{dateText(event.created_at)}</time></dd>
            <dt>{text('User name')}</dt><dd>{event.user_name}</dd>
            <dt>{text('Session ID')}</dt><dd>{event.session_id}</dd>
          </dl>
          <dl className="activity-event-details">{Object.entries(event.details).map(([label, value]) => <React.Fragment key={label}>
            <dt>{text(label)}</dt><dd>{typeof value === 'number' ? value.toLocaleString(NexLuckI18n.formatLocale) : value}</dd>
          </React.Fragment>)}</dl>
        </li>)}
      </ol>
      {result.total > 10 && <div className="pager">
        <button className="btn" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 10))}>{text('Previous')}</button>
        <span>{Math.floor(offset / 10) + 1} / {Math.ceil(result.total / 10)}</span>
        <button className="btn" disabled={offset + 10 >= result.total} onClick={() => setOffset(value => value + 10)}>{text('Next')}</button>
      </div>}
    </>}
  </section>;
}
