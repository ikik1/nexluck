const GAME_API = '/crm/ui-api/v1/games';
const GAME_ATTRIBUTES = [['jackpot', 'Jackpot'], ['free_spins', 'Free spins'], ['desktop', 'Desktop'], ['mobile', 'Mobile']];
const gameDate = value => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });
const toggleGameValue = (values, value) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];

function GameChecks({ label, options, values, onChange }) {
  return <fieldset><legend>{label}</legend><div className="game-checks">
    {options.map(([value, name]) => <label key={value}><input type="checkbox" checked={values.includes(value)} onChange={() => onChange(toggleGameValue(values, value))} />{name}</label>)}
  </div></fieldset>;
}

function GameEditor({ game, categories, onSave, onClose }) {
  const [draft, setDraft] = React.useState(() => ({ ...game, tagsText: game.tags.join(', ') }));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [fields, setFields] = React.useState({});
  const [segmentsOpen, setSegmentsOpen] = React.useState(false);
  const segmentState = useCustomerSegments();
  const set = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const save = async e => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    const keys = ['external_id', 'name', 'enabled', 'segments', 'category', 'deposit_currencies', 'rtp', 'bonus_contribution', 'multiplier', 'variance', 'attributes'];
    const body = Object.fromEntries(keys.map(key => [key, draft[key]]));
    body.tags = [...new Set(draft.tagsText.split(',').map(tag => tag.trim()).filter(Boolean))];
    try {
      const saved = await apiRequest(GAME_API + '/' + game.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      onSave(saved);
    } catch (e) { setError(e.message); setFields(e.fields || {}); }
    finally { setBusy(false); }
  };
  return <SegmentDialog title={'Edit game: ' + game.name} wide busy={busy} onClose={onClose}>
    <form onSubmit={save}>
      <div className="edit-grid">
        <label className="field">ID<input readOnly value={game.id} /></label>
        <label className="field">ExternalID<input required maxLength={120} value={draft.external_id} onChange={e => set('external_id', e.target.value)} /></label>
        <label className="field">Name<input required maxLength={120} value={draft.name} onChange={e => set('name', e.target.value)} /></label>
        <label className="field">Created_at<input readOnly value={game.created_at} /></label>
        <label className="field">Category<select aria-label="Category" value={draft.category} onChange={e => set('category', e.target.value)}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field">Tags (comma separated)<input value={draft.tagsText} onChange={e => set('tagsText', e.target.value)} /></label>
        <label className="field">RTP %<input required type="number" min="0" max="100" step="any" value={draft.rtp} onChange={e => set('rtp', e.target.value === '' ? '' : Number(e.target.value))} /></label>
        <label className="field">Bonus contribution override %<input aria-label="Bonus contribution override %" type="number" min="0" max="100" step="any" placeholder="Use provider default" value={draft.bonus_contribution ?? ''} onChange={e => set('bonus_contribution', e.target.value === '' ? null : Number(e.target.value))} /><small>Provider default: {game.provider_bonus_contribution}% (read-only). Leave empty to inherit.</small></label>
        <label className="field">Multiplier<input required type="number" min="0" max="1000000000" step="any" value={draft.multiplier} onChange={e => set('multiplier', e.target.value === '' ? '' : Number(e.target.value))} /></label>
        <label className="field">Variance<select aria-label="Variance" value={draft.variance} onChange={e => set('variance', e.target.value)}>{['low', 'medium', 'high'].map(v => <option key={v}>{v}</option>)}</select></label>
      </div>
      <label className="segment-boolean"><input type="checkbox" checked={draft.enabled} onChange={e => set('enabled', e.target.checked)} />Enabled</label>
      <div className="field">Segments<div className="segment-tags">{draft.segments.map(name => <button key={name} type="button" className="segment-tag" aria-label={'Remove segment ' + name}
        onDoubleClick={() => set('segments', draft.segments.filter(v => v !== name))} onKeyDown={e => {
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); set('segments', draft.segments.filter(v => v !== name)); }
        }}>{name}</button>)}<button type="button" className="btn" aria-label="Edit game segments" onClick={() => setSegmentsOpen(true)}>...</button></div></div>
      <GameChecks label="Deposit currencies" options={CURRENCIES.map(c => [c, c])} values={draft.deposit_currencies} onChange={v => set('deposit_currencies', v)} />
      <GameChecks label="Game attributes" options={GAME_ATTRIBUTES} values={draft.attributes} onChange={v => set('attributes', v)} />
      {error && <div role="alert" className="error">{error}<ul>{Object.entries(fields).map(([key, message]) => <li key={key}>{key}: {message}</li>)}</ul></div>}
      <div className="customer-actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy}>Save game</button></div>
    </form>
    {segmentsOpen && <SegmentWidget state={segmentState} selected={draft.segments} extraNames={draft.segments} selectionOwner="game"
      onSelect={({ name }) => set('segments', toggleGameValue(draft.segments, name))} onClose={() => setSegmentsOpen(false)} />}
  </SegmentDialog>;
}

function GameCategories({ categories, selected, onToggle, onSaved, onClose }) {
  const [query, setQuery] = React.useState('');
  const [editing, setEditing] = React.useState(null);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const save = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const saved = await apiRequest(GAME_API + '/categories' + (editing.id ? '/' + editing.id : ''), {
        method: editing.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      onSaved(saved); setEditing(null); setName('');
    } catch (e) { setError(Object.values(e.fields || {}).join('; ') || e.message); }
    finally { setBusy(false); }
  };
  return <SegmentDialog title="Game categories" busy={busy} onClose={onClose}>
    <label className="field">Search categories<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <button type="button" className="btn pri" onClick={() => { setEditing({}); setName(''); setError(''); }}>+ New category</button>
    {categories.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase())).map(c => <div key={c.id} className="game-category-row">
      <label><input type="checkbox" checked={selected.includes(c.id)} onChange={() => onToggle(c.id)} />{c.name}</label>
      <button type="button" className="btn" aria-label={'Edit category ' + c.name} onClick={() => { setEditing(c); setName(c.name); setError(''); }}>Edit</button>
    </div>)}
    {!categories.some(c => c.name.toLowerCase().includes(query.trim().toLowerCase())) && <p className="hint">No categories match this search.</p>}
    {editing && <form className="game-category-form" onSubmit={save}>
      <label className="field">Category name<input required maxLength={80} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <button className="btn pri" disabled={busy}>Save category</button><button className="btn" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
    </form>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="customer-actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Done</button></div>
  </SegmentDialog>;
}

function GameContextMenu({ menu, onToggle, onClose }) {
  const ref = React.useRef(null);
  const [position, setPosition] = React.useState({ left: menu.x, top: menu.y });
  React.useEffect(() => {
    const node = ref.current;
    const r = node.getBoundingClientRect();
    setPosition({ left: Math.max(4, Math.min(menu.x, innerWidth - r.width - 4)), top: Math.max(4, Math.min(menu.y, innerHeight - r.height - 4)) });
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
    };
  }, [menu, onClose]);
  return <div className="game-menu" role="menu" aria-label="Game actions" ref={ref} style={position}>
    <button type="button" role="menuitem" onClick={() => onToggle(menu.game)}>{menu.game.enabled ? 'Disable game' : 'Enable game'}</button>
  </div>;
}

function GamesPage() {
  const [games, setGames] = React.useState([]);
  const [categories, setCategories] = React.useState([]);
  const [publishers, setPublishers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [filters, setFilters] = React.useState({ q: '', status: '', publisher: '', currency: '', variance: '', attribute: '', segment: '', tag: '' });
  const [selectedCategories, setSelectedCategories] = React.useState([]);
  const [categoryOpen, setCategoryOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [menu, setMenu] = React.useState(null);
  const [updating, setUpdating] = React.useState(false);
  const closeMenu = React.useCallback(() => setMenu(null), []);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [list, cats, pubs] = await Promise.all([apiRequest(GAME_API), apiRequest(GAME_API + '/categories'), apiRequest(GAME_API + '/publishers')]);
      setGames(list.items); setCategories(cats.items); setPublishers(pubs.items);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  React.useEffect(() => { load(); }, []);
  const updateGame = saved => setGames(old => old.map(g => g.id === saved.id ? saved : g));
  const toggleStatus = async game => {
    closeMenu(); setError(''); setUpdating(true);
    try { updateGame(await apiRequest(GAME_API + '/' + game.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !game.enabled }) })); }
    catch (e) { setError(e.message); }
    finally { setUpdating(false); }
  };
  const categoryName = id => categories.find(c => c.id === id)?.name || id;
  const filtered = games.filter(g => {
    const pub = publishers.find(p => p.id === g.publisher_id);
    const text = [g.id, g.external_id, g.name, pub?.name, categoryName(g.category), ...g.tags, ...g.segments].join(' ').toLowerCase();
    return filters.q.toLowerCase().trim().split(/\s+/).every(t => text.includes(t)) &&
      (!filters.status || g.enabled === (filters.status === 'enabled')) &&
      (!filters.publisher || g.publisher_id === filters.publisher) &&
      (!filters.currency || g.deposit_currencies.includes(filters.currency)) &&
      (!filters.variance || g.variance === filters.variance) &&
      (!filters.attribute || g.attributes.includes(filters.attribute)) &&
      (!filters.segment || g.segments.includes(filters.segment)) && (!filters.tag || g.tags.includes(filters.tag)) &&
      (!selectedCategories.length || selectedCategories.includes(g.category));
  });
  const setFilter = (key, value) => setFilters(old => ({ ...old, [key]: value }));
  const selectFilters = [
    ['status', 'Status', [['enabled', 'Enabled'], ['disabled', 'Disabled']]],
    ['publisher', 'Publisher', publishers.map(p => [p.id, p.name])],
    ['currency', 'Deposit currency', CURRENCIES.map(c => [c, c])],
    ['variance', 'Variance', ['low', 'medium', 'high'].map(v => [v, v])],
    ['attribute', 'Attribute', GAME_ATTRIBUTES],
    ['segment', 'Segment', [...new Set(games.flatMap(g => g.segments))].sort().map(v => [v, v])],
    ['tag', 'Tag', [...new Set(games.flatMap(g => g.tags))].sort().map(v => [v, v])]
  ];
  return <>
    <section className="game-categories"><h2>Game categories <button className="btn" type="button" disabled={loading || !categories.length} onClick={() => setCategoryOpen(true)}>Game categories</button></h2>
      <div className="segment-tags">{selectedCategories.map(id => <span className="segment-tag" key={id}>{categoryName(id)}<button type="button" aria-label={'Remove category filter ' + categoryName(id)} onClick={() => setSelectedCategories(old => old.filter(v => v !== id))}>×</button></span>)}</div>
      {!selectedCategories.length && <p className="hint">All game categories</p>}
    </section>
    <div className="game-filters">
      <label className="field game-search">Search games<input type="search" placeholder="Name, ID, publisher, tag or segment" value={filters.q} onChange={e => setFilter('q', e.target.value)} /></label>
      {selectFilters.map(([key, label, options]) => <label className="field" key={key}>{label}<select aria-label={label} value={filters[key]} onChange={e => setFilter(key, e.target.value)}><option value="">All</option>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>)}
      <button type="button" className="btn" onClick={() => { setFilters({ q: '', status: '', publisher: '', currency: '', variance: '', attribute: '', segment: '', tag: '' }); setSelectedCategories([]); }}>Clear filters</button>
    </div>
    {error && <p role="alert" className="error">{error} <button className="btn" onClick={load}>Retry</button></p>}
    {loading && <p role="status">Loading games...</p>}
    {updating && <p role="status">Updating game status...</p>}
    <p className="count">{filtered.length} of {games.length} games</p>
    <div className="game-table"><table><thead><tr>{['ID', 'ExternalID', 'Name', 'Status', 'Created_at', 'Segments / Tags / Category', 'RTP %', 'Deposit currencies', 'Bonus contribution %', 'Multiplier', 'Variance', 'Game attributes', 'Edit'].map(h => <th key={h}>{h}</th>)}</tr></thead>
      {publishers.map(pub => {
        const rows = filtered.filter(g => g.publisher_id === pub.id);
        if (!rows.length) return null;
        return <tbody key={pub.id}><tr className="publisher-row"><th scope="rowgroup" colSpan="13"><span className="publisher-heading"><img src={pub.logo} alt={pub.name + ' publisher mark'} />{pub.name}<small>{rows.length} games</small></span></th></tr>
          {rows.map(g => <tr key={g.id} data-game-id={g.id} className={'game-row ' + (g.enabled ? 'enabled' : 'disabled')} tabIndex={0}
            onDoubleClick={e => { if (!e.target.closest('button')) setEditing(g); }}
            onKeyDown={e => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter') setEditing(g);
              if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ game: g, x: r.left + 20, y: r.top + 20 }); }
            }}
            onContextMenu={e => { e.preventDefault(); if (!updating) setMenu({ game: g, x: e.clientX, y: e.clientY }); }}>
            <td>{g.id}</td><td>{g.external_id}</td><td className="game-name">{g.name}</td><td className="game-status">{g.enabled ? 'Enabled' : 'Disabled'}</td><td className="num">{gameDate(g.created_at)}</td>
            <td><div className="game-tag-group"><small>Segments</small>{g.segments.map(s => <span className="segment-tag" key={s}>{s}</span>)}</div>
              <div className="game-tag-group"><small>Tags</small>{g.tags.map(t => <span className="game-tag" key={t}>{t}</span>)}</div>
              <div className="game-tag-group"><small>Category</small><span className="game-tag">{categoryName(g.category)}</span></div></td>
            <td className="num">{g.rtp}%</td><td><div className="game-tag-group">{g.deposit_currencies.map(c => <span className="game-tag" key={c}>{c}</span>)}</div></td>
            <td className="num">{g.bonus_contribution ?? g.provider_bonus_contribution}%<span className="game-provider-default" title="Provider default">({g.provider_bonus_contribution}%)</span></td>
            <td>{g.multiplier}</td><td>{g.variance}</td><td><div className="game-tag-group">{GAME_ATTRIBUTES.filter(([key]) => g.attributes.includes(key)).map(([key, label]) => <span className="game-tag" key={key}>{label}</span>)}</div></td>
            <td><button className="game-edit" type="button" aria-label={'Modify ' + g.name} onClick={() => setEditing(g)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 14.75V17h2.25L15.9 6.35l-2.25-2.25L3 14.75Z" /><path d="m12.8 5.2 2.25 2.25M3 17h14" /></svg></button></td>
          </tr>)}</tbody>;
      })}
      {!loading && !filtered.length && <tbody><tr><td colSpan="13" className="empty">No games match the filters.</td></tr></tbody>}
    </table></div>
    {categoryOpen && <GameCategories categories={categories} selected={selectedCategories}
      onToggle={id => setSelectedCategories(old => toggleGameValue(old, id))} onClose={() => setCategoryOpen(false)}
      onSaved={saved => setCategories(old => old.some(c => c.id === saved.id) ? old.map(c => c.id === saved.id ? saved : c) : [...old, saved])} />}
    {editing && <GameEditor game={editing} categories={categories} onClose={() => setEditing(null)} onSave={saved => { updateGame(saved); setEditing(null); }} />}
    {menu && <GameContextMenu menu={menu} onClose={closeMenu} onToggle={toggleStatus} />}
  </>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<GamesPage />);
