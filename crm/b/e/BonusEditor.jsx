const { useState, useEffect, useRef, useLayoutEffect } = React;
const API = '/crm/ui-api/v1';
const QUERY = new URLSearchParams(location.search);
const ID = QUERY.get('id');
const NEW = QUERY.get('new') === '1';
const AI_MODE = QUERY.get('ai') === '1';

const TYPES = ['dep match', 'no-deposit', 'free spins', 'cashback', 'multiplier'];
const CATEGORIES = [
  ['SLOTS', 'Typical contribution - 100%'], ['TABLE_GAMES', ''], ['LIVE_CASINO', ''], ['CRASH', ''],
];
const INCLUDE = ['registered', 'no_deposit', 'kyc_verified'];
const EXCLUDE = ['restricted_countries', 'restricted_currencies'];
const APPLIES = ['BONUS_ONLY', 'BONUS_PLUS_DEPOSIT', 'WINNINGS_ONLY'];
const WALLET = ['MAIN_WALLET_FIRST', 'BONUS_MONEY_FIRST'];
const PAYMENT_METHODS = ['SKRILL', 'NETELLER', 'CRYPTO'];
const KYC_LEVELS = ['NONE', 'VERIFIED_EMAIL', 'VERIFIED_ID', 'VERIFIED_ID_AND_ADDRESS'];
const APPLIES_HINT =
  'BONUS_ONLY - The wagering multiplier applies strictly to the issued Bonus Amount.\n' +
  'BONUS_PLUS_DEPOSIT - The wagering multiplier applies to the sum of the Deposit Amount + Bonus Amount.\n' +
  'WINNINGS_ONLY - Common in Free Spins campaigns where no fixed bonus amount is awarded upfront.';
const DMP_HINT =
  '100 (Standard Match): If a player deposits $100, the casino adds $100 in bonus funds ($100 × 100%). Total balance: $200.';

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setIn = (o, path, v) => {
  const [k, ...rest] = path.split('.');
  return { ...o, [k]: rest.length ? setIn(o[k] || {}, rest.join('.'), v) : v };
};
const pick = (b) => ({
  name: b.name, description: b.description, status: b.status === 'inactive' ? 'inactive' : 'active',
  bonusType: b.bonusType, category: b.category, availability: b.availability, triggers: b.triggers,
  reward: b.reward, wagering: b.wagering, walletRules: b.walletRules, antiBonusHunter: b.antiBonusHunter,
});
const emptyBonus = () => ({
  name: '', description: '', status: '', bonusType: '', category: '',
  availability: { startTime: '', endTime: '', includeSegments: [], excludeSegments: [] },
  triggers: { event: '', minDeposit: '', maxDeposit: '', depositNumber: '' },
  reward: { dmp: '', maxBonusAmount: '' },
  wagering: { multiplier: '', timeToCompleteDays: '', maxBetPerRound: '', appliesTo: '',
    maxWithdrawCap: { type: '', value: '' } },
  walletRules: { deduction: '', winnings: '', allowCancelBeforeWagering: false, allowWithdrawBeforeWagering: false },
  antiBonusHunter: { maxClaimsPerIp: '', maxClaimsPerDevice: '', blockSharedIpSubnets: false,
    blockKnownVpnsAndProxies: false, paymentMethodBlacklist: [], requireKycLevelBeforeClaim: '',
    maxBetPerRound: '', maxBetPercentageOfBonus: '', restrictZeroRiskBetting: false,
    minEvenMoneyCoveragePercentage: '' },
});
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('en-US');
const api = async (path, opts) => {
  const r = await fetch(API + path, opts && opts.body ? { ...opts, headers: { 'Content-Type': 'application/json' } } : opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || 'Request failed'), { fields: body.fields || {}, status: r.status });
  return body;
};

function Hint({ text }) {
  return <button type="button" className="hint" aria-label="Hint">?<span className="tip" style={{ whiteSpace: 'pre-line' }}>{text}</span></button>;
}

function Field({ label, hint, error, children }) {
  return (
    <div className={'f' + (error ? ' err' : '')}>
      <span className="lbl">{label}{hint && <Hint text={hint} />}</span>
      {children}
      {error && <span className="emsg">{error}</span>}
    </div>
  );
}

function Modal({ title, onClose, children, actions, className = '' }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="ovl" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal ' + className} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <div className="acts">{actions}</div>
      </div>
    </div>
  );
}

function Money({ label, hint, path, form, set, errors, openRates }) {
  const v = get(form, path);
  return (
    <Field label={label} hint={hint} error={errors[path]}>
      <div className="money">
        <input type="number" min="0" step="any" value={v ?? ''} onChange={(e) => set(path, e.target.value === '' ? '' : Number(e.target.value))} />
        <button type="button" className="cur" title="Adjust exchange rates" onClick={() => openRates(Number(v) || 0)}>EUR</button>
      </div>
    </Field>
  );
}

function Num({ label, hint, path, form, set, errors, int, suffix }) {
  return (
    <Field label={label} hint={hint} error={errors[path]}>
      <input type="number" min="0" step={int ? 1 : 'any'} value={get(form, path) ?? ''} onChange={(e) => set(path, e.target.value === '' ? '' : Number(e.target.value))} />
    </Field>
  );
}

function Select({ label, hint, path, form, set, errors, options, labels }) {
  return (
    <Field label={label} hint={hint} error={errors[path]}>
      <select value={get(form, path) ?? ''} onChange={(e) => set(path, e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{labels ? labels[o] : o}</option>)}
      </select>
    </Field>
  );
}

function Multi({ label, path, form, set, errors, options }) {
  const sel = get(form, path) || [];
  const toggle = (o) => set(path, sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]);
  return (
    <Field label={label} error={errors[path]}>
      <div className="chips">
        {options.map((o) => (
          <label key={o} className={'chk' + (sel.includes(o) ? ' on' : '')}>
            <input type="checkbox" checked={sel.includes(o)} onChange={() => toggle(o)} />{o}
          </label>
        ))}
      </div>
    </Field>
  );
}

function Check({ label, path, form, set }) {
  const on = !!get(form, path);
  return (
    <label className={'chk rect' + (on ? ' on' : '')} style={{ marginBottom: 8, display: 'flex' }}>
      <input type="checkbox" checked={on} onChange={(e) => set(path, e.target.checked)} />{label}
    </label>
  );
}

function RatesModal({ amount, onClose }) {
  const [rates, setRates] = useState(null);
  const [draft, setDraft] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/exchange-rates').then((r) => { setRates(r); setDraft(r.rates); }).catch((e) => setErr(e.message));
  }, []);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api('/exchange-rates', { method: 'PATCH', body: JSON.stringify({ rates: draft }) });
      setRates(r); setDraft(r.rates); onClose();
    } catch (e) {
      setErr(Object.entries(e.fields).map(([k, m]) => k + ': ' + m).join('; ') || e.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Exchange rates (per 1 EUR)" onClose={onClose}
      actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={!rates || busy} onClick={save}>Save rates</button></>}>
      {err && <div className="msg bad" style={{ marginBottom: 8 }}>{err}</div>}
      {!rates ? 'Loading…' : (
        <>
          <p className="kvl">Rates apply to all bonuses. Amounts are stored in EUR; other currencies are converted with these rates.{amount ? <> Current value: <b>{fmt(amount)} EUR</b>.</> : null}</p>
          <table className="rt">
            <thead><tr><th>Currency</th><th>Rate</th><th>{fmt(amount || 1)} EUR =</th></tr></thead>
            <tbody>
              {Object.keys(draft).map((c) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td><input type="number" min="0" step="any" value={draft[c]} onChange={(e) => setDraft({ ...draft, [c]: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                  <td>{fmt((amount || 1) * (Number(draft[c]) || 0))} {c}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="kvl" style={{ marginTop: 8 }}>Last updated {new Date(rates.updatedAt).toLocaleString()} by {rates.updatedBy}.</p>
        </>
      )}
    </Modal>
  );
}

function CategoryModal({ value, onPick, onClose }) {
  return (
    <Modal title="Category" onClose={onClose} actions={<button className="btn" onClick={onClose}>Close</button>}>
      {CATEGORIES.map(([c, h]) => (
        <div key={c} className={'opt' + (value === c ? ' on' : '')} onClick={() => { onPick(c); onClose(); }}>
          <input type="radio" readOnly checked={value === c} />
          <div><b>{c}</b>{h && <small>{h}</small>}</div>
        </div>
      ))}
    </Modal>
  );
}

function ChangelogModal({ id, onClose }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/bonuses/${id}/changelog`).then((r) => setItems(r.items)).catch((e) => setErr(e.message)); }, [id]);
  const show = (v) => (v === undefined || v === null || v === '' ? '∅' : Array.isArray(v) ? '[' + v.join(', ') + ']' : String(v));
  return (
    <Modal title={'Changelog — ' + id} onClose={onClose} actions={<button className="btn" onClick={onClose}>Close</button>}>
      {err && <div className="msg bad">{err}</div>}
      {!items && !err && 'Loading…'}
      {items && items.map((c, i) => (
        <div className="cl" key={i}>
          <b>{c.summary}</b> <small>· {new Date(c.at).toLocaleString()} · {c.by}</small>
          {c.changes.length > 0 && <ul>{c.changes.map((x, j) => <li key={j}><code>{x.field}</code>: {show(x.from)} → {show(x.to)}</li>)}</ul>}
        </div>
      ))}
    </Modal>
  );
}

function AIAgentModal({ onClose }) {
  const [prompt, setPrompt] = useState('');
  const [notice, setNotice] = useState('');
  return (
    <Modal title="AI bonus agent" onClose={onClose}
      actions={<><button className="btn" onClick={onClose}>Continue manually</button><button className="btn pri" disabled={!prompt.trim()} onClick={() => setNotice('AI agent integration is not connected yet. Your bonus form remains empty and ready to edit.')}>Ask AI agent</button></>}>
      <p className="kvl">Tell the AI agent what kind of bonus you want to create.</p>
      <textarea autoFocus value={prompt} onChange={(e) => { setPrompt(e.target.value); setNotice(''); }} placeholder="For example: a 100% first-deposit match for registered players…" style={{ width: '100%', minHeight: 100, border: '1px solid var(--line)', borderRadius: 6, padding: 10, font: 'inherit' }} />
      {notice && <div className="msg bad" style={{ marginTop: 10 }}>{notice}</div>}
    </Modal>
  );
}

function PromoCodes({ bonus, dates, setDates, codes, setCodes }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    const result = await api(`/bonuses/${bonus.id}/promo-codes`);
    setCodes(result.items);
  };
  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const item = await api(`/bonuses/${bonus.id}/promo-codes`, {
        method: 'POST',
        body: JSON.stringify({ startTime: dates.startTime, endTime: dates.endTime }),
      });
      setCodes((items) => [...items, item]);
    } catch (e) {
      setError(Object.entries(e.fields).map(([k, v]) => `${k}: ${v}`).join('; ') || e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (code) => {
    if (!window.confirm(`Delete promo code ${code}?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/bonuses/${bonus.id}/promo-codes/${encodeURIComponent(code)}`, { method: 'DELETE' });
      setCodes((items) => items.filter((item) => item.code !== code));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [bonus.id]);

  return (
    <>
      <div className="promo-add">
        <Field label="Valid from">
          <input type="datetime-local" value={dates.startTime} onChange={(e) => setDates((d) => ({ ...d, startTime: e.target.value }))} />
        </Field>
        <Field label="Valid until">
          <input type="datetime-local" value={dates.endTime} onChange={(e) => setDates((d) => ({ ...d, endTime: e.target.value }))} />
        </Field>
        <button type="button" className="btn pri" disabled={busy} onClick={generate}>Generate promo code</button>
      </div>
      {error && <div className="msg bad" style={{ marginTop: 10 }}>{error}</div>}
      {codes.length ? (
        <table className="promo-list">
          <thead><tr><th>Promo code</th><th>Starts</th><th>Ends</th><th></th></tr></thead>
          <tbody>{codes.map((item) => (
            <tr key={item.code}>
              <td><code>{item.code}</code></td>
              <td>{item.startTime.replace('T', ' ')}</td>
              <td>{item.endTime.replace('T', ' ')}</td>
              <td><button type="button" className="btn" disabled={busy} onClick={() => remove(item.code)}>Delete</button></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <div className="promo-empty">No promo codes have been generated for this bonus.</div>}
    </>
  );
}

function SatelliteMap({ title, items, onSelect, onClose }) {
  const root = useRef(null);
  const nodes = useRef({});
  const center = useRef(null);
  const [lines, setLines] = useState([]);

  useLayoutEffect(() => {
    const draw = () => {
      if (!root.current || !center.current) return;
      const bounds = root.current.getBoundingClientRect();
      const centerBounds = center.current.getBoundingClientRect();
      const point = (rect) => ({
        x: rect.left + rect.width / 2 - bounds.left,
        y: rect.top + rect.height / 2 - bounds.top,
      });
      const from = point(centerBounds);
      setLines(items.filter((item) => nodes.current[item.id]).map((item) => {
        const to = point(nodes.current[item.id].getBoundingClientRect());
        return { id: item.id, x1: from.x, y1: from.y, x2: to.x, y2: to.y };
      }));
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(root.current);
    observer.observe(center.current);
    items.forEach((item) => nodes.current[item.id] && observer.observe(nodes.current[item.id]));
    window.addEventListener('resize', draw);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [items, title]);

  return (
    <Modal title="Bonus satellite map" onClose={onClose} className="map-modal"
      actions={<button type="button" className="btn pri" onClick={onClose}>Close map</button>}>
      <p className="kvl">Choose a block to jump to it in the editor.</p>
      <div className="map-grid" ref={root}>
        <svg aria-hidden="true">{lines.map((line) => (
          <line key={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
        ))}</svg>
        <button type="button" className="map-node map-center" ref={center} onClick={() => onSelect('ce')}>
          <small>Bonus</small><strong>{title || 'Untitled bonus'}</strong>
        </button>
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            ref={(node) => { nodes.current[item.id] = node; }}
            className={'map-node map-' + item.id}
            onClick={() => onSelect(item.id)}
          >{item.title}</button>
        ))}
      </div>
    </Modal>
  );
}

function Editor() {
  const [orig, setOrig] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [highlighted, setHighlighted] = useState('');
  const [showAIAgent, setShowAIAgent] = useState(AI_MODE);
  const [sample, setSample] = useState(100);
  const [promoCodes, setPromoCodes] = useState([]);
  const [promoDates, setPromoDates] = useState({ startTime: '', endTime: '' });
  const root = useRef(null);
  const refs = { ce: useRef(null), av: useRef(null), tr: useRef(null), rw: useRef(null), wg: useRef(null), wl: useRef(null), ab: useRef(null), pc: useRef(null) };
  const [lines, setLines] = useState([]);
  const highlightTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const load = () => api('/bonuses/' + ID).then((b) => {
    setOrig(b);
    setForm(pick(b));
    setPromoDates({ startTime: b.availability.startTime, endTime: b.availability.endTime });
  }).catch((e) => setStatus({ bad: true, text: e.message }));
  useEffect(() => {
    document.title = NEW ? 'NextLuck CRM — New bonus' : 'NextLuck CRM — Edit bonus';
    if (ID) load();
    else if (NEW) { setOrig(null); setForm(emptyBonus()); }
    else setStatus({ bad: true, text: 'Missing bonus id' });
  }, []);

  // Connector lines from the central card to each satellite.
  useLayoutEffect(() => {
    if (!form) return;
    const calc = () => {
      const r = root.current.getBoundingClientRect();
      const c = refs.ce.current.getBoundingClientRect();
      const mid = (x) => ({ x: x.left + x.width / 2 - r.left, y: x.top + x.height / 2 - r.top });
      const cc = mid(c);
      setLines(['av', 'tr', 'rw', 'wg', 'wl', 'ab', 'pc'].filter((k) => refs[k].current).map((k) => {
        const b = refs[k].current.getBoundingClientRect();
        const p = mid(b);
        return { k, x1: cc.x, y1: cc.y, x2: p.x, y2: p.y };
      }));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(root.current);
    Object.values(refs).forEach((x) => { if (x.current) ro.observe(x.current); });
    return () => ro.disconnect();
  }, [!!form, !!orig]);

  if (!form) return <><h1>🎁 {NEW ? 'New bonus' : 'Edit bonus'}</h1><p className="lead">Bonus configuration, grouped around the bonus itself.</p>{status ? <div className="msg bad">{status.text}</div> : <p>Loading…</p>}</>;

  const set = (path, v) => { setForm((f) => setIn(f, path, v)); setStatus(null); };
  const creating = NEW && !orig;
  const dirty = creating || JSON.stringify(form) !== JSON.stringify(pick(orig));
  const openRates = (amount) => setModal({ t: 'rates', amount });
  const mapItems = [
    { id: 'av', title: 'Availability' },
    { id: 'tr', title: 'Triggers on' },
    { id: 'rw', title: 'Reward / value' },
    { id: 'wg', title: 'Wagering' },
    { id: 'wl', title: 'Wallet rules' },
    { id: 'ab', title: 'Anti-bonus-hunter' },
    ...(orig ? [{ id: 'pc', title: 'Promo codes' }] : []),
  ];
  const selectMapNode = (id) => {
    setShowMap(false);
    const target = refs[id].current;
    if (!target) return;
    setHighlighted(id);
    window.clearTimeout(highlightTimer.current);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    highlightTimer.current = window.setTimeout(() => setHighlighted(''), 1800);
  };

  const save = async () => {
    setBusy(true); setStatus(null); setErrors({});
    try {
      const b = await api(creating ? '/bonuses' : '/bonuses/' + orig.id, { method: creating ? 'POST' : 'PATCH', body: JSON.stringify(form) });
      setOrig(b); setForm(pick(b));
      if (creating) {
        history.replaceState(null, '', '/crm/b/e/?id=' + encodeURIComponent(b.id));
        setPromoDates({ startTime: b.availability.startTime, endTime: b.availability.endTime });
        setPromoCodes([]);
      }
      setStatus({ text: creating ? 'Bonus created' : 'Saved' });
    } catch (e) {
      setErrors(e.fields || {});
      setStatus({ bad: true, text: e.status === 422 ? 'Please fix the highlighted fields' : e.message });
    }
    setBusy(false);
  };

  const dmp = Number(form.reward.dmp) || 0, mba = Number(form.reward.maxBonusAmount) || 0;
  const calculated = Math.min((Number(sample) || 0) * dmp / 100, mba);
  const cap = form.wagering.maxWithdrawCap;
  const p = { form, set, errors, openRates };

  return (
    <>
      <h1>🎁 {creating ? 'New bonus' : 'Edit bonus'}</h1>
      <p className="lead">Bonus configuration, grouped around the bonus itself.</p>
      <div className="bar">
        <a className="btn" href="/crm/b/">← Back to list</a>
        <span className="sp" />
        {status && <span className={'msg ' + (status.bad ? 'bad' : 'ok')} role="status">{status.text}</span>}
        <button className="btn" disabled={!dirty || busy} onClick={() => { setForm(creating ? emptyBonus() : pick(orig)); setErrors({}); setStatus(null); }}>Discard</button>
        <button className="btn" type="button" onClick={() => setShowMap(true)}>Map</button>
        <button className="btn pri" disabled={!dirty || busy} onClick={save}>{creating ? 'Create bonus' : 'Save changes'}</button>
      </div>

      <div className="sat" ref={root}>
        <svg aria-hidden="true">{lines.map((l) => <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#9bb8d8" strokeWidth="2" strokeDasharray="5 5" />)}</svg>

        <section className={'card center' + (highlighted === 'ce' ? ' map-highlight' : '')} ref={refs.ce} tabIndex="-1">
          <h3>🎁 Bonus</h3>
          <Field label="Name" error={errors.name}><input type="text" value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="ID"><div className="ro">{orig ? orig.id : 'Assigned when saved'}</div></Field>
          <Field label="Description" error={errors.description}><textarea value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <div className="two">
            <Select label="Status" path="status" options={['active', 'inactive']} labels={{ active: 'ACTIVE', inactive: 'NOT ACTIVE' }} {...p} />
            <Select label="Bonus type" path="bonusType" options={TYPES} {...p} />
          </div>
          <Field label="Category" error={errors.category}>
            <button type="button" className="pick" onClick={() => setModal({ t: 'cat' })}><span>{form.category || 'Select category…'}</span><span>▾</span></button>
          </Field>
          <div className="two">
            <Field label="Created at"><div className="ro">{orig ? orig.createdAt : 'Assigned when saved'}</div></Field>
            <Field label="Created by"><div className="ro">{orig ? orig.createdBy : 'Assigned when saved'}</div></Field>
          </div>
          {orig && <button type="button" className="link" onClick={() => setModal({ t: 'log' })}>Changelog →</button>}
        </section>

        <section className={'card' + (highlighted === 'av' ? ' map-highlight' : '')} style={{ gridArea: 'av', '--c': '#2e844a' }} ref={refs.av} tabIndex="-1">
          <h3>Availability</h3>
          <Field label="Start time" error={errors['availability.startTime']}><input type="datetime-local" value={form.availability.startTime} onChange={(e) => set('availability.startTime', e.target.value)} /></Field>
          <Field label="End time" error={errors['availability.endTime']}><input type="datetime-local" value={form.availability.endTime} onChange={(e) => set('availability.endTime', e.target.value)} /></Field>
          <Multi label="Include segments" path="availability.includeSegments" options={INCLUDE} {...p} />
          <Multi label="Exclude segments" path="availability.excludeSegments" options={EXCLUDE} {...p} />
        </section>

        <section className={'card' + (highlighted === 'tr' ? ' map-highlight' : '')} style={{ gridArea: 'tr', '--c': '#c9780a' }} ref={refs.tr} tabIndex="-1">
          <h3>Triggers on</h3>
          <Select label="Event" path="triggers.event" options={['on_registration', 'on_deposit']} {...p} />
          <Money label="Min deposit" path="triggers.minDeposit" {...p} />
          <Money label="Max deposit" path="triggers.maxDeposit" {...p} />
          <Num label="Deposit number" path="triggers.depositNumber" int {...p} />
        </section>

        <section className={'card' + (highlighted === 'rw' ? ' map-highlight' : '')} style={{ gridArea: 'rw', '--c': '#7b3fc4' }} ref={refs.rw} tabIndex="-1">
          <h3>Reward / value</h3>
          <Field label="Deposit match percentage (DMP)" hint={DMP_HINT} error={errors['reward.dmp']}>
            <div className="money"><input type="number" min="0" step="any" value={form.reward.dmp ?? ''} onChange={(e) => set('reward.dmp', e.target.value === '' ? '' : Number(e.target.value))} /><span className="cur" style={{ textDecoration: 'none', cursor: 'default', display: 'grid', placeItems: 'center' }}>%</span></div>
          </Field>
          <Money label="Max bonus amount (MBA)" path="reward.maxBonusAmount" {...p} />
          <div className="calc">
            <span className="lbl">Bonus amount (calculated)<Hint text="min(deposit amount * DMP/100, MBA)" /></span>
            <b>{fmt(calculated)} EUR</b>
            <div className="kvl" style={{ margin: '6px 0 0' }}>
              for a sample deposit of{' '}
              <input type="number" min="0" value={sample} onChange={(e) => setSample(e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 80, padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 4 }} /> EUR
            </div>
          </div>
        </section>

        <section className={'card' + (highlighted === 'wg' ? ' map-highlight' : '')} style={{ gridArea: 'wg', '--c': '#c23934' }} ref={refs.wg} tabIndex="-1">
          <h3>Wagering</h3>
          <Num label="Multiplier" path="wagering.multiplier" {...p} />
          <Num label="Time to complete (days)" path="wagering.timeToCompleteDays" int {...p} />
          <Money label="Max bet per round" path="wagering.maxBetPerRound" {...p} />
          <Select label="Applies to" hint={APPLIES_HINT} path="wagering.appliesTo" options={APPLIES} {...p} />
          <Field label="Max withdraw cap" error={errors['wagering.maxWithdrawCap.type']}>
            <div className="two">
              <select value={cap.type} onChange={(e) => set('wagering.maxWithdrawCap.type', e.target.value)}>
                <option value="">Select…</option>
                <option value="MULTIPLIER">MULTIPLIER</option><option value="FIXED">FIXED</option>
              </select>
              {cap.type === 'FIXED' ? (
                <div className="money">
                  <input type="number" min="0" step="any" aria-label="Cap value" value={cap.value ?? ''} onChange={(e) => set('wagering.maxWithdrawCap.value', e.target.value === '' ? '' : Number(e.target.value))} />
                  <button type="button" className="cur" onClick={() => openRates(Number(cap.value) || 0)}>EUR</button>
                </div>
              ) : (
                <div className="money"><input type="number" min="0" step="any" aria-label="Cap multiplier" value={cap.value ?? ''} onChange={(e) => set('wagering.maxWithdrawCap.value', e.target.value === '' ? '' : Number(e.target.value))} /><span className="cur" style={{ textDecoration: 'none', cursor: 'default', display: 'grid', placeItems: 'center' }}>×</span></div>
              )}
            </div>
            {errors['wagering.maxWithdrawCap.value'] && <span className="emsg">{errors['wagering.maxWithdrawCap.value']}</span>}
          </Field>
        </section>

        <section className={'card' + (highlighted === 'wl' ? ' map-highlight' : '')} style={{ gridArea: 'wl', '--c': '#0b7a75' }} ref={refs.wl} tabIndex="-1">
          <h3>Wallet rules</h3>
          <div className="two">
            <Select label="Deduction" path="walletRules.deduction" options={WALLET} {...p} />
            <Select label="Winnings" path="walletRules.winnings" options={WALLET} {...p} />
          </div>
          <Check label="Allow to cancel before wagering" path="walletRules.allowCancelBeforeWagering" {...p} />
          <Check label="Allow withdraw before wagering" path="walletRules.allowWithdrawBeforeWagering" {...p} />
        </section>

        <section className={'card' + (highlighted === 'ab' ? ' map-highlight' : '')} style={{ gridArea: 'ab', '--c': '#8b3a62' }} ref={refs.ab} tabIndex="-1">
          <h3>Anti-bonus-hunter</h3>
          <div className="two">
            <Num label="Max claims per IP" path="antiBonusHunter.maxClaimsPerIp" int {...p} />
            <Num label="Max claims per device" path="antiBonusHunter.maxClaimsPerDevice" int {...p} />
          </div>
          <Check label="Block shared IP subnets" path="antiBonusHunter.blockSharedIpSubnets" {...p} />
          <Check label="Block known VPNs and proxies" path="antiBonusHunter.blockKnownVpnsAndProxies" {...p} />
          <Multi label="Payment method blacklist" path="antiBonusHunter.paymentMethodBlacklist" options={PAYMENT_METHODS} {...p} />
          <Select label="Require KYC level before claim" path="antiBonusHunter.requireKycLevelBeforeClaim" options={KYC_LEVELS} {...p} />
          <Money label="Max bet per round" path="antiBonusHunter.maxBetPerRound" {...p} />
          <Num label="Max bet percentage of bonus" hint="Restricts a single wager from exceeding a percentage of the total awarded bonus balance." path="antiBonusHunter.maxBetPercentageOfBonus" {...p} />
          <Check label="Restrict zero risk betting" path="antiBonusHunter.restrictZeroRiskBetting" {...p} />
          <Num label="Min even money coverage percentage" path="antiBonusHunter.minEvenMoneyCoveragePercentage" {...p} />
        </section>

        {orig && <section className={'card' + (highlighted === 'pc' ? ' map-highlight' : '')} style={{ gridArea: 'pc', '--c': '#087f8c' }} ref={refs.pc} tabIndex="-1">
          <h3>Promo codes</h3>
          <PromoCodes bonus={orig} dates={promoDates} setDates={setPromoDates} codes={promoCodes} setCodes={setPromoCodes} />
        </section>}
      </div>

      {modal && modal.t === 'rates' && <RatesModal amount={modal.amount} onClose={() => setModal(null)} />}
      {modal && modal.t === 'cat' && <CategoryModal value={form.category} onPick={(c) => set('category', c)} onClose={() => setModal(null)} />}
      {modal && modal.t === 'log' && <ChangelogModal id={orig.id} onClose={() => setModal(null)} />}
      {showAIAgent && creating && <AIAgentModal onClose={() => { setShowAIAgent(false); history.replaceState(null, '', '/crm/b/e/?new=1'); }} />}
      {showMap && <SatelliteMap title={form.name} items={mapItems} onSelect={selectMapNode} onClose={() => setShowMap(false)} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Editor />);
