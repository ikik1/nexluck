const CASINO_API = '/crm/ui-api/v1/casinos';
const CASINO_SKINS = [['classic', 'Classic'], ['modern', 'Modern'], ['dark', 'Dark']];
const casinoDate = value => new Date(value).toLocaleString('en-GB', { timeZone: 'UTC' });

function CasinoEditor({ website, onSave, onClose }) {
  const [draft, setDraft] = React.useState(() => website || { name: '', url: '', theme: 'classic' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [fields, setFields] = React.useState({});
  const set = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const save = async e => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    try {
      const saved = await apiRequest(CASINO_API + (website ? '/' + website.id : ''), {
        method: website ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name, url: draft.url, theme: draft.theme })
      });
      onSave(saved);
    } catch (e) { setError(e.message); setFields(e.fields || {}); }
    finally { setBusy(false); }
  };
  return <SegmentDialog title={website ? 'CMS settings: ' + website.name : 'Add new web-site'} busy={busy} onClose={onClose}>
    <form onSubmit={save}>
      <p className="notice">Website configuration only. Saving does not deploy a website or connect an external CMS.</p>
      <fieldset className="casino-form" disabled={busy}>
        <label className="field">Name<input required maxLength={120} value={draft.name} onChange={e => set('name', e.target.value)} autoFocus /></label>
        <label className="field">URL<input required type="url" maxLength={2048} placeholder="https://casino.example" value={draft.url} onChange={e => set('url', e.target.value)} /></label>
        <label className="field">Theme<select aria-label="Theme" value={draft.theme} onChange={e => set('theme', e.target.value)}>{CASINO_SKINS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className={'casino-skin skin-' + draft.theme} role="img" aria-label={draft.theme + ' website skin preview'}>
          <span className="casino-skin-header">{draft.name.trim() || 'Casino website'}<span>Games · Promotions</span></span>
          <div className="casino-skin-content"><strong>Your next favourite game</strong><div><span /><span /><span /></div></div>
        </div>
      </fieldset>
      {error && <div role="alert" className="error">{error}<ul>{Object.entries(fields).map(([key, text]) => <li key={key}>{key}: {text}</li>)}</ul></div>}
      <div className="customer-actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy}>{busy ? 'Saving…' : website ? 'Save settings' : 'Add web-site'}</button></div>
    </form>
  </SegmentDialog>;
}

function CasinoContextMenu({ menu, onToggle, onClose }) {
  const ref = React.useRef(null);
  const [position, setPosition] = React.useState({ left: menu.x, top: menu.y });
  React.useLayoutEffect(() => {
    const node = ref.current, rect = node.getBoundingClientRect();
    setPosition({ left: Math.max(4, Math.min(menu.x, innerWidth - rect.width - 4)), top: Math.max(4, Math.min(menu.y, innerHeight - rect.height - 4)) });
    node.querySelector('button').focus();
    const close = e => { if (!node.contains(e.target)) onClose(); };
    const key = e => { if (e.key === 'Escape' || e.key === 'Tab') onClose(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    document.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key);
      document.removeEventListener('scroll', onClose, true); window.removeEventListener('resize', onClose);
      menu.trigger.focus();
    };
  }, [menu, onClose]);
  return <div className="casino-menu" role="menu" aria-label="Website actions" ref={ref} style={position}>
    <button type="button" role="menuitem" onClick={() => onToggle(menu.website)}>{menu.website.enabled ? 'Disable' : 'Enable'}</button>
  </div>;
}

function CasinosPage() {
  const [websites, setWebsites] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [updating, setUpdating] = React.useState(false);
  const [editor, setEditor] = React.useState(null);
  const [menu, setMenu] = React.useState(null);
  const closeMenu = React.useCallback(() => setMenu(null), []);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await apiRequest(CASINO_API);
      if (!Array.isArray(result.items)) throw new Error('Invalid website list response.');
      setWebsites(result.items);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  React.useEffect(() => { load(); }, []);
  const saved = website => setWebsites(old => old.some(s => s.id === website.id) ? old.map(s => s.id === website.id ? website : s) : [...old, website]);
  const toggle = async website => {
    closeMenu(); setUpdating(true); setError('');
    try {
      saved(await apiRequest(CASINO_API + '/' + website.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !website.enabled })
      }));
    } catch (e) { setError(e.message); }
    finally { setUpdating(false); }
  };
  const openMenu = (e, website, keyboard = false) => {
    e.preventDefault();
    if (updating || loading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ website, trigger: e.currentTarget, x: keyboard ? rect.left + 20 : e.clientX, y: keyboard ? rect.top + 20 : e.clientY });
  };
  return <>
    <div className="casino-tools"><button className="btn pri" disabled={loading || updating} onClick={() => setEditor({ website: null })}>Add new web-site</button>
      <p className="hint">Right-click a row for Disable / Enable, or use its actions button. Dates are UTC. Status is stored configuration only.</p></div>
    {error && <p role="alert" className="error">{error} <button className="btn" onClick={load} disabled={loading || updating}>Retry</button></p>}
    {loading && <p role="status">Loading websites...</p>}
    {updating && <p role="status">Updating website status...</p>}
    {!loading && !error && !websites.length && <p role="status" className="notice">No casino websites yet. Add your first web-site.</p>}
    <div className="casino-table"><table><caption>Casino websites</caption><thead><tr>{['Name', 'Created At', 'Updated At', 'Web-site URL', 'CMS', 'Actions'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{websites.map(website => <tr key={website.id} data-website-id={website.id} className={website.enabled ? '' : 'casino-disabled'} tabIndex={0}
        onContextMenu={e => openMenu(e, website)} onKeyDown={e => {
          if (e.target === e.currentTarget && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) openMenu(e, website, true);
        }}>
        <td><strong>{website.name}</strong><span className={'casino-status ' + (website.enabled ? 'enabled' : 'disabled')}>{website.enabled ? 'Enabled' : 'Disabled'}</span></td>
        <td><time dateTime={website.created_at}>{casinoDate(website.created_at)}</time></td><td><time dateTime={website.updated_at}>{casinoDate(website.updated_at)}</time></td>
        <td><a href={website.url} target="_blank" rel="noopener noreferrer">{website.url}</a></td>
        <td><a className="btn" aria-label={'CMS edit ' + website.name} href={'/cms/?crm_site=' + encodeURIComponent(website.id)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 3 5 5M3 17l4-1L17 6a2 2 0 0 0-3-3L4 13l-1 4Z" /></svg>CMS edit</a></td>
        <td><button className="btn" disabled={loading || updating} aria-label={'Website settings ' + website.name} onClick={() => setEditor({ website })}>Settings</button> <button className="btn" disabled={loading || updating} aria-label={'Actions for ' + website.name} aria-haspopup="menu" onClick={e => openMenu(e, website, true)}>…</button></td>
      </tr>)}</tbody></table></div>
    {editor && <CasinoEditor website={editor.website} onClose={() => setEditor(null)} onSave={website => { saved(website); setEditor(null); }} />}
    {menu && <CasinoContextMenu menu={menu} onToggle={toggle} onClose={closeMenu} />}
  </>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<CasinosPage />);
