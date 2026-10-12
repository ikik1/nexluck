const { useState, useMemo, useEffect } = React;

const ZONE_SHAPES = {
  'Canada': { pts: ['70,50 200,30 330,40 350,90 300,130 150,135 90,110'], label: [210, 90] },
  'United States': { pts: ['110,145 300,142 335,155 315,205 250,225 180,218 120,192'], label: [220, 182] },
  'LATM': { pts: ['150,235 230,232 262,255 232,278 190,258', '262,282 345,278 375,318 342,405 302,455 282,405 270,335'], label: [312, 345] },
  'Europe': { pts: ['455,92 560,82 592,122 572,162 500,172 450,150'], label: [520, 130] },
  'CIS': { pts: ['596,72 800,62 812,122 702,152 622,152 596,122'], label: [700, 112] },
  'MENA': { pts: ['492,190 640,172 662,212 602,252 502,252 472,222'], label: [565, 218] },
  'Africa': { pts: ['482,266 612,258 642,302 602,382 552,424 512,372 482,312'], label: [555, 335] },
  'SEA': { pts: ['742,235 832,224 862,272 802,302 742,282'], label: [800, 265] },
  'APAC': { pts: ['664,184 742,194 722,262 692,252', '762,152 882,142 912,202 842,217 762,202', '802,342 932,342 942,402 852,422 792,392'], label: [830, 185] },
};

function ZoneMap({ selected, toggle }) {
  return (
    <svg viewBox="0 0 1000 480" role="group" aria-label="Geo zone map">
      {ZONES.map(z => (
        <g key={z} className={'zg' + (selected.includes(z) ? ' on' : '')} onClick={() => toggle(z)} role="button" tabIndex={0} aria-pressed={selected.includes(z)} aria-label={z}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(z); } }}>
          {ZONE_SHAPES[z].pts.map((p, i) => <polygon key={i} className="z" points={p} />)}
          <text className="zl" x={ZONE_SHAPES[z].label[0]} y={ZONE_SHAPES[z].label[1]}>{z === 'United States' ? 'USA' : z}</text>
          <title>{z}</title>
        </g>
      ))}
    </svg>
  );
}

const connInfo = g => {
  const h = g.id * 37;
  const base = { online: [99.9, 120], degraded: [97.2, 640], offline: [82.4, 0] }[g.conn];
  return { uptime: (base[0] - (h % 7) / 100).toFixed(2) + '%', latency: g.conn === 'offline' ? 'n/a' : (base[1] + h % 60) + ' ms', endpoint: 'https://api.' + g.brand.toLowerCase().replace(/[^a-z0-9]/g, '') + '.example/v2', checked: '12 Oct 26, 16:' + String(10 + h % 40) };
};

function ConnModal({ g, onClose }) {
  const [state, setState] = useState(g.conn);
  const [msg, setMsg] = useState('');
  const info = connInfo({ ...g, conn: state });
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const test = () => {
    setMsg('Testing…');
    setTimeout(() => { setMsg(state === 'offline' ? 'No response from the gateway (timeout after 10 s).' : 'Test succeeded: authorization request answered.'); }, 600);
  };
  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={g.brand + ' connectivity'}>
        <h2>{g.brand} connectivity <button className="x" onClick={onClose} aria-label="Close">×</button></h2>
        <dl className="kvs">
          <dt>Status</dt><dd><span className={'cn ' + state} style={{ cursor: 'default' }}><i></i>{CONN[state]}</span></dd>
          <dt>Uptime (30 days)</dt><dd>{info.uptime}</dd>
          <dt>Avg latency</dt><dd>{info.latency}</dd>
          <dt>Endpoint</dt><dd>{info.endpoint}</dd>
          <dt>Last check</dt><dd>{info.checked}</dd>
        </dl>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="new-btn pri" onClick={test}>Test connection</button>
          <span style={{ fontSize: 13, color: '#444' }} aria-live="polite">{msg}</span>
        </div>
      </div>
    </div>
  );
}

function Countries({ codes }) {
  const shown = codes.slice(0, 4);
  return <span title={codes.map(c => COUNTRIES[c][0]).join(', ')}>{shown.map(c => <span key={c} className="tag c">{c}</span>)}{codes.length > 4 && <span className="tag g">+{codes.length - 4}</span>}</span>;
}

function PaymentList() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [zones, setZones] = useState([]);
  const [conn, setConn] = useState(null);
  const toggle = z => setZones(a => a.includes(z) ? a.filter(x => x !== z) : [...a, z]);
  const rows = useMemo(() => {
    const terms = applied.toLowerCase().split(/\s+/).filter(Boolean);
    return GATEWAYS.filter(g => {
      if (zones.length && !g.countries.some(c => zones.includes(zoneOf(c)))) return false;
      const hay = [g.brand, g.desc, ...g.methods, ...g.currencies, ...g.countries, ...g.countries.map(c => COUNTRIES[c][0]), ...zonesOf(g.countries)].join(' ').toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }, [applied, zones]);
  return (
    <>
      <form className="tools" role="search" onSubmit={e => { e.preventDefault(); setApplied(q.trim()); }}>
        <FinanceMenu current="/crm/f/" />
        <input className="search" type="search" placeholder="Search by payment method, currency, brand and description (e.g. Stripe highrisk), country or geo zone…" value={q} onChange={e => { setQ(e.target.value); if (!e.target.value) setApplied(''); }} aria-label="Search payment gateways" />
        <button type="submit" className="new-btn pri">Search</button>
      </form>
      <div className="mapbox">
        <ZoneMap selected={zones} toggle={toggle} />
        <div>
          <div className="ftitle">Geo zone filter</div>
          <div className="fgroup" style={{ margin: '6px 0 10px' }}>
            {ZONES.map(z => <button key={z} className={'chip' + (zones.includes(z) ? ' on' : '')} aria-pressed={zones.includes(z)} onClick={() => toggle(z)}>{z}</button>)}
          </div>
          <p className="mapnote">{zones.length
            ? <>Showing gateways available in <b>{zones.join(', ')}</b> ({zones.flatMap(inZone).length} countries). <button className="link" onClick={() => setZones([])}>Clear</button></>
            : 'Click a zone on the map to filter gateways by the countries it includes.'}</p>
        </div>
      </div>
      <p className="count">{rows.length} of {GATEWAYS.length} payment gateways</p>
      <div className="wrap">
        <table className="bt">
          <thead><tr><th>Brand</th><th>Payment method</th><th>Currency</th><th>Country</th><th>Geo zone</th><th>Segments</th><th>Connectivity</th></tr></thead>
          <tbody>
            {rows.map(g => (
              <tr key={g.id}>
                <td><div className="brand-n">{g.brand}</div><div className="desc">{g.desc}</div></td>
                <td>{g.methods.map(m => <span key={m} className="tag m">{m}</span>)}</td>
                <td>{g.currencies.map(c => <span key={c} className="tag g">{c}</span>)}</td>
                <td><Countries codes={g.countries} /></td>
                <td>{zonesOf(g.countries).map(z => <span key={z} className="tag z">{z}</span>)}</td>
                <td>{g.segments.map(s => <span key={s} className="tag">{s}</span>)}</td>
                <td><button className={'cn ' + g.conn} onClick={() => setConn(g)} aria-label={g.brand + ' connectivity: ' + CONN[g.conn]}><i></i>{CONN[g.conn]}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">No payment gateways match your search.</div>}
      </div>
      {conn && <ConnModal g={conn} onClose={() => setConn(null)} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PaymentList />);
