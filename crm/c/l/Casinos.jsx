const CASINO_API = '/crm/ui-api/v1/casinos';
const CASINO_SKINS = [['classic', 'Classic'], ['modern', 'Modern'], ['dark', 'Dark']];
const casinoDate = value => new Date(value).toLocaleString('en-GB', { timeZone: 'UTC' });

function CasinoEditor({ website, onSave, onClose }) {
  const [draft, setDraft] = React.useState(() => website || { name: '', url: '', theme: 'classic' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [fields, setFields] = React.useState({});
  const [source, setSource] = React.useState('');
  const [groups, setGroups] = React.useState([]);
  const [preview, setPreview] = React.useState(null);
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const [previewVersion, setPreviewVersion] = React.useState(0);
  const operationKey = React.useRef(crypto.randomUUID());
  const copyGroups = [['segments', 'Segments'], ['games', 'Games'], ['catalogs', 'Catalogs'], ['payment_connections', 'Payment connections']];
  React.useEffect(() => {
    if (!source) { setPreview(null); setPreviewBusy(false); return; }
    const controller = new AbortController();
    setPreviewBusy(true); setPreview(null); setError('');
    apiRequest(CASINO_API + '/clone-preview', {
      method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: source, groups })
    }).then(result => { if (!controller.signal.aborted) setPreview(result); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setPreviewBusy(false); });
    return () => controller.abort();
  }, [source, groups, previewVersion]);
  React.useEffect(() => {
    CRMContext.setDirty('casino-editor', true);
    return () => CRMContext.setDirty('casino-editor', false);
  }, []);
  const set = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const save = async e => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    try {
      const saved = await apiRequest(CASINO_API + (website ? '/' + website.id : ''), {
        method: website ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operationKey.current },
        body: JSON.stringify({ name: draft.name, url: draft.url, theme: draft.theme,
          ...(!website && source ? { source_id: source, groups, source_revision: preview.source_revision } : {}) })
      });
      onSave(saved);
    } catch (e) { setError(e.message); setFields(e.fields || {}); if (e.status === 409 && source) setPreview(null); }
    finally { setBusy(false); }
  };
  return <SegmentDialog title={website ? 'CMS settings: ' + website.name : 'Add new web-site'} busy={busy} onClose={onClose}>
    <form onSubmit={save}>
      <p className="notice">Website configuration only. Saving does not deploy a website or connect an external CMS.</p>
      <fieldset className="casino-form" disabled={busy}>
        <label className="field">Name<input required maxLength={120} value={draft.name} onChange={e => set('name', e.target.value)} autoFocus /></label>
        <label className="field">URL<input required type="url" maxLength={2048} placeholder="https://casino.example" value={draft.url} onChange={e => set('url', e.target.value)} /></label>
        <label className="field">Theme<select aria-label="Theme" value={draft.theme} onChange={e => set('theme', e.target.value)}>{CASINO_SKINS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {!website && <div className="field">
          <label htmlFor="casino-copy-source">Copy configuration from casino</label>
          <select id="casino-copy-source" value={source} onChange={e => { setSource(e.target.value); setGroups([]); }}>
            <option value="">Do not copy</option>
            {CRMContext.casinos.map(site => <option key={site.id} value={site.id}>{site.name} ({site.id}){site.id === CRMContext.id ? ' - current context' : ''}{site.enabled ? '' : ' (disabled)'}</option>)}
          </select>
          {source && <>
            <p>Choose configuration groups. Required dependency groups are included automatically.</p>
            {copyGroups.map(([key, label]) => {
              const dependency = preview?.dependency_groups.includes(key);
              return <label key={key} style={{ display: 'block' }}><input type="checkbox" checked={groups.includes(key) || Boolean(dependency)} disabled={previewBusy || dependency}
                onChange={e => setGroups(old => e.target.checked ? [...old, key] : old.filter(value => value !== key))} /> {label}{dependency ? ' (required dependency)' : ''}</label>;
            })}
            {previewBusy && <p role="status">Calculating dependencies...</p>}
            <button className="btn" type="button" disabled={busy || previewBusy} onClick={() => setPreviewVersion(value => value + 1)}>Refresh copy preview</button>
            {preview && <div className="notice">
              <strong>Copy preview</strong><p>Source: {CRMContext.casinos.find(site => site.id === source)?.name} ({source}), revision {preview.source_revision}</p>
              <p>Requested: {groups.join(', ') || 'None'}. Required: {preview.dependency_groups.join(', ') || 'None'}.</p>
              <p>{Object.entries(preview.counts).map(([type, count]) => type + ': ' + count).join(' · ')}</p>
              <p>No customers, wallets, transactions, bonuses or CMS pages are copied. Payment credentials are never copied. Connections and cascades will be disabled with Configuration required.</p>
            </div>}
          </>}
        </div>}
        <div className={'casino-skin skin-' + draft.theme} role="img" aria-label={draft.theme + ' website skin preview'}>
          <span className="casino-skin-header">{draft.name.trim() || 'Casino website'}<span>Games · Promotions</span></span>
          <div className="casino-skin-content"><strong>Your next favourite game</strong><div><span /><span /><span /></div></div>
        </div>
      </fieldset>
      {error && <div role="alert" className="error">{error}<ul>{Object.entries(fields).map(([key, text]) => <li key={key}>{key}: {text}</li>)}</ul></div>}
      <div className="customer-actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy || previewBusy || Boolean(source && !preview)}>{busy ? 'Saving…' : website ? 'Save settings' : 'Add web-site'}</button></div>
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
    <button type="button" role="menuitem" disabled={menu.website.id === CRMContext.id} onClick={() => { onClose(); CRMContext.switchTo(menu.website.id); }}>{menu.website.id === CRMContext.id ? 'Current context' : 'Set as CRM Context'}</button>
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
  const [created, setCreated] = React.useState(null);
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
  const saved = async website => {
    setWebsites(old => old.some(s => s.id === website.id) ? old.map(s => s.id === website.id ? website : s) : [...old, website]);
    try { await CRMContext.refreshRegistry(); }
    catch (error) { setError('Website saved, but context selector refresh failed: ' + error.message); }
  };
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
    {created && <p className="notice" role="status">{created.name} created. <button className="btn" onClick={() => CRMContext.switchTo(created.id)}>Set as CRM Context</button></p>}
    {loading && <p role="status">Loading websites...</p>}
    {updating && <p role="status">Updating website status...</p>}
    {!loading && !error && !websites.length && <p role="status" className="notice">No casino websites yet. Add your first web-site.</p>}
    <div className="casino-table"><table><caption>Casino websites</caption><thead><tr>{['Name', 'Created At', 'Updated At', 'Web-site URL', 'CMS', 'Actions'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{websites.map(website => <tr key={website.id} data-website-id={website.id} className={website.enabled ? '' : 'casino-disabled'} tabIndex={0}
        onContextMenu={e => openMenu(e, website)} onKeyDown={e => {
          if (e.target === e.currentTarget && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) openMenu(e, website, true);
        }}>
        <td><strong>{website.name}</strong>{website.id === CRMContext.id && <span className="casino-status enabled">Current context</span>}<span className={'casino-status ' + (website.enabled ? 'enabled' : 'disabled')}>{website.enabled ? 'Enabled' : 'Disabled'}</span></td>
        <td><time dateTime={website.created_at}>{casinoDate(website.created_at)}</time></td><td><time dateTime={website.updated_at}>{casinoDate(website.updated_at)}</time></td>
        <td><a href={website.url} target="_blank" rel="noopener noreferrer">{website.url}</a></td>
        <td><a className="btn" aria-label={'CMS edit ' + website.name} href={'/cms/?crm_site=' + encodeURIComponent(website.id)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 3 5 5M3 17l4-1L17 6a2 2 0 0 0-3-3L4 13l-1 4Z" /></svg>CMS edit</a></td>
        <td><button className="btn" disabled={loading || updating} aria-label={'Website settings ' + website.name} onClick={() => setEditor({ website })}>Settings</button> <button className="btn" disabled={loading || updating} aria-label={'Actions for ' + website.name} aria-haspopup="menu" onClick={e => openMenu(e, website, true)}>…</button></td>
      </tr>)}</tbody></table></div>
    {editor && <CasinoEditor website={editor.website} onClose={() => setEditor(null)} onSave={website => { if (!editor.website) setCreated(website); saved(website); setEditor(null); }} />}
    {menu && <CasinoContextMenu menu={menu} onToggle={toggle} onClose={closeMenu} />}
  </>;
}
CRMContext.mount(() => ReactDOM.createRoot(document.getElementById('root')).render(<CasinosPage />));
