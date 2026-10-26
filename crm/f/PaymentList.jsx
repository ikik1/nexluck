const { useState, useMemo, useEffect, useRef } = React;

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
    <svg viewBox="0 0 1000 480" role="group" aria-label={NexLuckI18n.t("Geo zone map")}>
      {ZONES.map(z => (
        <g key={z} className={'zg' + (selected.includes(z) ? ' on' : '')} onClick={() => toggle(z)} role="button" tabIndex={0} aria-pressed={selected.includes(z)} aria-label={z}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(z); } }}>
          {ZONE_SHAPES[z].pts.map((p, i) => <polygon key={i} className="z" points={p} />)}
          <text className="zl" x={ZONE_SHAPES[z].label[0]} y={ZONE_SHAPES[z].label[1]}>{z === NexLuckI18n.t("United States") ? 'USA' : z}</text>
          <title>{NexLuckI18n.t(z)}</title>
        </g>
      ))}
    </svg>
  );
}

const connInfo = g => {
  const h = (g.id || 1) * 37;
  const base = { online: [99.9, 120], degraded: [97.2, 640], offline: [82.4, 0] }[g.conn || 'online'];
  return { uptime: (base[0] - (h % 7) / 100).toFixed(2) + '%', latency: g.conn === 'offline' ? 'n/a' : (base[1] + h % 60) + ' ms', endpoint: 'https://api.' + (g.brand || 'stripe').toLowerCase().replace(/[^a-z0-9]/g, '') + '.example/v2', checked: '13 Oct 26, 11:' + String(10 + h % 40) };
};

function Countries({ codes }) {
  const shown = codes.slice(0, 4);
  return <span title={codes.map(c => COUNTRIES[c] ? COUNTRIES[c][0] : c).join(', ')}>{shown.map(c => <span key={c} className="tag c">{c}</span>)}{codes.length > 4 && <span className="tag g">+{codes.length - 4}</span>}</span>;
}

function BrandSearchPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    const down = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return GATEWAYS;
    return GATEWAYS.filter(g => {
      const countryNames = g.countries.map(c => COUNTRIES[c] ? COUNTRIES[c][0] : c).join(' ');
      const hay = [g.brand, g.desc, ...g.methods, ...g.countries, countryNames].join(' ').toLowerCase();
      return hay.includes(s);
    });
  }, [search]);

  const selectedGw = GATEWAYS.find(g => g.brand === value);

  return (
    <div className="brand-picker" ref={boxRef}>
      <input
        className="dropdown-control"
        type="text"
        placeholder={NexLuckI18n.t("Type to search brand, payment method, country…")}
        value={open ? search : (value ? `${value} — ${selectedGw ? selectedGw.methods.slice(0, 3).join(', ') : ''}` : '')}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        aria-label={NexLuckI18n.t("Payment company brand search")}
      />
      {open && (
        <div className="brand-picker-drop" role="listbox">
          {filtered.map(g => (
            <div
              key={g.id}
              className={'brand-picker-item' + (g.brand === value ? ' hl' : '')}
              role="option"
              aria-selected={g.brand === value}
              onMouseDown={e => {
                e.preventDefault();
                onChange(g.brand);
                setOpen(false);
              }}
            >
              <b>{g.brand} <small style={{ color: '#444', fontWeight: 'normal' }}>({g.desc})</small></b>
              <small>{NexLuckI18n.t("Methods: ")}{g.methods.join(', ')}{NexLuckI18n.t(" · Countries: ")}{g.countries.slice(0, 5).join(', ')}{g.countries.length > 5 ? '…' : ''}</small>
            </div>
          ))}
          {!filtered.length && <div style={{ padding: '8px 10px', color: 'var(--muted)', fontSize: 12 }}>{NexLuckI18n.t("No matching brand found")}</div>}
        </div>
      )}
    </div>
  );
}

function ConnectionModal({ conn, isNew, onSave, onClose }) {
  const segmentState = useCustomerSegments();
  const [showSegments, setShowSegments] = useState(false);
  const [data, setData] = useState(() => {
    const initialBrand = conn.brand || 'Stripe';
    const brandGw = GATEWAYS.find(g => g.brand === initialBrand);
    return {
      id: conn.id || 0,
      name: conn.name || (initialBrand ? `${initialBrand} terminal ${Math.floor(Math.random() * 900 + 100)}` : ''),
      brand: initialBrand,
      currency: conn.currency || (brandGw && brandGw.currencies[0]) || 'EUR',
      segments: conn.segments ? [...conn.segments] : (brandGw ? [...brandGw.segments] : ['REGISTERED']),
      countries: conn.countries ? [...conn.countries] : (brandGw ? [...brandGw.countries] : ['DE', 'FR']),
      methods: conn.methods ? [...conn.methods] : (brandGw ? [...brandGw.methods] : ['Visa']),
      status: conn.conn || 'online',
      settings: conn.settings ? { ...conn.settings } : defaultSettingsForBrand(initialBrand),
    };
  });

  const [testMsg, setTestMsg] = useState('');
  const [errs, setErrs] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    CRMContext.setDirty('payment-editor', true);
    return () => CRMContext.setDirty('payment-editor', false);
  }, []);

  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const handleBrandChange = newBrand => {
    const brandGw = GATEWAYS.find(g => g.brand === newBrand);
    setData(d => ({
      ...d,
      brand: newBrand,
      name: isNew || d.name.startsWith(d.brand) ? `${newBrand} terminal ${Math.floor(Math.random() * 900 + 100)}` : d.name,
      currency: brandGw && brandGw.currencies.includes(d.currency) ? d.currency : (brandGw ? brandGw.currencies[0] : 'EUR'),
      segments: brandGw ? [...brandGw.segments] : d.segments,
      countries: brandGw ? [...brandGw.countries] : d.countries,
      methods: brandGw ? [...brandGw.methods] : d.methods,
      settings: defaultSettingsForBrand(newBrand),
    }));
  };

  const removeSegment = seg => setData(d => ({ ...d, segments: d.segments.filter(s => s !== seg) }));

  const toggleCountry = code => {
    setData(d => ({
      ...d,
      countries: d.countries.includes(code) ? d.countries.filter(c => c !== code) : [...d.countries, code],
    }));
  };

  const brandGw = GATEWAYS.find(g => g.brand === data.brand);
  const brandCountries = brandGw ? brandGw.countries : Object.keys(COUNTRIES);
  const currentZones = zonesOf(data.countries);

  const settingFields = BRAND_SETTINGS_FIELDS[data.brand] || [
    { k: 'merchant_id', label: NexLuckI18n.t("Merchant / Terminal ID"), placeholder: 'mid_123' },
    { k: 'api_key', label: NexLuckI18n.t("API / Secret Key"), placeholder: '••••••••', secret: true },
    { k: 'endpoint_url', label: NexLuckI18n.t("Gateway Endpoint"), placeholder: 'https://api...' },
  ];

  const updateSetting = (k, v) => {
    setData(d => ({ ...d, settings: { ...d.settings, [k]: v } }));
  };

  const runTest = () => {
    setTestMsg('Live gateway verification is not configured. Saving stores configuration only; it does not verify credentials.');
  };

  const handleSave = async () => {
    if (saving) return;
    const e = [];
    if (!data.name.trim()) e.push('Connection name is required.');
    if (!data.brand) e.push('Payment brand must be selected.');
    if (!data.countries.length) e.push('Select at least one country.');
    setErrs(e);
    if (!e.length) {
      setSaving(true);
      try { await onSave({
        ...conn,
        id: data.id,
        name: data.name.trim(),
        brand: data.brand,
        currency: data.currency,
        segments: data.segments,
        countries: data.countries,
        methods: data.methods,
        conn: data.status,
        settings: data.settings,
      }); } catch (error) {
        setErrs([error.message || 'Could not save the payment connection.']);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg wide" role="dialog" aria-modal="true" aria-label={isNew ? NexLuckI18n.t("New payment connection") : NexLuckI18n.t("Edit payment connection")}>
        <h2>
          <span>{isNew ? NexLuckI18n.t("✦ New payment connection") : NexLuckI18n.t("Edit payment connection: {value1}", { value1: data.name })}</span>
          <button className="x" onClick={onClose} aria-label={NexLuckI18n.t("Close")}>×</button>
        </h2>

        <div className="fld">
          <label>{NexLuckI18n.t("Payment brand ")}<small style={{ color: 'var(--muted)', fontWeight: 'normal' }}>{NexLuckI18n.t("(Search by brand name, method, or country)")}</small></label>
          <BrandSearchPicker value={data.brand} onChange={handleBrandChange} />
        </div>

        <label className="fld">{NexLuckI18n.t("Connection name")}<input
            type="text"
            value={data.name}
            maxLength={100}
            onChange={e => setData(d => ({ ...d, name: e.target.value }))}
            placeholder={NexLuckI18n.t("e.g. Stripe terminal 101 for highrisk")}
          />
        </label>

        <div className="cfg">
          <label className="fld">{NexLuckI18n.t("Currency")}<select value={data.currency} onChange={e => setData(d => ({ ...d, currency: e.target.value }))}>
              {(brandGw ? brandGw.currencies : CURRENCIES).map(c => <option key={c} value={c}>{NexLuckI18n.t(c)}</option>)}
            </select>
          </label>

          <label className="fld">{NexLuckI18n.t("Status")}<select value={data.status} onChange={e => setData(d => ({ ...d, status: e.target.value }))}>
              <option value="online">{NexLuckI18n.t("Connected (online)")}</option>
              <option value="degraded">{NexLuckI18n.t("Degraded")}</option>
              <option value="offline">{NexLuckI18n.t("Disconnected (offline)")}</option>
            </select>
          </label>
        </div>

        <div className="fld" style={{ marginTop: 8 }}>
          <label>{NexLuckI18n.t("Connection settings ")}<span className="badge-prep">{NexLuckI18n.t("specific to ")}{data.brand}</span></label>
          <div className="set-grid">
            {settingFields.map(f => (
              <label key={f.k} className="fld" style={{ margin: 0 }}>
                {NexLuckI18n.t(f.label)}
                <input
                  type={f.secret ? 'password' : 'text'}
                  value={data.settings[f.k] || ''}
                  placeholder={f.placeholder || ''}
                  onChange={e => updateSetting(f.k, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="fld" style={{ marginTop: 8 }}>
          <label>{NexLuckI18n.t("Segments ")}<small style={{ color: 'var(--muted)', fontWeight: 'normal' }}>{NexLuckI18n.t("(Player groups eligible for this connection)")}</small></label>
          <div className="segs">
            {data.segments.map(s => <SegmentTag as="button" type="button" key={s} className="tag-chk on" segment={s} segments={segmentState.segments}
              labelPrefix={NexLuckI18n.t("Remove segment ")} title={NexLuckI18n.t("Double-click to remove; press Delete or Backspace to remove")}
              onDoubleClick={() => removeSegment(s)} onKeyDown={e => {
                if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSegment(s); }
              }} />)}
            <button type="button" className="new-btn" aria-label={NexLuckI18n.t("Edit connection segments")} onClick={() => setShowSegments(true)}>...</button>
          </div>
        </div>

        <div className="fld" style={{ marginTop: 8 }}>
          <label>{NexLuckI18n.t("Countries ")}<span className="badge-prep">{NexLuckI18n.t("Pre-populated from ")}{data.brand}</span>
            <small style={{ color: 'var(--muted)', marginLeft: 8 }}>({data.countries.length}{NexLuckI18n.t(" selected)")}</small>
          </label>
          <div className="cbox-grid">
            {brandCountries.map(code => (
              <label key={code}>
                <input type="checkbox" checked={data.countries.includes(code)} onChange={() => toggleCountry(code)} />
                {COUNTRIES[code] ? COUNTRIES[code][0] : code} ({code})
              </label>
            ))}
          </div>
        </div>

        <div className="fld" style={{ marginTop: 8 }}>
          <label>{NexLuckI18n.t("Geo zones ")}<span className="badge-prep">{NexLuckI18n.t("Derived from chosen countries")}</span></label>
          <div style={{ marginTop: 4 }}>
            {currentZones.length ? currentZones.map(z => <span key={z} className="tag z">{NexLuckI18n.t(z)}</span>) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>{NexLuckI18n.t("None")}</span>}
          </div>
        </div>

        {testMsg && (
          <div className={`test-msg ${testMsg.startsWith('Connection failed') ? 'fail' : 'ok'}`} role="status">
            <span>{testMsg.startsWith('Connection failed') ? '⚠️' : '✓'}</span>
            <span>{testMsg}</span>
          </div>
        )}

        {errs.map(e => <div key={e} className="err" role="alert">{e}</div>)}

        <div className="dfoot">
          <button type="button" className="new-btn btn-left" onClick={runTest}>{NexLuckI18n.t("⚡ Test connection")}</button>
          <button type="button" className="new-btn" onClick={onClose}>{NexLuckI18n.t("Cancel")}</button>
          <button type="button" className="new-btn pri" disabled={saving} onClick={handleSave}>{saving ? NexLuckI18n.t("Saving…") : NexLuckI18n.t("Save connection")}</button>
        </div>
        {showSegments && <SegmentWidget state={segmentState} selected={data.segments}
          extraNames={[...ALL_SEGMENTS, ...data.segments]} selectionOwner="payment connection"
          onClose={() => setShowSegments(false)} onSelect={({ name }) =>
            setData(d => ({ ...d, segments: d.segments.includes(name) ? d.segments.filter(value => value !== name) : [...d.segments, name] }))} />}
      </div>
    </div>
  );
}

function PaymentList() {
  const [connections, setConnections] = useState(() => PAYMENT_CONNECTIONS);
  const segmentCatalog = NexLuckSegmentTags.useCatalog(React);
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [zones, setZones] = useState([]);
  const [editConn, setEditConn] = useState(null);
  const [isNew, setIsNew] = useState(false);

  const toggle = z => setZones(a => a.includes(z) ? a.filter(x => x !== z) : [...a, z]);

  const rows = useMemo(() => {
    const terms = applied.toLowerCase().split(/\s+/).filter(Boolean);
    return connections.filter(c => {
      if (zones.length && !c.countries.some(code => zones.includes(zoneOf(code)))) return false;
      const countryNames = c.countries.map(code => COUNTRIES[code] ? COUNTRIES[code][0] : code);
      const hay = [c.name, c.brand, c.currency, ...c.methods, ...c.countries, ...countryNames, ...zonesOf(c.countries), ...c.segments, ...c.segments.map(s => NexLuckSegmentTags.describe(s, segmentCatalog).label)].join(' ').toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }, [connections, applied, zones]);

  const saveConnection = async draft => {
    const saved = await saveFinanceRecord('connections', draft);
    setConnections(list => {
      const idx = list.findIndex(x => x.id === saved.id);
      let updated;
      if (idx >= 0) {
        updated = list.map(x => x.id === saved.id ? saved : x);
      } else {
        updated = [saved, ...list];
      }
      PAYMENT_CONNECTIONS = updated;
      return updated;
    });
    setEditConn(null);
    setIsNew(false);
  };

  const openNew = () => {
    setIsNew(true);
    setEditConn({});
  };

  const openEdit = conn => {
    setIsNew(false);
    setEditConn(conn);
  };

  return (
    <>
      <form className="tools" role="search" onSubmit={e => { e.preventDefault(); setApplied(q.trim()); }}>
        <FinanceMenu current="/crm/f/" />
        <input
          className="search"
          type="search"
          placeholder={NexLuckI18n.t("Search by connection name, brand, payment method, currency, country or geo zone…")}
          value={q}
          onChange={e => { setQ(e.target.value); if (!e.target.value) setApplied(''); }}
          aria-label={NexLuckI18n.t("Search payment connections")}
        />
        <button type="submit" className="new-btn pri">{NexLuckI18n.t("Search")}</button>
        <button type="button" className="new-btn pri" onClick={openNew} style={{ marginLeft: 'auto' }}>{NexLuckI18n.t("+ New connection")}</button>
      </form>

      <div className="mapbox">
        <ZoneMap selected={zones} toggle={toggle} />
        <div>
          <div className="ftitle">{NexLuckI18n.t("Geo zone filter")}</div>
          <div className="fgroup" style={{ margin: '6px 0 10px' }}>
            {ZONES.map(z => <button key={z} className={'chip' + (zones.includes(z) ? ' on' : '')} aria-pressed={zones.includes(z)} onClick={() => toggle(z)}>{NexLuckI18n.t(z)}</button>)}
          </div>
          <p className="mapnote">{zones.length
            ? <>{NexLuckI18n.t("Showing connections available in ")}<b>{zones.join(', ')}</b> ({zones.flatMap(inZone).length}{NexLuckI18n.t(" countries). ")}<button className="link" onClick={() => setZones([])}>{NexLuckI18n.t("Clear")}</button></>
            : NexLuckI18n.t("Click a zone on the map to filter payment connections by the countries it includes.")}</p>
        </div>
      </div>

      <p className="count">{rows.length}{NexLuckI18n.t(" of ")}{connections.length}{NexLuckI18n.t(" payment connections")}</p>
      <div className="wrap">
        <table className="bt">
          <thead><tr><th>{NexLuckI18n.t("Payment Connection")}</th><th>{NexLuckI18n.t("Payment method")}</th><th>{NexLuckI18n.t("Currency")}</th><th>{NexLuckI18n.t("Country")}</th><th>{NexLuckI18n.t("Geo zone")}</th><th>{NexLuckI18n.t("Segments")}</th><th>{NexLuckI18n.t("Connectivity")}</th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td>
                  <div className="brand-n">{c.name}</div>
                  <div className="desc">{NexLuckI18n.t("Brand: ")}<b>{c.brand}</b></div>
                </td>
                <td>{c.methods.map(m => <span key={m} className="tag m">{m}</span>)}</td>
                <td><span className="tag g">{c.currency}</span></td>
                <td><Countries codes={c.countries} /></td>
                <td>{zonesOf(c.countries).map(z => <span key={z} className="tag z">{NexLuckI18n.t(z)}</span>)}</td>
                <td>{c.segments.map(s => <SegmentTag key={s} className="tag" segment={s} segments={segmentCatalog} />)}</td>
                <td>
                  <button
                    className={'cn ' + c.conn}
                    onClick={() => openEdit(c)}
                    title={NexLuckI18n.t("Click to edit payment connection & test connectivity")}
                    aria-label={NexLuckI18n.t("{value1} connectivity: {value2}. Click to edit.", { value1: c.name, value2: CONN[c.conn] })}
                  >
                    <i></i>{NexLuckI18n.t(CONN[c.conn])}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">{NexLuckI18n.t("No payment connections match your search.")}</div>}
      </div>

      {editConn && (
        <ConnectionModal
          conn={editConn}
          isNew={isNew}
          onSave={saveConnection}
          onClose={() => { setEditConn(null); setIsNew(false); }}
        />
      )}
    </>
  );
}

CRMContext.mount(() => ReactDOM.createRoot(document.getElementById('root')).render(<PaymentList />));
