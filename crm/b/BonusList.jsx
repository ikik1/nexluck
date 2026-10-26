const { useState, useEffect, useRef, useCallback } = React;
const API = '/crm/ui-api/v1';
const STEP = 20;
const GROUPS = [
  ['status', NexLuckI18n.t("Status"), [['active', NexLuckI18n.t("Active")], ['inactive', NexLuckI18n.t("Inactive")], ['auto', NexLuckI18n.t("Auto-generated")]]],
  ['promo', NexLuckI18n.t("Promotion"), [['banner', NexLuckI18n.t("With banner")], ['nobanner', NexLuckI18n.t("No banner")]]],
  ['bonusType', NexLuckI18n.t("Type"), ['dep match', 'no-deposit', 'free spins', 'cashback', 'multiplier'].map(t => [t, t])]
];
const fmt = value => new Intl.DateTimeFormat(NexLuckI18n.formatLocale, { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
const eur = n => '\u20ac' + n.toLocaleString(NexLuckI18n.formatLocale);

const BonusSegmentTag = NexLuckSegmentTags.createSegmentTag(React);
function BonusRow({ b, onEdit }) {
  const segmentCatalog = NexLuckSegmentTags.useCatalog(React);
  const p = b.bonusValue > 0 ? Math.min(100, Math.round(b.wagered / b.bonusValue * 100)) : 0;
  const on = b.status !== 'inactive';
  return (
    <tr className={b.status + (b.deleted ? ' deleted' : '')} data-id={b.id}>
      <td className="bn">
        <div className="bn-top"><span className="name">{b.name}</span></div>
        <div className="bn-bot"><span className="info" data-id={'ID: ' + b.id} title={NexLuckI18n.t("ID: ") + b.id}>{NexLuckI18n.t("i")}</span><span className="promo">{NexLuckI18n.t(b.bonusType)}</span>{b.hasPromo && <span className="promo">{NexLuckI18n.t("Has promo")}</span>}</div>
      </td>
      <td><span className={'st ' + (on ? 'on' : 'off')}>{on ? NexLuckI18n.t("Active") : NexLuckI18n.t("Inactive")}</span></td>
      <td className="num">{fmt(b.createdAt)}</td>
      <td className="num">{fmt(b.dateStart)}</td>
      <td className="num">{fmt(b.dateEnd)}</td>
      <td className="give"><a href="#" title={NexLuckI18n.t("Open event")}>{NexLuckI18n.t(b.event)}</a></td>
      <td className="pb"><div className="bar"><i style={{ width: p + '%' }}></i></div><small>{eur(b.bonusValue)} / {eur(b.wagered)} ({p}%)</small></td>
      <td className="num">{eur(b.wins)}</td>
      <td className="num">{eur(b.wagered)}</td>
      <td className="grp">{b.groups.map(g => <BonusSegmentTag key={g} className="promo" segment={g} segments={segmentCatalog} />)}</td>
      <td className="num">{b.received.toLocaleString(NexLuckI18n.formatLocale)}</td>
      <td className="ed"><button className="edit" title={NexLuckI18n.t("Modify")} aria-label={NexLuckI18n.t("Modify ") + b.name} onClick={() => onEdit(b)}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 14.75V17h2.25L15.9 6.35l-2.25-2.25L3 14.75Z" /><path d="m12.8 5.2 2.25 2.25M3 17h14" /></svg>
      </button></td>
    </tr>
  );
}

function ContextMenu({ menu, onDelete, onCopy, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });
  useEffect(() => {
    const key = e => e.key === 'Escape' && onClose();
    document.addEventListener('click', onClose);
    document.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('click', onClose);
      document.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  useEffect(() => {
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.min(menu.x, innerWidth - r.width - 4), top: Math.min(menu.y, innerHeight - r.height - 4) });
  }, [menu.x, menu.y]);
  return (
    <div id="ctx" ref={ref} style={{ display: 'block', ...pos }}>
      <div onClick={() => onDelete(menu.bonus)}>{NexLuckI18n.t("Mark as deleted")}</div>
      <div onClick={() => onCopy(menu.bonus)}>{NexLuckI18n.t("Copy")}</div>
      <div className="dis" aria-disabled="true">{NexLuckI18n.t("Paste")}</div>
    </div>
  );
}

function BonusList() {
  const [sel, setSel] = useState({ status: [], promo: [], bonusType: [] });
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const anySel = GROUPS.some(([g]) => sel[g].length);
  const toggle = (g, v) => setSel(s => ({ ...s, [g]: s[g].includes(v) ? s[g].filter(x => x !== v) : s[g].concat(v) }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [menu, setMenu] = useState(null);
  const ctrl = useRef(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async (offset) => {
    if (ctrl.current) ctrl.current.abort();
    const c = ctrl.current = new AbortController();
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ status: sel.status.join(','), promo: sel.promo.join(','), bonusType: sel.bonusType.join(','), q: query, offset, limit: STEP });
      const res = await CRMContext.fetch(`${API}/bonuses?${params}`, { signal: c.signal });
      if (!res.ok) throw new Error(NexLuckI18n.t("Server returned ") + res.status);
      const data = await res.json();
      setItems(prev => offset ? prev.concat(data.items) : data.items);
      setTotal(data.total); setCounts(data.counts); setLoading(false);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError(e.message); setLoading(false);
    }
  }, [sel, query]);

  useEffect(() => { load(0); return () => ctrl.current && ctrl.current.abort(); }, [load]);

  const markDeleted = async (b) => {
    setMenu(null);
    try {
      const res = await CRMContext.fetch(`${API}/bonuses/${encodeURIComponent(b.id)}/delete`, { method: 'POST' });
      if (!res.ok) throw new Error(NexLuckI18n.t("Server returned ") + res.status);
      const upd = await res.json();
      setItems(prev => prev.map(x => x.id === upd.id ? upd : x));
    } catch (e) { setError(e.message); }
  };
  const copy = (b) => {
    setMenu(null);
    if (navigator.clipboard) navigator.clipboard.writeText(JSON.stringify(b)).catch(() => {});
  };
  const newBonus = (ai) => { location.href = '/crm/b/e/?new=1' + (ai ? '&ai=1' : ''); };

  return (
    <>
      <div className="tools">
        <input className="search" type="search" placeholder={NexLuckI18n.t("Search bonuses by name or ID…")} value={q} onChange={e => setQ(e.target.value)} />
        <div className="new-actions">
          <button className="new-btn" onClick={() => newBonus(false)}>{NexLuckI18n.t("＋ New empty bonus")}</button>
          <button className="new-btn ai" onClick={() => newBonus(true)}><span aria-hidden="true">✦</span>{NexLuckI18n.t(" New with AI agent")}</button>
        </div>
      </div>
      <div className="filters">
        <button className={'chip' + (anySel ? '' : ' on')} onClick={() => setSel({ status: [], promo: [], bonusType: [] })}>{NexLuckI18n.t("All")}<span>{counts.total ?? '…'}</span></button>
        {GROUPS.map(([g, title, opts]) => (
          <div className="fgroup" key={g}>
            <small className="ftitle">{NexLuckI18n.t(title)}</small>
            {opts.map(([v, label]) => (
              <button key={v} className={'chip' + (sel[g].includes(v) ? ' on' : '')} aria-pressed={sel[g].includes(v)} onClick={() => toggle(g, v)}>{NexLuckI18n.t(label)}<span>{counts[g]?.[v] ?? '…'}</span></button>
            ))}
          </div>
        ))}
      </div>
      <div className="wrap">
        <table className="bt">
          <thead><tr><th>{NexLuckI18n.t("Bonus")}</th><th>{NexLuckI18n.t("Status")}</th><th>{NexLuckI18n.t("Created at")}</th><th>{NexLuckI18n.t("Date start")}</th><th>{NexLuckI18n.t("Date end")}</th><th>{NexLuckI18n.t("Triggers on")}</th><th>{NexLuckI18n.t("Bonus value / wagered")}</th><th>{NexLuckI18n.t("Total wins")}</th><th>{NexLuckI18n.t("Total wagered")}</th><th>{NexLuckI18n.t("Segments")}</th><th>{NexLuckI18n.t("Received by")}</th><th>{NexLuckI18n.t("Edit")}</th></tr></thead>
          <tbody onContextMenu={e => {
            const tr = e.target.closest('tr[data-id]');
            if (!tr) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, bonus: items.find(b => b.id === tr.dataset.id) });
          }}>
            {items.map(b => <BonusRow key={b.id} b={b} onEdit={(row) => { location.href = '/crm/b/e/?id=' + encodeURIComponent(row.id); }} />)}
            {!items.length && !loading && !error && <tr><td colSpan="12" className="empty">{NexLuckI18n.t("No bonuses found")}</td></tr>}
            {error && <tr><td colSpan="12" className="empty">{NexLuckI18n.t("Failed to load: ")}{error} <button onClick={() => load(items.length)}>{NexLuckI18n.t("Retry")}</button></td></tr>}
          </tbody>
        </table>
        <div className="more">
          {loading && <small>{NexLuckI18n.t("Loading…")}</small>}
          {!loading && total > 0 && <small>{NexLuckI18n.t("Showing ")}{items.length}{NexLuckI18n.t(" of ")}{total}</small>}
          {!loading && items.length < total && <button onClick={() => load(items.length)}>{NexLuckI18n.t("Show more")}</button>}
        </div>
      </div>
      {menu && <ContextMenu menu={menu} onDelete={markDeleted} onCopy={copy} onClose={closeMenu} />}
    </>
  );
}

CRMContext.mount(() => ReactDOM.createRoot(document.getElementById('root')).render(<BonusList />));
