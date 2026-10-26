const { useState, useMemo, useEffect } = React;

const fmt = (ts, secs) => new Intl.DateTimeFormat(NexLuckI18n.formatLocale, {
  day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  ...(secs ? { second: '2-digit', fractionalSecondDigits: 3 } : {})
}).format(new Date(ts));
const money = (n, c) => n.toLocaleString(NexLuckI18n.formatLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + c;
const uniq = k => [...new Set(TRANSACTIONS.map(t => t[k]))].sort();
const PAGE = 25;

function DateField({ label, value, onChange }) {
  const ref = React.useRef(null);
  return (
    <label className="fld">{NexLuckI18n.t(label)}
      <input type="text" readOnly value={value ? new Intl.DateTimeFormat(NexLuckI18n.formatLocale, { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(value + 'T00:00')) : ''} placeholder={NexLuckI18n.t("Select date…")} style={{ cursor: 'pointer' }}
        onClick={() => { try { ref.current.showPicker(); } catch (e) { ref.current.focus(); } }} />
      <input ref={ref} type="date" value={value} onChange={e => onChange(e.target.value)} tabIndex={-1} aria-hidden="true" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
    </label>
  );
}

const TransactionSegmentTag = NexLuckSegmentTags.createSegmentTag(React);
function Details({ t, onClose }) {
  const segmentCatalog = NexLuckSegmentTags.useCatalog(React);
  const logs = useMemo(() => txLogs(t), [t]);
  const [open, setOpen] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const copy = () => {
    const text = logs.map(l => `[${fmt(l.at, true)}] ${l.dir.toUpperCase()} ${l.title}\n${JSON.stringify(l.body, null, 2)}`).join('\n\n');
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }, () => {});
  };
  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg wide" role="dialog" aria-modal="true" aria-label={NexLuckI18n.t("Transaction ") + t.id}>
        <h2>{t.id} <span className={'st ' + t.status}>{NexLuckI18n.t(t.status)}</span><button className="x" onClick={onClose} aria-label={NexLuckI18n.t("Close")}>×</button></h2>
        <dl className="dkv">
          <dt>{NexLuckI18n.t("Created")}</dt><dd>{fmt(t.ts)}</dd><dt>{NexLuckI18n.t("Type")}</dt><dd>{NexLuckI18n.t(t.type)}</dd>
          <dt>{NexLuckI18n.t("Amount")}</dt><dd><b>{money(t.amount, t.currency)}</b></dd><dt>{NexLuckI18n.t("Player")}</dt><dd>{t.player}</dd>
          <dt>{NexLuckI18n.t("Gateway")}</dt><dd>{t.gateway}</dd><dt>{NexLuckI18n.t("Method")}</dt><dd>{t.method}</dd>
          <dt>{NexLuckI18n.t("Country")}</dt><dd>{COUNTRIES[t.country][0]}</dd><dt>{NexLuckI18n.t("Geo zone")}</dt><dd>{t.zone}</dd>
          <dt>{NexLuckI18n.t("Gateway reference")}</dt><dd>{t.ref}</dd><dt>{NexLuckI18n.t("Segments")}</dt><dd>{t.segments.map(s => <TransactionSegmentTag key={s} className="tag" segment={s} segments={segmentCatalog} />)}</dd>
          {t.reason && <><dt>{NexLuckI18n.t("Decline reason")}</dt><dd style={{ color: '#ba0517', fontWeight: 600 }}>{NexLuckI18n.t(t.reason)}</dd></>}
        </dl>
        <div className="sec2"><span>{NexLuckI18n.t("Communication log (")}{logs.length})</span><button className="link" onClick={copy}>{copied ? NexLuckI18n.t("Copied") : NexLuckI18n.t("Copy log")}</button></div>
        {logs.map((l, i) => (
          <details key={i} className={'log ' + l.dir} open={open === i} onToggle={e => { if (e.target.open) setOpen(i); else if (open === i) setOpen(null); }}>
            <summary><time>{fmt(l.at, true)}</time><span className="dir">{l.dir}</span><b>{l.title}</b></summary>
            <pre>{JSON.stringify(l.body, null, 2)}</pre>
          </details>
        ))}
      </div>
    </div>
  );
}

function Transactions() {
  const empty = { q: '', status: '', type: '', gateway: '', method: '', currency: '', country: '', zone: '', from: '', to: '' };
  const [f, setF] = useState(empty);
  const [shown, setShown] = useState(PAGE);
  const [sel, setSel] = useState(null);
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setShown(PAGE); };
  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const from = f.from ? Date.parse(f.from + 'T00:00') : -Infinity;
    const to = f.to ? Date.parse(f.to + 'T23:59:59') : Infinity;
    return TRANSACTIONS.filter(t => (!q || (t.id + ' ' + t.player + ' ' + t.ref).toLowerCase().includes(q))
      && (!f.status || t.status === f.status) && (!f.type || t.type === f.type) && (!f.gateway || t.gateway === f.gateway)
      && (!f.method || t.method === f.method) && (!f.currency || t.currency === f.currency) && (!f.country || t.country === f.country)
      && (!f.zone || t.zone === f.zone) && t.ts >= from && t.ts <= to);
  }, [f]);
  const sel1 = (k, label, opts, fmtOpt) => (
    <label className="fld">{NexLuckI18n.t(label)}<select value={f[k]} onChange={e => set(k, e.target.value)}><option value="">{NexLuckI18n.t("All")}</option>{opts.map(o => <option key={o} value={o}>{NexLuckI18n.t(fmtOpt ? fmtOpt(o) : o)}</option>)}</select></label>
  );
  const dirty = JSON.stringify(f) !== JSON.stringify(empty);
  const total = rows.filter(t => t.status === 'Approved').reduce((s, t) => s + (t.currency === 'EUR' ? t.amount : 0), 0);
  return (
    <>
      <div className="tools" style={{ margin: '8px 0 0' }}><FinanceMenu current="/crm/f/transactions/" /></div>
      <div className="ff">
        <label className="fld q">{NexLuckI18n.t("Search")}<input type="text" placeholder={NexLuckI18n.t("Transaction ID, player or gateway reference…")} value={f.q} onChange={e => set('q', e.target.value)} /></label>
        {sel1('status', NexLuckI18n.t("Status"), TX_STATUSES)}
        {sel1('type', NexLuckI18n.t("Type"), TX_TYPES)}
        {sel1('gateway', NexLuckI18n.t("Gateway"), uniq('gateway'))}
        {sel1('method', NexLuckI18n.t("Payment method"), uniq('method'))}
        {sel1('currency', NexLuckI18n.t("Currency"), uniq('currency'))}
        {sel1('country', NexLuckI18n.t("Country"), uniq('country'), c => COUNTRIES[c][0])}
        {sel1('zone', NexLuckI18n.t("Geo zone"), ZONES)}
        <DateField label={NexLuckI18n.t("From")} value={f.from} onChange={v => set('from', v)} />
        <DateField label={NexLuckI18n.t("To")} value={f.to} onChange={v => set('to', v)} />
        {dirty && <button className="link" style={{ paddingBottom: 10 }} onClick={() => { setF(empty); setShown(PAGE); }}>{NexLuckI18n.t("Clear filters")}</button>}
      </div>
      <p className="count">{rows.length}{NexLuckI18n.t(" of ")}{TRANSACTIONS.length}{NexLuckI18n.t(" transactions · approved EUR volume ")}{money(total, 'EUR')}</p>
      <div className="wrap">
        <table className="bt" style={{ minWidth: 980 }}>
          <thead><tr><th>{NexLuckI18n.t("Transaction")}</th><th>{NexLuckI18n.t("Date")}</th><th>{NexLuckI18n.t("Player")}</th><th>{NexLuckI18n.t("Type")}</th><th>{NexLuckI18n.t("Gateway")}</th><th>{NexLuckI18n.t("Method")}</th><th>{NexLuckI18n.t("Country")}</th><th style={{ textAlign: 'right' }}>{NexLuckI18n.t("Amount")}</th><th>{NexLuckI18n.t("Status")}</th></tr></thead>
          <tbody>
            {rows.slice(0, shown).map(t => (
              <tr key={t.id} onClick={() => setSel(t)}>
                <td><button className="id" onClick={e => { e.stopPropagation(); setSel(t); }}>{t.id}</button></td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmt(t.ts)}</td>
                <td>{t.player}</td><td>{NexLuckI18n.t(t.type)}</td><td>{t.gateway}</td><td>{t.method}</td>
                <td><span className="tag c" title={COUNTRIES[t.country][0]}>{t.country}</span><span className="tag z">{t.zone}</span></td>
                <td className="num">{money(t.amount, t.currency)}</td>
                <td><span className={'st ' + t.status} title={t.reason}>{NexLuckI18n.t(t.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">{NexLuckI18n.t("No transactions match these filters.")}</div>}
      </div>
      {rows.length > shown && <div className="pg"><button className="new-btn" onClick={() => setShown(s => s + PAGE)}>{NexLuckI18n.t("Show more (")}{rows.length - shown})</button></div>}
      {sel && <Details t={sel} onClose={() => setSel(null)} />}
    </>
  );
}

CRMContext.mount(() => ReactDOM.createRoot(document.getElementById('root')).render(<Transactions />));
