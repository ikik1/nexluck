const { useState, useMemo, useEffect, useRef } = React;

const COUNTRY_LIST = Object.keys(COUNTRIES).sort((a, b) => COUNTRIES[a][0].localeCompare(COUNTRIES[b][0]));
const TYPE_LABEL = { success: 'By success rate', decline: 'By decline reason' };
const defaultValue = type => type === 'decline' ? DECLINE_REASONS[0] : 80;

function PspPicker({ onPick, onCancel }) {
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.focus(); }, []);
  const list = PAYMENT_CONNECTIONS.filter(c => (c.name + ' ' + c.brand + ' ' + (c.methods || []).join(' ')).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  const key = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHl(i => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHl(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && list[hl]) { e.preventDefault(); onPick(list[hl].name); }
    else if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
  };
  return (
    <div className="pick">
      <input ref={ref} type="text" placeholder="Type to search payment connection by name, brand, method…" value={q} onChange={e => { setQ(e.target.value); setHl(0); }} onKeyDown={key} aria-label="Search payment connection" />
      <ul role="listbox">
        {list.map((c, i) => (
          <li key={c.id} role="option" aria-selected={i === hl} className={i === hl ? 'hl' : ''} onMouseDown={e => { e.preventDefault(); onPick(c.name); }}>
            <span><b>{c.name}</b> <small style={{ color: 'var(--brand)', marginLeft: 6 }}>({c.brand})</small></span>
            <small>{c.currency} · {c.methods ? c.methods.slice(0, 3).join(', ') : ''} · {c.countries ? c.countries.slice(0, 4).join(', ') : ''}</small>
          </li>
        ))}
        {!list.length && <li style={{ cursor: 'default' }}>No payment connection found</li>}
      </ul>
      <div style={{ marginTop: 6 }}><button className="link" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function Step({ s, i, n, type, onChange, onRemove, onMove, onInsert, picking, setPicking }) {
  const cur = i === picking;
  return (
    <>
      <div className="step" style={{ '--off': Math.min(i, 6) * 24 + 'px', marginLeft: Math.min(i, 6) * 24 }}>
        <div className="sn">{i + 1}</div>
        <div>
          <div className="sname">{s.psp}</div>
          <div className="sval">
            {type === 'success'
              ? <><label>Success rate threshold</label><input type="number" min="0" max="100" step="1" value={s.value} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} aria-label={'Success rate threshold for step ' + (i + 1)} />%</>
              : <><label>Decline reason</label><select value={s.value} onChange={e => onChange(e.target.value)} aria-label={'Decline reason for step ' + (i + 1)}>{DECLINE_REASONS.map(r => <option key={r}>{r}</option>)}</select></>}
          </div>
        </div>
        <div className="sact">
          <button className="ib" onClick={() => setPicking(cur ? null : i)} title="Insert a payment connection after this step">Insert</button>
          <button className="ib del" onClick={onRemove} title="Remove this step">Remove</button>
          <button className="ib" disabled={i === 0} onClick={() => onMove(-1)} aria-label="Move up">↑ Up</button>
          <button className="ib" disabled={i === n - 1} onClick={() => onMove(1)} aria-label="Move down">↓ Down</button>
        </div>
        {cur && <PspPicker onPick={onInsert} onCancel={() => setPicking(null)} />}
      </div>
      {i < n - 1 && (
        <div className="arrow" style={{ marginLeft: Math.min(i, 6) * 24 + 22 }}>
          <svg viewBox="0 0 18 26" aria-hidden="true"><path d="M9 0v20M3 15l6 7 6-7" fill="none" stroke="#0b5cab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {type === 'success' ? <>if success rate &lt; {s.value === '' ? '?' : s.value}% → next</> : <>on “{s.value}” → next</>}
        </div>
      )}
    </>
  );
}

function CascadeEditor({ cascade, onSave, onClose }) {
  const [c, setC] = useState(() => JSON.parse(JSON.stringify(cascade)));
  const [picking, setPicking] = useState(null);
  const [errs, setErrs] = useState([]);
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const set = (k, v) => setC(x => ({ ...x, [k]: v }));
  const setType = t => setC(x => ({ ...x, type: t, steps: x.steps.map(s => ({ ...s, value: defaultValue(t) })) }));
  const setCountry = v => setC(x => ({ ...x, country: v, zone: v ? zoneOf(v) : x.zone }));
  const setZone = v => setC(x => ({ ...x, zone: v, country: x.country && v && zoneOf(x.country) !== v ? '' : x.country }));
  const toggleSeg = s => setC(x => ({ ...x, segments: x.segments.includes(s) ? x.segments.filter(y => y !== s) : [...x.segments, s] }));
  const patchStep = (i, v) => setC(x => ({ ...x, steps: x.steps.map((s, j) => j === i ? { ...s, value: v } : s) }));
  const removeStep = i => { setC(x => ({ ...x, steps: x.steps.filter((_, j) => j !== i) })); setPicking(null); };
  const move = (i, d) => setC(x => { const a = x.steps.slice(); [a[i], a[i + d]] = [a[i + d], a[i]]; return { ...x, steps: a }; });
  const insertAfter = (i, psp) => { setC(x => { const a = x.steps.slice(); a.splice(i + 1, 0, { psp, value: defaultValue(x.type) }); return { ...x, steps: a }; }); setPicking(null); };
  const save = () => {
    const e = [];
    if (!c.name.trim()) e.push('Enter a cascade name.');
    if (!c.steps.length) e.push('Add at least one payment connection.');
    if (c.type === 'success' && c.steps.some(s => s.value === '' || s.value < 0 || s.value > 100)) e.push('Success rate thresholds must be between 0 and 100.');
    setErrs(e);
    if (!e.length) onSave({ ...c, name: c.name.trim() });
  };
  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg wide" role="dialog" aria-modal="true" aria-label="Edit cascade">
        <h2>{cascade.id ? 'Edit cascade' : 'New cascade'} <button className="x" onClick={onClose} aria-label="Close">×</button></h2>
        <label className="fld">Name<input type="text" value={c.name} maxLength={80} onChange={e => set('name', e.target.value)} /></label>
        <div className="cfg">
          <label className="fld">Type<select value={c.type} onChange={e => setType(e.target.value)}>{Object.keys(TYPE_LABEL).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
          <label className="fld">Country (optional)<select value={c.country} onChange={e => setCountry(e.target.value)}><option value="">Any country</option>{COUNTRY_LIST.map(k => <option key={k} value={k}>{COUNTRIES[k][0]}</option>)}</select></label>
          <label className="fld">Geo zone (optional)<select value={c.zone} onChange={e => setZone(e.target.value)}><option value="">Any zone</option>{ZONES.map(z => <option key={z}>{z}</option>)}</select></label>
          <label className="fld">Payment method (optional)<select value={c.method} onChange={e => set('method', e.target.value)}><option value="">Any method</option>{METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
          <label className="fld">Currency (optional)<select value={c.currency} onChange={e => set('currency', e.target.value)}><option value="">Any currency</option>{CURRENCIES.map(m => <option key={m}>{m}</option>)}</select></label>
        </div>
        <div className="sec">Segments (optional)</div>
        <div className="segs">{ALL_SEGMENTS.map(s => (
          <label key={s} className={'tag-chk' + (c.segments.includes(s) ? ' on' : '')}>
            <input type="checkbox" checked={c.segments.includes(s)} onChange={() => toggleSeg(s)} />
            <span>{s}</span>
          </label>
        ))}</div>
        <div className="sec">Waterfall: {c.type === 'success' ? 'a transaction falls to the next connection when the success rate drops below the threshold' : 'a transaction falls to the next connection on the selected decline reason'}</div>
        <div className="wf">
          {c.steps.map((s, i) => <Step key={i + s.psp} s={s} i={i} n={c.steps.length} type={c.type} picking={picking} setPicking={setPicking}
            onChange={v => patchStep(i, v)} onRemove={() => removeStep(i)} onMove={d => move(i, d)} onInsert={psp => insertAfter(i, psp)} />)}
          {!c.steps.length && <div style={{ margin: '4px 0 8px' }}>
            {picking === -1 ? <div className="pick" style={{ border: 0 }}><PspPicker onPick={psp => insertAfter(-1, psp)} onCancel={() => setPicking(null)} /></div>
              : <button className="new-btn" onClick={() => setPicking(-1)}>+ Add the first payment connection</button>}
          </div>}
        </div>
        {errs.map(e => <div key={e} className="err" role="alert">{e}</div>)}
        <div className="dfoot"><button className="new-btn" onClick={onClose}>Cancel</button><button className="new-btn pri" onClick={save}>Save cascade</button></div>
      </div>
    </div>
  );
}

function Cascades() {
  const [list, setList] = useState(CASCADES);
  const [country, setCountry] = useState('');
  const [zone, setZone] = useState('');
  const [edit, setEdit] = useState(null);
  const rows = useMemo(() => list.filter(c => {
    if (country && c.country !== country) return false;
    if (zone && c.zone !== zone && !(c.country && zoneOf(c.country) === zone)) return false;
    return true;
  }), [list, country, zone]);
  const save = c => {
    setList(l => c.id ? l.map(x => x.id === c.id ? c : x) : [...l, { ...c, id: Math.max(0, ...l.map(x => x.id)) + 1 }]);
    setEdit(null);
  };
  const blank = { id: 0, name: '', type: 'success', country: '', zone: '', segments: [], method: '', currency: '', steps: [] };
  return (
    <>
      <div className="filters2">
        <FinanceMenu current="/crm/f/cascades/" />
        <label className="fld">Country<select value={country} onChange={e => setCountry(e.target.value)}><option value="">All countries</option>{COUNTRY_LIST.map(k => <option key={k} value={k}>{COUNTRIES[k][0]}</option>)}</select></label>
        <label className="fld">Geo zone<select value={zone} onChange={e => setZone(e.target.value)}><option value="">All zones</option>{ZONES.map(z => <option key={z}>{z}</option>)}</select></label>
        {(country || zone) && <button className="link" onClick={() => { setCountry(''); setZone(''); }} style={{ paddingBottom: 10 }}>Clear filters</button>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="new-btn pri" onClick={() => setEdit(blank)}>+ New cascade</button>
        </div>
      </div>
      <p className="count">{rows.length} of {list.length} cascades</p>
      <div className="wrap">
        <table className="bt" style={{ minWidth: 860 }}>
          <thead><tr><th>Name</th><th>Country</th><th>Segments</th><th>Geo zone</th><th>Edit</th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td><div className="brand-n">{c.name}</div><div className="desc">{TYPE_LABEL[c.type]} · {c.steps.map(s => s.psp).join(' → ') || 'no steps'}</div></td>
                <td>{c.country ? COUNTRIES[c.country][0] : <span className="desc">All</span>}</td>
                <td>{c.segments.length ? c.segments.map(s => <span key={s} className="tag">{s}</span>) : <span className="desc">All</span>}</td>
                <td>{c.zone ? <span className="tag z">{c.zone}</span> : <span className="desc">All</span>}</td>
                <td className="ed"><button className="edit" title="Edit" aria-label={'Edit ' + c.name} onClick={() => setEdit(c)}>
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 14.75V17h2.25L15.9 6.35l-2.25-2.25L3 14.75Z" /><path d="m12.8 5.2 2.25 2.25M3 17h14" /></svg>
                </button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">No cascades match these filters.</div>}
      </div>
      {edit && <CascadeEditor cascade={edit} onSave={save} onClose={() => setEdit(null)} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Cascades />);
