const { useState, useEffect, useRef, useCallback } = React;
const API = '/crm/ui-api/v1';
const STEP = 20;
const GROUPS = [
  ['status', 'Status', [['active', 'Active'], ['inactive', 'Inactive'], ['auto', 'Auto-generated']]],
  ['promo', 'Promotion', [['banner', 'With banner'], ['nobanner', 'No banner']]],
  ['bonusType', 'Type', ['dep match', 'no-deposit', 'free spins', 'cashback', 'multiplier'].map(t => [t, t])]
];
const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const eur = n => '\u20ac' + n.toLocaleString('en-US');

function BonusRow({ b, onEdit }) {
  const p = b.bonusValue > 0 ? Math.min(100, Math.round(b.wagered / b.bonusValue * 100)) : 0;
  const on = b.status !== 'inactive';
  return (
    <tr className={b.status + (b.deleted ? ' deleted' : '')} data-id={b.id}>
      <td className="bn">
        <div className="bn-top"><span className="name">{b.name}</span></div>
        <div className="bn-bot"><span className="info" data-id={'ID: ' + b.id} title={'ID: ' + b.id}>i</span><span className="promo">{b.bonusType}</span>{b.hasPromo && <span className="promo">Has promo</span>}</div>
      </td>
      <td><span className={'st ' + (on ? 'on' : 'off')}>{on ? 'Active' : 'Inactive'}</span></td>
      <td className="num">{fmt(b.createdAt)}</td>
      <td className="num">{fmt(b.dateStart)}</td>
      <td className="num">{fmt(b.dateEnd)}</td>
      <td className="give"><a href="#" title="Open event">{b.event}</a></td>
      <td className="pb"><div className="bar"><i style={{ width: p + '%' }}></i></div><small>{eur(b.bonusValue)} / {eur(b.wagered)} ({p}%)</small></td>
      <td className="num">{eur(b.wins)}</td>
      <td className="num">{eur(b.wagered)}</td>
      <td className="grp">{b.groups.join(', ')}</td>
      <td className="num">{b.received.toLocaleString('en-US')}</td>
      <td className="ed"><button className="edit" title="Modify" aria-label={'Modify ' + b.name} onClick={() => onEdit(b)}>
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
      <div onClick={() => onDelete(menu.bonus)}>Mark as deleted</div>
      <div onClick={() => onCopy(menu.bonus)}>Copy</div>
      <div className="dis" aria-disabled="true">Paste</div>
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
      const res = await fetch(`${API}/bonuses?${params}`, { signal: c.signal });
      if (!res.ok) throw new Error('Server returned ' + res.status);
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
      const res = await fetch(`${API}/bonuses/${encodeURIComponent(b.id)}/delete`, { method: 'POST' });
      if (!res.ok) throw new Error('Server returned ' + res.status);
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
        <input className="search" type="search" placeholder="Search bonuses by name or ID…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="new-actions">
          <button className="new-btn" onClick={() => newBonus(false)}>＋ New empty bonus</button>
          <button className="new-btn ai" onClick={() => newBonus(true)}><span aria-hidden="true">✦</span> New with AI agent</button>
        </div>
      </div>
      <div className="filters">
        <button className={'chip' + (anySel ? '' : ' on')} onClick={() => setSel({ status: [], promo: [], bonusType: [] })}>All<span>{counts.total ?? '…'}</span></button>
        {GROUPS.map(([g, title, opts]) => (
          <div className="fgroup" key={g}>
            <small className="ftitle">{title}</small>
            {opts.map(([v, label]) => (
              <button key={v} className={'chip' + (sel[g].includes(v) ? ' on' : '')} aria-pressed={sel[g].includes(v)} onClick={() => toggle(g, v)}>{label}<span>{counts[g]?.[v] ?? '…'}</span></button>
            ))}
          </div>
        ))}
      </div>
      <div className="wrap">
        <table className="bt">
          <thead><tr><th>Bonus</th><th>Status</th><th>Created at</th><th>Date start</th><th>Date end</th><th>Triggers on</th><th>Bonus value / wagered</th><th>Total wins</th><th>Total wagered</th><th>Segments</th><th>Received by</th><th>Edit</th></tr></thead>
          <tbody onContextMenu={e => {
            const tr = e.target.closest('tr[data-id]');
            if (!tr) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, bonus: items.find(b => b.id === tr.dataset.id) });
          }}>
            {items.map(b => <BonusRow key={b.id} b={b} onEdit={(row) => { location.href = '/crm/b/e/?id=' + encodeURIComponent(row.id); }} />)}
            {!items.length && !loading && !error && <tr><td colSpan="12" className="empty">No bonuses found</td></tr>}
            {error && <tr><td colSpan="12" className="empty">Failed to load: {error} <button onClick={() => load(items.length)}>Retry</button></td></tr>}
          </tbody>
        </table>
        <div className="more">
          {loading && <small>Loading…</small>}
          {!loading && total > 0 && <small>Showing {items.length} of {total}</small>}
          {!loading && items.length < total && <button onClick={() => load(items.length)}>Show more</button>}
        </div>
      </div>
      {menu && <ContextMenu menu={menu} onDelete={markDeleted} onCopy={copy} onClose={closeMenu} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<BonusList />);
