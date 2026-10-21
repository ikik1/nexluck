const { useState, useMemo } = React;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = n => String(n).padStart(2, '0');
const fmt = ts => { const d = new Date(ts); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${p2(d.getFullYear() % 100)}, ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const money = (n, c) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + c;
const signed = (n, c) => (n >= 0 ? '+' : '−') + money(Math.abs(n), c);
const PAGE = 25;

function Wallets() {
  const countryList = [...new Set(WALLETS.map(wallet => wallet.country))].sort((a, b) => (COUNTRIES[a] || [a])[0].localeCompare((COUNTRIES[b] || [b])[0]));
  const empty = { player: '', segment: '', country: '', type: '' };
  const [f, setF] = useState(empty);
  const [tab, setTab] = useState('wallets');
  const [wallet, setWallet] = useState(null);
  const [txType, setTxType] = useState('');
  const [shown, setShown] = useState(PAGE);
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setShown(PAGE); };
  const match = o => (!f.player || o.player.toLowerCase().includes(f.player.trim().toLowerCase()))
    && (!f.segment || o.segments.includes(f.segment)) && (!f.country || o.country === f.country)
    && (!f.type || (o.walletType || o.type) === f.type);
  const wallets = useMemo(() => WALLETS.filter(match), [f]);
  const txs = useMemo(() => WALLET_TX.filter(t => (!wallet || t.wallet === wallet.id) && (!txType || t.type === txType)
    && (!f.player || t.player.toLowerCase().includes(f.player.trim().toLowerCase())) && (!f.segment || t.segments.includes(f.segment))
    && (!f.country || t.country === f.country) && (!f.type || t.walletType === f.type)), [f, wallet, txType]);
  const open = w => { setWallet(w); setTab('tx'); setShown(PAGE); setTxType(''); };
  const dirty = JSON.stringify(f) !== JSON.stringify(empty);
  const byCur = {};
  wallets.forEach(w => { byCur[w.currency] = (byCur[w.currency] || 0) + w.balance; });
  return (
    <>
      <div className="tools" style={{ margin: '8px 0 0' }}><FinanceMenu current="/crm/f/wallets/" /></div>
      <div className="ff">
        <label className="fld q">Player<input type="text" placeholder="Search by player name…" value={f.player} onChange={e => set('player', e.target.value)} /></label>
        <label className="fld">Segment<select value={f.segment} onChange={e => set('segment', e.target.value)}><option value="">All segments</option>{ALL_SEGMENTS.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="fld">Country<select value={f.country} onChange={e => set('country', e.target.value)}><option value="">All countries</option>{countryList.map(c => <option key={c} value={c}>{(COUNTRIES[c] || [c])[0]}</option>)}</select></label>
        <label className="fld">Wallet type<select value={f.type} onChange={e => set('type', e.target.value)}><option value="">All wallet types</option>{WALLET_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
        {dirty && <button className="link" style={{ paddingBottom: 10 }} onClick={() => { setF(empty); setShown(PAGE); }}>Clear filters</button>}
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'wallets'} className={'tab' + (tab === 'wallets' ? ' on' : '')} onClick={() => setTab('wallets')}>Wallets ({wallets.length})</button>
        <button role="tab" aria-selected={tab === 'tx'} className={'tab' + (tab === 'tx' ? ' on' : '')} onClick={() => { setTab('tx'); setShown(PAGE); }}>Wallet transactions ({txs.length})</button>
      </div>
      {tab === 'wallets' && (
        <>
          <div className="tot">{Object.keys(byCur).sort().map(c => <div key={c}>Total {c}<b>{money(byCur[c], c)}</b></div>)}</div>
          <div className="wrap">
            <table className="bt" style={{ minWidth: 820 }}>
              <thead><tr><th>Player</th><th>Country</th><th>Segments</th><th>Wallet</th><th>Wallet type</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
              <tbody>
                {wallets.map(w => (
                  <tr key={w.id} className="clk" onClick={() => open(w)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') open(w); }} aria-label={`${w.player} ${w.type} wallet, ${money(w.balance, w.currency)}`}>
                    <td className="brand-n">{w.player}</td>
                    <td><span className="tag c" title={COUNTRIES[w.country][0]}>{w.country}</span></td>
                    <td>{w.segments.map(s => <span key={s} className="tag">{s}</span>)}</td>
                    <td>{w.id}</td>
                    <td><span className={'wt ' + w.type}>{w.type}</span></td>
                    <td className="num"><b>{money(w.balance, w.currency)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!wallets.length && <div className="empty">No wallets match these filters.</div>}
          </div>
        </>
      )}
      {tab === 'tx' && (
        <>
          {wallet && (
            <div className="sel">
              <span><b>{wallet.player}</b> · {wallet.id}</span>
              <span className={'wt ' + wallet.type}>{wallet.type}</span>
              <span>Balance <b>{money(wallet.balance, wallet.currency)}</b></span>
              <button className="link" onClick={() => { setWallet(null); setShown(PAGE); }}>Show all wallets</button>
            </div>
          )}
          <div className="ff" style={{ margin: '0 0 8px' }}>
            <label className="fld">Transaction type<select value={txType} onChange={e => { setTxType(e.target.value); setShown(PAGE); }}><option value="">All types</option>{WALLET_TX_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
          </div>
          <div className="wrap">
            <table className="bt" style={{ minWidth: 900 }}>
              <thead><tr><th>Date</th><th>Player</th><th>Wallet</th><th>Type</th><th>Details</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Balance after</th></tr></thead>
              <tbody>
                {txs.slice(0, shown).map(t => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(t.ts)}</td>
                    <td>{t.player}</td>
                    <td><span className={'wt ' + t.walletType}>{t.walletType}</span></td>
                    <td>{t.type}</td>
                    <td>{t.note}</td>
                    <td className={'num ' + (t.amount >= 0 ? 'pos' : 'neg')}>{signed(t.amount, t.currency)}</td>
                    <td className="num">{money(t.balance, t.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!txs.length && <div className="empty">No wallet transactions match these filters.</div>}
          </div>
          {txs.length > shown && <div className="pg"><button className="new-btn" onClick={() => setShown(s => s + PAGE)}>Show more ({txs.length - shown})</button></div>}
        </>
      )}
    </>
  );
}

CRMContext.mount(() => ReactDOM.createRoot(document.getElementById('root')).render(<Wallets />));
