const { useState, useEffect, useRef, useLayoutEffect } = React;
const API = '/crm/ui-api/v1';
const QUERY = new URLSearchParams(location.search);
const ID = QUERY.get('id');
const NEW = QUERY.get('new') === '1';
const AI_MODE = QUERY.get('ai') === '1';

const TYPES = ['dep match', 'no-deposit', 'free spins', 'cashback', 'multiplier'];
let CATEGORIES = [];
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
const DMP_HINT = (
  <><b>{NexLuckI18n.t("100 (Standard Match):")}</b>{NexLuckI18n.t(" If a player deposits ")}<b>$100</b>{NexLuckI18n.t(", the casino adds ")}<b>$100</b>{NexLuckI18n.t(" in bonus funds ($100 × 100%). Total balance: ")}<b>$200</b>.</>
);
const BONUS_AMOUNT_HINT = (
  <>{NexLuckI18n.t("Bonus Amount = min(deposit amount × DMP / 100, MBA)")}<br />{NexLuckI18n.t("If DMP = 0, Bonus Amount = MBA.")}</>
);

const ANTI_HEDGING_HINT = 'Applicable to Roulette/Baccarat - doesn\'t allow you to bet on 50/50.';
const SATELLITE_INFO = {
  ce: 'The bonus itself: name, status, type and category. Every other block is attached to it.',
  av: 'When the bonus can be claimed, and which player segments are eligible or excluded.',
  tr: 'What awards the bonus: registration or a deposit, with the deposit amount and deposit-count conditions.',
  rw: 'What the player receives: a deposit-match bonus amount, or a Free Spins package and how it is spread over days.',
  gm: 'Where the bonus can be played: one or several game categories, or a single game.',
  wg: 'Playthrough rules: wagering multiplier, time limit and the withdrawal cap.',
  wl: 'Which wallet is charged first and which receives winnings, and whether the player may cancel or withdraw before wagering is done.',
  ab: 'Abuse protection: claim limits per IP and device, VPN and payment-method blocks, KYC level and betting restrictions.',
  pc: 'Codes a player enters to claim the bonus, each with its own validity period. Codes can be edited here.',
};
const CODE_RE = /^[A-Z0-9_-]{4,32}$/;

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setIn = (o, path, v) => {
  const [k, ...rest] = path.split('.');
  return { ...o, [k]: rest.length ? setIn(o[k] || {}, rest.join('.'), v) : v };
};
const pick = (b) => ({
  name: b.name, description: b.description, status: b.status === 'inactive' ? 'inactive' : 'active',
  bonusType: b.bonusType, category: b.category, availability: b.availability, triggers: b.triggers, games: b.games,
  reward: b.reward, wagering: b.wagering, walletRules: b.walletRules, antiBonusHunter: b.antiBonusHunter,
});
const emptyBonus = () => ({
  name: '', description: '', status: '', bonusType: '', category: '',
  availability: { startTime: '', endTime: '', includeSegments: [], excludeSegments: [] },
  triggers: { event: '', minDeposit: '', maxDeposit: '', depositNumber: '', minDepositCount: '', maxDepositCount: '' },
  games: { linkType: 'categories', categories: [], game: '' },
  reward: { mode: 'BONUS_MONEY', dmp: '', maxBonusAmount: '', freeSpins: { quantity: '', spinsPerDay: '' } },
  wagering: { multiplier: '', timeToCompleteDays: '', maxBetPerRound: '', appliesTo: '',
    maxWithdrawCap: { type: '', value: '' } },
  walletRules: { deduction: '', winnings: '', allowCancelBeforeWagering: false, allowWithdrawBeforeWagering: false },
  antiBonusHunter: { maxClaimsPerIp: '', maxClaimsPerDevice: '', blockSharedIpSubnets: false,
    blockKnownVpnsAndProxies: false, paymentMethodBlacklist: [], requireKycLevelBeforeClaim: '',
    maxBetPerRound: '', maxBetPercentageOfBonus: '', restrictZeroRiskBetting: false,
    minEvenMoneyCoveragePercentage: '' },
});
// 'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM' or an ISO timestamp -> '31 Dec 26' (with ', 23:59' when withTime)
const fmtDate = (v, withTime) => {
  if (!v) return '';
  const d = /Z$|[+-]\d\d:\d\d$/.test(v) ? new Date(v) : new Date(v.length === 10 ? v + 'T00:00' : v);
  if (isNaN(d)) return v;
  return new Intl.DateTimeFormat(NexLuckI18n.formatLocale, {
    day: 'numeric', month: 'short', year: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {})
  }).format(d);
};
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString(NexLuckI18n.formatLocale);
const api = async (path, opts) => {
  const r = await CRMContext.fetch(API + path, opts && opts.body ? { ...opts, headers: { 'Content-Type': 'application/json' } } : opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || 'Request failed'), { fields: body.fields || {}, status: r.status });
  return body;
};

function Hint({ text }) {
  return <button type="button" className="hint" aria-label={NexLuckI18n.t("Hint")}>?<span className="tip" style={{ whiteSpace: 'pre-line' }}>{NexLuckI18n.t(text)}</span></button>;
}

function Field({ label, hint, error, children }) {
  return (
    <div className={'f' + (error ? ' err' : '')}>
      <span className="lbl">{NexLuckI18n.t(label)}{hint && <Hint text={hint} />}</span>
      {children}
      {error && <span className="emsg">{error}</span>}
    </div>
  );
}

function AvailabilitySegments({ label, path, form, set, errors, onOpen }) {
  const values = get(form, path) || [];
  const remove = value => set(path, values.filter(v => v !== value));
  const segmentCatalog = NexLuckSegmentTags.useCatalog(React);
  const tagFor = value => {
    const info = NexLuckSegmentTags.describe(value, segmentCatalog);
    return { ...info, label: info.segment.tag_name?.trim() ? info.label : NexLuckI18n.t(value) };
  };
  return <Field label={NexLuckI18n.t(label)} error={errors[path]}>
    <div className="availability-segments">
      {values.map(value => tagFor(value)).map(info => <button type="button" className={'availability-tag' + info.className} key={info.name}
        title={NexLuckI18n.t("Double-click to remove; press Delete or Backspace to remove") + ' — ' + info.title} data-segment={info.name}
        aria-label={NexLuckI18n.t("Remove ") + info.label + NexLuckI18n.t(" from ") + label.toLowerCase()}
        onDoubleClick={() => remove(info.name)} onKeyDown={e => {
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(info.name); }
        }}>{info.label}</button>)}
      <button type="button" className="btn segment-more" aria-label={NexLuckI18n.t("Edit ") + label.toLowerCase()}
        onClick={() => onOpen({ path, label })}>...</button>
    </div>
  </Field>;
}

function Modal({ title, onClose, children, actions, className = '' }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="ovl" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal ' + className} role="dialog" aria-label={NexLuckI18n.t(title)}>
        <h2>{NexLuckI18n.t(title)}</h2>
        {children}
        <div className="acts">{actions}</div>
      </div>
    </div>
  );
}

function DateTime({ value, onChange }) {
  const input = useRef(null);
  const open = () => { try { input.current.showPicker(); } catch (err) { input.current.focus(); } };
  return (
    <div className="dt" onClick={open}>
      <span className={value ? '' : 'ph'}>{value ? fmtDate(value, true) : NexLuckI18n.t("Select date…")}</span>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2v2M13 2v2M2 6h12M3 3h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      <input ref={input} type="datetime-local" value={value} tabIndex={-1} aria-label={NexLuckI18n.t("Pick date and time")} onChange={(ev) => onChange(ev.target.value)} />
    </div>
  );
}

function Money({ label, hint, path, form, set, errors, openRates }) {
  const v = get(form, path);
  return (
    <Field label={NexLuckI18n.t(label)} hint={hint} error={errors[path]}>
      <div className="money">
        <input type="number" min="0" step="any" value={v ?? ''} onChange={(e) => set(path, e.target.value === '' ? '' : Number(e.target.value))} />
        <button type="button" className="cur" title={NexLuckI18n.t("Adjust exchange rates")} onClick={() => openRates(Number(v) || 0)}>{NexLuckI18n.t("EUR")}</button>
      </div>
    </Field>
  );
}

function Num({ label, hint, path, form, set, errors, int, suffix }) {
  return (
    <Field label={NexLuckI18n.t(label)} hint={hint} error={errors[path]}>
      <input type="number" min="0" step={int ? 1 : 'any'} value={get(form, path) ?? ''} onChange={(e) => set(path, e.target.value === '' ? '' : Number(e.target.value))} />
    </Field>
  );
}

function Select({ label, hint, path, form, set, errors, options, labels }) {
  return (
    <Field label={NexLuckI18n.t(label)} hint={hint} error={errors[path]}>
      <select value={get(form, path) ?? ''} onChange={(e) => set(path, e.target.value)}>
        <option value="">{NexLuckI18n.t("Select…")}</option>
        {options.map((o) => <option key={o} value={o}>{NexLuckI18n.t(labels ? labels[o] : o)}</option>)}
      </select>
    </Field>
  );
}

function Multi({ label, path, form, set, errors, options }) {
  const sel = get(form, path) || [];
  const toggle = (o) => set(path, sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]);
  return (
    <Field label={NexLuckI18n.t(label)} error={errors[path]}>
      <div className="chips">
        {options.map((o) => (
          <label key={o} className={'chk' + (sel.includes(o) ? ' on' : '')}>
            <input type="checkbox" checked={sel.includes(o)} onChange={() => toggle(o)} />{NexLuckI18n.t(o)}
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
      <input type="checkbox" checked={on} onChange={(e) => set(path, e.target.checked)} />{NexLuckI18n.t(label)}
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
    <Modal title={NexLuckI18n.t("Exchange rates (per 1 EUR)")} onClose={onClose}
      actions={<><button className="btn" onClick={onClose}>{NexLuckI18n.t("Cancel")}</button><button className="btn pri" disabled={!rates || busy} onClick={save}>{NexLuckI18n.t("Save rates")}</button></>}>
      {err && <div className="msg bad" style={{ marginBottom: 8 }}>{err}</div>}
      {!rates ? NexLuckI18n.t("Loading…") : (
        <>
          <p className="kvl">{NexLuckI18n.t("Rates apply to all bonuses. Amounts are stored in EUR; other currencies are converted with these rates.")}{amount ? <>{NexLuckI18n.t(" Current value: ")}<b>{fmt(amount)}{NexLuckI18n.t(" EUR")}</b>.</> : null}</p>
          <table className="rt">
            <thead><tr><th>{NexLuckI18n.t("Currency")}</th><th>{NexLuckI18n.t("Rate")}</th><th>{fmt(amount || 1)}{NexLuckI18n.t(" EUR =")}</th></tr></thead>
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
          <p className="kvl" style={{ marginTop: 8 }}>{NexLuckI18n.t("Last updated ")}{fmtDate(rates.updatedAt, true)}{NexLuckI18n.t(" by ")}{rates.updatedBy}.</p>
        </>
      )}
    </Modal>
  );
}

function CategoryModal({ value, onPick, onClose }) {
  return (
    <Modal title={NexLuckI18n.t("Category")} onClose={onClose} actions={<button className="btn" onClick={onClose}>{NexLuckI18n.t("Close")}</button>}>
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
    <Modal title={NexLuckI18n.t("Changelog — ") + id} onClose={onClose} actions={<button className="btn" onClick={onClose}>{NexLuckI18n.t("Close")}</button>}>
      {err && <div className="msg bad">{err}</div>}
      {!items && !err && NexLuckI18n.t("Loading…")}
      {items && items.map((c, i) => (
        <div className="cl" key={i}>
          <b>{c.summary}</b> <small>· {fmtDate(c.at, true)} · {c.by}</small>
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
    <Modal title={NexLuckI18n.t("AI bonus agent")} onClose={onClose}
      actions={<><button className="btn" onClick={onClose}>{NexLuckI18n.t("Continue manually")}</button><button className="btn pri" disabled={!prompt.trim()} onClick={() => setNotice('AI agent integration is not connected yet. Your bonus form remains empty and ready to edit.')}>{NexLuckI18n.t("Ask AI agent")}</button></>}>
      <p className="kvl">{NexLuckI18n.t("Tell the AI agent what kind of bonus you want to create.")}</p>
      <textarea autoFocus value={prompt} onChange={(e) => { setPrompt(e.target.value); setNotice(''); }} placeholder={NexLuckI18n.t("For example: a 100% first-deposit match for registered players…")} style={{ width: '100%', minHeight: 100, border: '1px solid var(--line)', borderRadius: 6, padding: 10, font: 'inherit' }} />
      {notice && <div className="msg bad" style={{ marginTop: 10 }}>{notice}</div>}
    </Modal>
  );
}

function PromoCodes({ bonus, dates, setDates, codes, setCodes }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const draft = !bonus;
  const [edits, setEdits] = useState({});
  const modified = codes.filter((c) => edits[c.code] !== undefined && edits[c.code] !== c.code);
  const load = async () => {
    const result = await api(`/bonuses/${bonus.id}/promo-codes`);
    setCodes(result.items);
  };
  const generate = async () => {
    setError('');
    if (draft) {
      if (!dates.startTime || !dates.endTime) return setError(NexLuckI18n.t("Set both Valid from and Valid until"));
      if (dates.endTime <= dates.startTime) return setError(NexLuckI18n.t("endTime: End time must be after start time"));
      const code = 'PROMO-' + Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
      setCodes((items) => [...items, { code, startTime: dates.startTime, endTime: dates.endTime }]);
      return;
    }
    setBusy(true);
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
    if (!window.confirm(NexLuckI18n.t("Delete promo code {value1}?", { value1: code }))) return;
    if (draft) return setCodes((items) => items.filter((item) => item.code !== code));
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

  const saveEdits = async () => {
    setError('');
    const renames = modified.map((c) => [c.code, edits[c.code]]);
    const invalid = renames.find(([, next]) => !CODE_RE.test(next));
    if (invalid) return setError(`${invalid[1] || 'Code'}: use 4-32 characters: A-Z, 0-9, _ or -`);
    const finals = codes.map((c) => (renames.find(([old]) => old === c.code) || [0, c.code])[1]);
    if (new Set(finals).size !== finals.length) return setError(NexLuckI18n.t("Promo codes must be unique"));
    const apply = (old, next) => {
      setCodes((items) => items.map((x) => (x.code === old ? { ...x, code: next } : x)));
      setEdits((e) => { const { [old]: _, ...rest } = e; return rest; });
    };
    if (draft) return renames.forEach(([old, next]) => apply(old, next));
    setBusy(true);
    try {
      for (const [old, next] of renames) {
        await api(`/bonuses/${bonus.id}/promo-codes/${encodeURIComponent(old)}`, { method: 'PATCH', body: JSON.stringify({ code: next }) });
        apply(old, next);
      }
    } catch (e) {
      setError(Object.values(e.fields || {}).join('; ') || e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!draft) load().catch((e) => setError(e.message));
  }, [bonus && bonus.id]);

  return (
    <>
      <div className="promo-add">
        <Field label={NexLuckI18n.t("Valid from")}>
          <DateTime value={dates.startTime} onChange={(v) => setDates((d) => ({ ...d, startTime: v }))} />
        </Field>
        <Field label={NexLuckI18n.t("Valid until")}>
          <DateTime value={dates.endTime} onChange={(v) => setDates((d) => ({ ...d, endTime: v }))} />
        </Field>
        <button type="button" className="btn pri" disabled={busy} onClick={generate}>{NexLuckI18n.t("Generate promo code")}</button>
      </div>
      {error && <div className="msg bad" style={{ marginTop: 10 }}>{error}</div>}
      {codes.length ? (
        <table className="promo-list">
          <thead><tr><th>{NexLuckI18n.t("Promo code")}</th><th>{NexLuckI18n.t("Starts")}</th><th>{NexLuckI18n.t("Ends")}</th><th></th></tr></thead>
          <tbody>{codes.map((item) => (
            <tr key={item.code}>
              <td>
                <input type="text" className={'promo-code-input' + (edits[item.code] !== undefined && edits[item.code] !== item.code ? ' changed' : '')}
                  aria-label={NexLuckI18n.t("Promo code {value1}", { value1: item.code })} maxLength={32} spellCheck="false" disabled={busy}
                  value={edits[item.code] ?? item.code}
                  onChange={(e) => { const v = e.target.value.toUpperCase().replace(/\s/g, ''); setEdits((m) => ({ ...m, [item.code]: v })); }} />
              </td>
              <td>{fmtDate(item.startTime, true)}</td>
              <td>{fmtDate(item.endTime, true)}</td>
              <td><button type="button" className="btn" disabled={busy} onClick={() => remove(item.code)}>{NexLuckI18n.t("Delete")}</button></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <div className="promo-empty">{NexLuckI18n.t("No promo codes have been generated for this bonus.")}</div>}
      {modified.length > 0 && (
        <div className="promo-save">
          <button type="button" className="btn pri" disabled={busy} onClick={saveEdits}>{NexLuckI18n.t("Save promo codes")}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => { setEdits({}); setError(''); }}>{NexLuckI18n.t("Discard")}</button>
        </div>
      )}
      {draft && codes.length > 0 && <div className="promo-empty">{NexLuckI18n.t("These codes are created together with the bonus.")}</div>}
    </>
  );
}

function SatelliteMap({ title, items, centerInfo, onSelect, onClose }) {
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
    <Modal title={NexLuckI18n.t("Bonus satellite map")} onClose={onClose} className="map-modal"
      actions={<button type="button" className="btn pri" onClick={onClose}>{NexLuckI18n.t("Close map")}</button>}>
      <p className="kvl">{NexLuckI18n.t("Choose a block to jump to it in the editor.")}</p>
      <div className="map-grid" ref={root}>
        <svg aria-hidden="true">{lines.map((line) => (
          <line key={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
        ))}</svg>
        <button type="button" className="map-node map-center" ref={center} onClick={() => onSelect('ce')}>
          <small>{NexLuckI18n.t("Bonus")}</small><strong>{title || NexLuckI18n.t("Untitled bonus")}</strong><span>{NexLuckI18n.t(centerInfo)}</span>
        </button>
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            ref={(node) => { nodes.current[item.id] = node; }}
            className={'map-node map-' + item.id}
            onClick={() => onSelect(item.id)}
          ><strong>{item.title}</strong><span>{item.info}</span></button>
        ))}
      </div>
    </Modal>
  );
}

const emptyBanner = () => ({
  images: { web: null, tablet: null, mobile: null }, title: '', description: '',
  buttons: { depositForSignedUsers: false, signUpForAnonymous: false },
  pages: { home: false, welcome: false },
});
const BANNER_IMAGES = [['web', NexLuckI18n.t("Web")], ['tablet', NexLuckI18n.t("Tablet")], ['mobile', NexLuckI18n.t("Mobile")]];
const MAX_IMAGE_BYTES = 2_000_000;

function PromoModal({ initial, segments, onSave, onClose }) {
  const segmentCatalog = NexLuckSegmentTags.useCatalog(React);
  const [b, setB] = useState(() => Object.fromEntries(Object.keys(emptyBanner()).map(key => [key, initial[key]])));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upd = (path, v) => setB((x) => setIn(x, path, v));
  const upload = (key, file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setErrors((e) => ({ ...e, ['images.' + key]: 'Use a PNG, JPEG, WEBP or GIF image' }));
    if (file.size > MAX_IMAGE_BYTES) return setErrors((e) => ({ ...e, ['images.' + key]: 'Image is too large (max 2 MB)' }));
    const reader = new FileReader();
    reader.onload = () => { upd('images.' + key, reader.result); setErrors((e) => ({ ...e, ['images.' + key]: '' })); };
    reader.readAsDataURL(file);
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave(b);
    } catch (e) {
      setErrors(e.fields || {});
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal title={NexLuckI18n.t("🖼️ Promo banner")} className="promo-modal" onClose={onClose} actions={<>
      <button className="btn" type="button" onClick={onClose}>{NexLuckI18n.t("Cancel")}</button>
      <button className="btn pri" type="button" disabled={busy} onClick={save}>{NexLuckI18n.t("Save promo")}</button>
    </>}>
      <p className="kvl">{NexLuckI18n.t("The banner that is shown on the casino web site for this bonus.")}</p>
      <div className="promo-imgs">
        {BANNER_IMAGES.map(([k, label]) => (
          <Field key={k} label={NexLuckI18n.t("Banner image: ") + label} error={errors['images.' + k]}>
            <div className={'img-prev img-' + k}>
              {b.images[k] ? <img src={b.images[k]} alt={label + NexLuckI18n.t(" banner preview")} /> : <span>{NexLuckI18n.t("No image")}</span>}
            </div>
            <div className="img-acts">
              <label className="btn">
                {b.images[k] ? 'Replace' : 'Upload'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { upload(k, e.target.files[0]); e.target.value = ''; }} />
              </label>
              {b.images[k] && <button type="button" className="btn" onClick={() => upd('images.' + k, null)}>{NexLuckI18n.t("Remove")}</button>}
            </div>
          </Field>
        ))}
      </div>
      <Field label={NexLuckI18n.t("Title (HTML)")} error={errors.title}>
        <textarea className="code" rows="3" value={b.title} onChange={(e) => upd('title', e.target.value)} placeholder="<h2>Welcome bonus</h2>" />
      </Field>
      <Field label={NexLuckI18n.t("Full description (HTML)")} error={errors.description}>
        <textarea className="code" rows="6" value={b.description} onChange={(e) => upd('description', e.target.value)} placeholder="<p>Deposit and get 100% up to 100 EUR…</p>" />
      </Field>
      <Field label={NexLuckI18n.t("Show for segments")} hint={NexLuckI18n.t("Taken from the bonus Availability → Include segments.")}>
        <div className="seg-ro">{segments.length ? segments.map((x) => <SegmentTag key={x} className="chk on" segment={x} segments={segmentCatalog} />) : <span className="kvl">{NexLuckI18n.t("No segments selected: shown to everyone.")}</span>}</div>
      </Field>
      <Field label={NexLuckI18n.t("Show buttons")} error={errors['buttons.depositForSignedUsers'] || errors['buttons.signUpForAnonymous']}>
        <div className="chk-row">
          <Check label="DEPOSIT_FOR_SIGNED_USERS" path="buttons.depositForSignedUsers" form={b} set={upd} />
          <Check label="SIGN_UP_FOR_ANONYMOUS" path="buttons.signUpForAnonymous" form={b} set={upd} />
        </div>
      </Field>
      <Field label={NexLuckI18n.t("Show on pages")} error={errors['pages.home'] || errors['pages.welcome']}>
        <div className="chk-row">
          <Check label={NexLuckI18n.t("Home page")} path="pages.home" form={b} set={upd} />
          <Check label={NexLuckI18n.t("Welcome page")} path="pages.welcome" form={b} set={upd} />
        </div>
      </Field>
      {error && <div className="msg bad">{error}</div>}
    </Modal>
  );
}

function Editor() {
  const segmentState = useCustomerSegments();
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
  const [banner, setBanner] = useState(emptyBanner());
  const [bannerDirty, setBannerDirty] = useState(false);
  const [games, setGames] = useState([]);
  const [promoDates, setPromoDates] = useState({ startTime: '', endTime: '' });
  const root = useRef(null);
  const refs = { ce: useRef(null), av: useRef(null), tr: useRef(null), rw: useRef(null), wg: useRef(null), wl: useRef(null), ab: useRef(null), gm: useRef(null), pc: useRef(null) };
  const [lines, setLines] = useState([]);
  const highlightTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);
  const hasUnsavedChanges = Boolean(form && ((!orig && NEW) || JSON.stringify(form) !== JSON.stringify(pick(orig)) || bannerDirty));
  useEffect(() => {
    CRMContext.setDirty('bonus-editor', hasUnsavedChanges);
    return () => CRMContext.setDirty('bonus-editor', false);
  }, [hasUnsavedChanges]);

  const load = () => api('/bonuses/' + ID).then((b) => {
    setOrig(b);
    setForm(pick(b));
    setPromoDates({ startTime: b.availability.startTime, endTime: b.availability.endTime });
    api('/bonuses/' + b.id + '/promo-banner').then(setBanner).catch(error => setStatus({ bad: true, text: error.message }));
  }).catch((e) => setStatus({ bad: true, text: e.message }));
  useEffect(() => {
    document.title = NEW ? 'NexLuck CRM — New bonus' : 'NexLuck CRM — Edit bonus';
    api('/games').then((r) => setGames(r.items)).catch(error => setStatus({ bad: true, text: error.message }));
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
      setLines(['av', "tr", 'rw', 'gm', 'wg', 'wl', 'ab', 'pc'].filter((k) => refs[k].current).map((k) => {
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

  if (!form) return <><h1>🎁 {NEW ? NexLuckI18n.t("New bonus") : NexLuckI18n.t("Edit bonus")}</h1><p className="lead">{NexLuckI18n.t("Bonus configuration, grouped around the bonus itself.")}</p>{status ? <div className="msg bad">{status.text}</div> : <p>{NexLuckI18n.t("Loading…")}</p>}</>;

  const set = (path, v) => { setForm((f) => setIn(f, path, v)); setStatus(null); };
  const creating = NEW && !orig;
  const dirty = creating || JSON.stringify(form) !== JSON.stringify(pick(orig));
  const openRates = (amount) => setModal({ t: 'rates', amount });
  const mapItems = [
    { id: 'av', title: NexLuckI18n.t("Availability") },
    { id: 'tr', title: NexLuckI18n.t("Triggers on") },
    { id: 'rw', title: NexLuckI18n.t("Reward / value") },
    { id: 'gm', title: NexLuckI18n.t("Games") },
    { id: 'wg', title: NexLuckI18n.t("Wagering") },
    { id: 'wl', title: NexLuckI18n.t("Wallet rules") },
    { id: 'ab', title: NexLuckI18n.t("Anti-bonus-hunter") },
    { id: 'pc', title: NexLuckI18n.t("Promo codes") },
  ].map((item) => ({ ...item, info: SATELLITE_INFO[item.id] }));
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
      let failed = 0;
      if (creating) {
        history.replaceState(null, '', '/crm/b/e/?id=' + encodeURIComponent(b.id));
        const created = [];
        for (const c of promoCodes) {
          try {
            created.push(await api(`/bonuses/${b.id}/promo-codes`, { method: 'POST', body: JSON.stringify(c) }));
          } catch (e) { failed++; }
        }
        setPromoCodes(created);
        if (bannerDirty) {
          try { await api(`/bonuses/${b.id}/promo-banner`, { method: 'PUT', body: JSON.stringify(banner) }); setBannerDirty(false); } catch (e) { failed++; }
        }
        setPromoDates({ startTime: b.availability.startTime, endTime: b.availability.endTime });
      }
      setStatus(failed ? { bad: true, text: NexLuckI18n.t("Bonus created, but {value1} promo code(s) could not be saved", { value1: failed }) } : { text: creating ? 'Bonus created' : 'Saved' });
    } catch (e) {
      setErrors(e.fields || {});
      setStatus({ bad: true, text: e.status === 422 ? 'Please fix the highlighted fields' : e.message });
    }
    setBusy(false);
  };

  const dmp = Number(form.reward.dmp) || 0, mba = Number(form.reward.maxBonusAmount) || 0;
  const calculated = dmp === 0 ? mba : Math.min((Number(sample) || 0) * dmp / 100, mba);
  const cap = form.wagering.maxWithdrawCap;
  const freeSpinMode = form.reward.mode === 'FREE_SPINS';
  const spinQty = Number(form.reward.freeSpins.quantity) || 0, spinsPerDay = Number(form.reward.freeSpins.spinsPerDay) || 0;
  const spinDays = spinQty > 0 && spinsPerDay > 0 ? Math.ceil(spinQty / spinsPerDay) : 0;
  const p = { form, set, errors, openRates };

  return (
    <>
      <h1>🎁 {creating ? NexLuckI18n.t("New bonus") : NexLuckI18n.t("Edit bonus")}</h1>
      <p className="lead">{NexLuckI18n.t("Bonus configuration, grouped around the bonus itself.")}</p>
      <div className="bar">
        <a className="btn" href="/crm/b/">{NexLuckI18n.t("← Back to list")}</a>
        <span className="sp" />
        {status && <span className={'msg ' + (status.bad ? 'bad' : 'ok')} role="status">{status.text}</span>}
        <button className="btn" disabled={!dirty || busy} onClick={() => { setForm(creating ? emptyBonus() : pick(orig)); setErrors({}); setStatus(null); }}>{NexLuckI18n.t("Discard")}</button>
        <button className="btn" type="button" onClick={() => setShowMap(true)}>{NexLuckI18n.t("Map")}</button>
        <button className="btn pri" disabled={!dirty || busy} onClick={save}>{creating ? NexLuckI18n.t("Create bonus") : NexLuckI18n.t("Save changes")}</button>
      </div>

      <div className="sat" ref={root}>
        <svg aria-hidden="true">{lines.map((l) => <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#9bb8d8" strokeWidth="2" strokeDasharray="5 5" />)}</svg>

        <section className={'card center' + (highlighted === 'ce' ? ' map-highlight' : '')} ref={refs.ce} tabIndex="-1">
          <div className="title-row">
            <h3>{NexLuckI18n.t("🎁 Bonus")}</h3>
            <button className="btn" type="button" onClick={() => setModal({ t: 'promo' })}>{NexLuckI18n.t("Promo")}</button>
          </div>
          <Field label={NexLuckI18n.t("Name")} error={errors.name}><input type="text" value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="ID"><div className="ro">{orig ? orig.id : NexLuckI18n.t("Assigned when saved")}</div></Field>
          <Field label={NexLuckI18n.t("Description")} error={errors.description}><textarea value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <div className="two">
            <Select label={NexLuckI18n.t("Status")} path="status" options={['active', 'inactive']} labels={{ active: 'ACTIVE', inactive: 'NOT ACTIVE' }} {...p} />
            <Select label={NexLuckI18n.t("Bonus type")} path="bonusType" options={TYPES} {...p} />
          </div>
          <Field label={NexLuckI18n.t("Category")} error={errors.category}>
            <button type="button" className="pick dropdown-control" onClick={() => setModal({ t: 'cat' })}><span>{form.category || NexLuckI18n.t("Select category…")}</span></button>
          </Field>
          <div className="two">
            <Field label={NexLuckI18n.t("Created at")}><div className="ro">{orig ? fmtDate(orig.createdAt) : NexLuckI18n.t("Assigned when saved")}</div></Field>
            <Field label={NexLuckI18n.t("Created by")}><div className="ro">{orig ? orig.createdBy : NexLuckI18n.t("Assigned when saved")}</div></Field>
          </div>
          {orig && <button type="button" className="link" onClick={() => setModal({ t: 'log' })}>{NexLuckI18n.t("Changelog →")}</button>}
        </section>

        <section className={'card' + (highlighted === 'av' ? ' map-highlight' : '')} style={{ gridArea: 'av', '--c': '#2e844a' }} ref={refs.av} tabIndex="-1">
          <h3>{NexLuckI18n.t("Availability")}</h3>
          <Field label={NexLuckI18n.t("Start time")} error={errors['availability.startTime']}><DateTime value={form.availability.startTime} onChange={(v) => set('availability.startTime', v)} /></Field>
          <Field label={NexLuckI18n.t("End time")} error={errors['availability.endTime']}><DateTime value={form.availability.endTime} onChange={(v) => set('availability.endTime', v)} /></Field>
          <AvailabilitySegments label={NexLuckI18n.t("Include segments")} path="availability.includeSegments" {...p} onOpen={selection => setModal({ t: 'segments', ...selection })} />
          <AvailabilitySegments label={NexLuckI18n.t("Exclude segments")} path="availability.excludeSegments" {...p} onOpen={selection => setModal({ t: 'segments', ...selection })} />
        </section>

        <section className={'card' + (highlighted === 'tr' ? ' map-highlight' : '')} style={{ gridArea: 'tr', '--c': '#c9780a' }} ref={refs.tr} tabIndex="-1">
          <h3>{NexLuckI18n.t("Triggers on")}</h3>
          <Select label={NexLuckI18n.t("Event")} path="triggers.event" options={['on_registration', 'on_deposit']} {...p} />
          <Money label={NexLuckI18n.t("Min deposit")} path="triggers.minDeposit" {...p} />
          <Money label={NexLuckI18n.t("Max deposit")} path="triggers.maxDeposit" {...p} />
          <Num label={NexLuckI18n.t("Deposit number")} path="triggers.depositNumber" int {...p} />
          <div className="two">
            <Num label={NexLuckI18n.t("Min deposit count")} hint={NexLuckI18n.t("Minimum number of deposits the player has made. Leave empty for no minimum.")} path="triggers.minDepositCount" int {...p} />
            <Num label={NexLuckI18n.t("Max deposit count")} hint={NexLuckI18n.t("Maximum number of deposits the player has made. Leave empty for no maximum.")} path="triggers.maxDepositCount" int {...p} />
          </div>
        </section>

        <section className={'card' + (highlighted === 'rw' ? ' map-highlight' : '')} style={{ gridArea: 'rw', '--c': '#7b3fc4' }} ref={refs.rw} tabIndex="-1">
          <h3>{NexLuckI18n.t("Reward / value")}</h3>
          <div className="seg" role="group" aria-label={NexLuckI18n.t("Reward type")}>
            <button type="button" aria-pressed={!freeSpinMode} onClick={() => set('reward.mode', 'BONUS_MONEY')}>{NexLuckI18n.t("Bonus money")}</button>
            <button type="button" aria-pressed={freeSpinMode} onClick={() => set('reward.mode', 'FREE_SPINS')}>{NexLuckI18n.t("Free spins")}</button>
          </div>
          {freeSpinMode ? (
            <>
              <Num label={NexLuckI18n.t("Spin quantity")} path="reward.freeSpins.quantity" int {...p} />
              <Num label={NexLuckI18n.t("Distribution: spins per day")} hint={NexLuckI18n.t("Free spins are credited in daily portions. Example: 100 free spins split as 20 spins/day for 5 days.")} path="reward.freeSpins.spinsPerDay" int {...p} />
              <div className="calc">
                <span className="lbl">{NexLuckI18n.t("Distribution")}</span>
                <b>{spinDays ? NexLuckI18n.t('{quantity} free spins split as {perDay} spins/day for {duration}', {
                  quantity: spinQty, perDay: spinsPerDay,
                  duration: new Intl.NumberFormat(NexLuckI18n.formatLocale, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(spinDays)
                }) : '—'}</b>
                {spinDays > 0 && spinQty % spinsPerDay !== 0 && <div className="kvl" style={{ margin: '6px 0 0' }}>{NexLuckI18n.t("The last day gets the remaining ")}{spinQty % spinsPerDay}{NexLuckI18n.t(" spins.")}</div>}
              </div>
            </>
          ) : (
            <>
              <Field label={NexLuckI18n.t("Deposit match percentage (DMP)")} hint={DMP_HINT} error={errors['reward.dmp']}>
                <div className="money"><input type="number" min="0" step="any" value={form.reward.dmp ?? ''} onChange={(e) => set('reward.dmp', e.target.value === '' ? '' : Number(e.target.value))} /><span className="cur" style={{ textDecoration: 'none', cursor: 'default', display: 'grid', placeItems: 'center' }}>%</span></div>
              </Field>
              <Money label={NexLuckI18n.t("Max bonus amount (MBA)")} path="reward.maxBonusAmount" {...p} />
              <div className="calc">
                <span className="lbl">{NexLuckI18n.t("Bonus amount (calculated)")}<Hint text={BONUS_AMOUNT_HINT} /></span>
                <b>{fmt(calculated)}{NexLuckI18n.t(" EUR")}</b>
                <div className="kvl" style={{ margin: '6px 0 0' }}>
                  {dmp === 0 ? NexLuckI18n.t("DMP is 0, so the bonus equals MBA.") : <>{NexLuckI18n.t("for a sample deposit of")}{' '}
                  <input type="number" min="0" value={sample} onChange={(e) => setSample(e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 80, padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 4 }} />{NexLuckI18n.t(" EUR")}</>}
                </div>
              </div>
            </>
          )}
        </section>

        <section className={'card' + (highlighted === 'gm' ? ' map-highlight' : '')} style={{ gridArea: 'gm', '--c': '#4b5ec9' }} ref={refs.gm} tabIndex="-1">
          <h3>{NexLuckI18n.t("Games")}</h3>
          <div className="seg" role="group" aria-label={NexLuckI18n.t("Link bonus to")}>
            <button type="button" aria-pressed={form.games.linkType === 'categories'} onClick={() => set('games.linkType', 'categories')}>{NexLuckI18n.t("Categories")}</button>
            <button type="button" aria-pressed={form.games.linkType === 'game'} onClick={() => set('games.linkType', 'game')}>{NexLuckI18n.t("Single game")}</button>
          </div>
          {form.games.linkType === "game" ? (
            <Field label={NexLuckI18n.t("Game")} error={errors['games.game']}>
              <select value={form.games.game ?? ''} onChange={(e) => set('games.game', e.target.value)}>
                <option value="">{NexLuckI18n.t("Select a game…")}</option>
                {[...new Set(games.map(g => g.category))].map(cat => (
                  <optgroup key={cat} label={cat || 'Uncategorized'}>{games.filter((g) => g.category === cat).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Multi label={NexLuckI18n.t("Game categories")} path="games.categories" options={CATEGORIES.map(([c]) => c)} {...p} />
              <div className="kvl" style={{ margin: 0 }}>{NexLuckI18n.t("Leave empty to allow all games.")}</div>
            </>
          )}
        </section>

        <section className={'card' + (highlighted === 'wg' ? ' map-highlight' : '')} style={{ gridArea: 'wg', '--c': '#c23934' }} ref={refs.wg} tabIndex="-1">
          <h3>{NexLuckI18n.t("Wagering")}</h3>
          <Num label={NexLuckI18n.t("Multiplier")} path="wagering.multiplier" {...p} />
          <Num label={NexLuckI18n.t("Time to complete (days)")} path="wagering.timeToCompleteDays" int {...p} />
          <Select label={NexLuckI18n.t("Applies to")} hint={APPLIES_HINT} path="wagering.appliesTo" options={APPLIES} {...p} />
          <Field label={NexLuckI18n.t("Max withdraw cap")} error={errors['wagering.maxWithdrawCap.type']}>
            <div className="two">
              <select value={cap.type} onChange={(e) => set('wagering.maxWithdrawCap.type', e.target.value)}>
                <option value="">{NexLuckI18n.t("Select…")}</option>
                <option value="MULTIPLIER">{NexLuckI18n.t("MULTIPLIER")}</option><option value="FIXED">{NexLuckI18n.t("FIXED")}</option>
              </select>
              {cap.type === 'FIXED' ? (
                <div className="money">
                  <input type="number" min="0" step="any" aria-label={NexLuckI18n.t("Cap value")} value={cap.value ?? ''} onChange={(e) => set('wagering.maxWithdrawCap.value', e.target.value === '' ? '' : Number(e.target.value))} />
                  <button type="button" className="cur" onClick={() => openRates(Number(cap.value) || 0)}>{NexLuckI18n.t("EUR")}</button>
                </div>
              ) : (
                <div className="money"><input type="number" min="0" step="any" aria-label={NexLuckI18n.t("Cap multiplier")} value={cap.value ?? ''} onChange={(e) => set('wagering.maxWithdrawCap.value', e.target.value === '' ? '' : Number(e.target.value))} /><span className="cur" style={{ textDecoration: 'none', cursor: 'default', display: 'grid', placeItems: 'center' }}>×</span></div>
              )}
            </div>
            {errors[NexLuckI18n.t("wagering.maxWithdrawCap.value")] && <span className="emsg">{errors[NexLuckI18n.t("wagering.maxWithdrawCap.value")]}</span>}
          </Field>
        </section>

        <section className={'card' + (highlighted === 'wl' ? ' map-highlight' : '')} style={{ gridArea: 'wl', '--c': '#0b7a75' }} ref={refs.wl} tabIndex="-1">
          <h3>{NexLuckI18n.t("Wallet rules")}</h3>
          <div className="two">
            <Select label={NexLuckI18n.t("Deduction")} path="walletRules.deduction" options={WALLET} {...p} />
            <Select label={NexLuckI18n.t("Winnings")} path="walletRules.winnings" options={WALLET} {...p} />
          </div>
          <Check label={NexLuckI18n.t("Allow to cancel before wagering")} path="walletRules.allowCancelBeforeWagering" {...p} />
          <Check label={NexLuckI18n.t("Allow withdraw before wagering")} path="walletRules.allowWithdrawBeforeWagering" {...p} />
        </section>

        <section className={'card' + (highlighted === 'ab' ? ' map-highlight' : '')} style={{ gridArea: 'ab', '--c': '#8b3a62' }} ref={refs.ab} tabIndex="-1">
          <h3>{NexLuckI18n.t("Anti-bonus-hunter")}</h3>
          <div className="two">
            <Num label={NexLuckI18n.t("Max claims per IP")} path="antiBonusHunter.maxClaimsPerIp" int {...p} />
            <Num label={NexLuckI18n.t("Max claims per device")} path="antiBonusHunter.maxClaimsPerDevice" int {...p} />
          </div>
          <Check label={NexLuckI18n.t("Block shared IP subnets")} path="antiBonusHunter.blockSharedIpSubnets" {...p} />
          <Check label={NexLuckI18n.t("Block known VPNs and proxies")} path="antiBonusHunter.blockKnownVpnsAndProxies" {...p} />
          <Multi label={NexLuckI18n.t("Payment method blacklist")} path="antiBonusHunter.paymentMethodBlacklist" options={PAYMENT_METHODS} {...p} />
          <Select label={NexLuckI18n.t("Require KYC level before claim")} path="antiBonusHunter.requireKycLevelBeforeClaim" options={KYC_LEVELS} {...p} />
          <Money label={NexLuckI18n.t("Max bet per round")} path="antiBonusHunter.maxBetPerRound" {...p} />
          <Num label={NexLuckI18n.t("Max bet percentage of bonus")} hint={NexLuckI18n.t("Restricts a single wager from exceeding a percentage of the total awarded bonus balance.")} path="antiBonusHunter.maxBetPercentageOfBonus" {...p} />
          <Check label={NexLuckI18n.t("Restrict zero risk betting")} path="antiBonusHunter.restrictZeroRiskBetting" {...p} />
          <Num label={NexLuckI18n.t("Anti-hedging threshold")} hint={ANTI_HEDGING_HINT} path="antiBonusHunter.minEvenMoneyCoveragePercentage" {...p} />
        </section>

        <section className={'card' + (highlighted === 'pc' ? ' map-highlight' : '')} style={{ gridArea: 'pc', '--c': '#087f8c' }} ref={refs.pc} tabIndex="-1">
          <h3>{NexLuckI18n.t("Promo codes")}</h3>
          <PromoCodes bonus={orig} dates={creating ? { startTime: promoDates.startTime || form.availability.startTime, endTime: promoDates.endTime || form.availability.endTime } : promoDates} setDates={setPromoDates} codes={promoCodes} setCodes={setPromoCodes} />
        </section>
      </div>

      {modal && modal.t === "rates" && <RatesModal amount={modal.amount} onClose={() => setModal(null)} />}
      {modal && modal.t === "segments" && <SegmentWidget state={segmentState}
        selected={get(form, modal.path) || []} extraNames={[...(modal.path === 'availability.includeSegments' ? INCLUDE : EXCLUDE), ...(get(form, modal.path) || [])]}
        onClose={() => setModal(null)} onSelect={({ name }) => {
          const values = get(form, modal.path) || [];
          set(modal.path, values.includes(name) ? values.filter(value => value !== name) : [...values, name]);
        }} />}
      {modal && modal.t === "cat" && <CategoryModal value={form.category} onPick={(c) => set('category', c)} onClose={() => setModal(null)} />}
      {modal && modal.t === "promo" && <PromoModal initial={banner} segments={form.availability.includeSegments || []} onClose={() => setModal(null)} onSave={async (b) => {
        if (creating) { setBanner(b); setBannerDirty(true); }
        else setBanner(await api(`/bonuses/${orig.id}/promo-banner`, { method: 'PUT', body: JSON.stringify(b) }));
        setModal(null);
        setStatus({ text: creating ? 'Promo will be saved with the bonus' : 'Promo saved' });
      }} />}
      {modal && modal.t === "log" && <ChangelogModal id={orig.id} onClose={() => setModal(null)} />}
      {showAIAgent && creating && <AIAgentModal onClose={() => { setShowAIAgent(false); history.replaceState(null, '', '/crm/b/e/?new=1'); }} />}
      {showMap && <SatelliteMap title={form.name} items={mapItems} centerInfo={SATELLITE_INFO.ce} onSelect={selectMapNode} onClose={() => setShowMap(false)} />}
    </>
  );
}

CRMContext.mount(() => {
  CATEGORIES = CRMContext.catalogs.categories.filter(category => category.kind === 'static').map(category => [category.id, category.name]);
  ReactDOM.createRoot(document.getElementById('root')).render(<Editor />);
});
