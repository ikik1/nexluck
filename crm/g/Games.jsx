const GAME_API = '/crm/ui-api/v1/games';
const GAME_ATTRIBUTES = [['jackpot', 'Jackpot'], ['free_spins', 'Free spins'], ['desktop', 'Desktop'], ['mobile', 'Mobile']];
const CATEGORY_SORTS = [['popularity', 'Popularity'], ['new', 'New'], ['most_played', 'Most played']];
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
    const keys = ['external_id', 'name', 'enabled', 'segments', 'category_ids', 'deposit_currencies', 'rtp', 'bonus_contribution', 'multiplier', 'variance', 'attributes'];
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
        <label className="field">Tags (comma separated)<input value={draft.tagsText} onChange={e => set('tagsText', e.target.value)} /></label>
        <label className="field">RTP %<input required type="number" min="0" max="100" step="any" value={draft.rtp} onChange={e => set('rtp', e.target.value === '' ? '' : Number(e.target.value))} /></label>
        <label className="field">Bonus contribution override %<input aria-label="Bonus contribution override %" type="number" min="0" max="100" step="any" placeholder="Use provider default" value={draft.bonus_contribution ?? ''} onChange={e => set('bonus_contribution', e.target.value === '' ? null : Number(e.target.value))} /><small>Provider default: {game.provider_bonus_contribution}% (read-only). Leave empty to inherit.</small></label>
        <label className="field">Multiplier<input required type="number" min="0" max="1000000000" step="any" value={draft.multiplier} onChange={e => set('multiplier', e.target.value === '' ? '' : Number(e.target.value))} /></label>
        <label className="field">Variance<select aria-label="Variance" value={draft.variance} onChange={e => set('variance', e.target.value)}>{['low', 'medium', 'high'].map(v => <option key={v}>{v}</option>)}</select></label>
      </div>
      <GameChecks label="Categories" options={categories.filter(c => c.kind === 'static').map(c => [c.id, c.name])} values={draft.category_ids} onChange={v => set('category_ids', v)} />
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

function GameCategoryEditor({ category, categories, games, onSaved, onClose }) {
  const [draft, setDraft] = React.useState(() => ({
    name: '', cms_identifier: '', game_ids: [], segments: [], tags: [], sort_mode: 'manual',
    ...category
  }));
  const [segmentsOpen, setSegmentsOpen] = React.useState(false);
  const segmentState = useCustomerSegments();
  const [tag, setTag] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const set = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const dynamic = category.kind === 'dynamic';
  const tagOptions = [...new Set([...games.flatMap(g => g.tags), ...categories.flatMap(c => c.tags), ...draft.tags])].sort();
  const save = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const keys = ['name', 'cms_identifier', 'segments', 'tags'];
      const saved = await apiRequest(GAME_API + '/categories' + (category.id ? '/' + category.id : ''), {
        method: category.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(keys.map(key => [key, draft[key]])))
      });
      onSaved(saved); onClose();
    } catch (e) { setError(Object.values(e.fields || {}).join('; ') || e.message); }
    finally { setBusy(false); }
  };
  return <SegmentDialog title={category.id ? 'Edit category: ' + category.name : 'New category'} wide busy={busy} onClose={onClose}>
    <form onSubmit={save}>
      <fieldset disabled={busy} className="game-category-fields">
        <div className="edit-grid">
          <label className="field">Category name<input required maxLength={80} value={draft.name} onChange={e => {
            const value = e.target.value;
            setDraft(old => ({ ...old, name: value, cms_identifier: !category.id && old.cms_identifier === old.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')
              ? value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '') : old.cms_identifier }));
          }} /></label>
          <label className="field">CMS identifier<input required maxLength={80} pattern={'[a-z][a-z0-9_\\-]*'} value={draft.cms_identifier} onChange={e => set('cms_identifier', e.target.value)} /></label>
        </div>
        {dynamic && <p className="hint">Dynamic category: games are resolved per customer.</p>}
        <div className="field">Segments<div className="segment-tags">{draft.segments.map(name => <button type="button" key={name} className="segment-tag" aria-label={'Remove category segment ' + name}
          onDoubleClick={() => set('segments', draft.segments.filter(s => s !== name))}
          onKeyDown={e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); set('segments', draft.segments.filter(s => s !== name)); } }}>{name}</button>)}
          <button type="button" className="btn" aria-label="Edit category segments" onClick={() => setSegmentsOpen(true)}>...</button></div></div>
        <GameChecks label="Tags" options={tagOptions.map(t => [t, t])} values={draft.tags} onChange={v => set('tags', v)} />
        <div className="game-category-toolbar"><label className="field">New tag<input maxLength={200} value={tag} onChange={e => setTag(e.target.value)} /></label>
          <button type="button" className="btn" disabled={!tag.trim()} onClick={() => { set('tags', [...new Set([...draft.tags, tag.trim()])]); setTag(''); }}>Add tag</button></div>
      </fieldset>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="customer-actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy}>Save category</button></div>
    </form>
    {segmentsOpen && <SegmentWidget state={segmentState} selected={draft.segments} extraNames={draft.segments} selectionOwner="game category"
      onSelect={({ name }) => set('segments', toggleGameValue(draft.segments, name))} onClose={() => setSegmentsOpen(false)} />}
  </SegmentDialog>;
}

function CategoryGamePicker({ games, publishers, included, busy, error, onAdd, onClose }) {
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState([]);
  const search = query.trim().toLowerCase();
  const add = async ids => {
    if (await onAdd(ids)) setSelected(old => old.filter(id => !ids.includes(id)));
  };
  return <div className="category-game-drawer">
    <SegmentDialog title="Add games" busy={busy} onClose={onClose}>
      <label className="field">Search games to add<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <p className="hint">Double-click a game to add it immediately. Selecting a provider selects all its games, including games hidden by search.</p>
      <div className="category-picker-groups">
        {publishers.map(provider => {
          const group = games.filter(g => g.publisher_id === provider.id);
          const visible = group.filter(g => (g.name + ' ' + g.id + ' ' + provider.name).toLowerCase().includes(search));
          if (!visible.length) return null;
          const available = group.filter(g => !included.includes(g.id));
          const chosen = group.filter(g => included.includes(g.id) || selected.includes(g.id)).length;
          return <fieldset key={provider.id}>
            <legend><label><input type="checkbox" aria-label={'Select provider ' + provider.name} disabled={busy || !available.length}
              checked={chosen === group.length} ref={node => { if (node) node.indeterminate = chosen > 0 && chosen < group.length; }}
              onChange={e => setSelected(old => e.target.checked ? [...new Set([...old, ...available.map(g => g.id)])] : old.filter(id => !group.some(g => g.id === id)))} />
              {provider.name}</label></legend>
            {visible.map(game => <div key={game.id} className={'category-picker-game' + (included.includes(game.id) || selected.includes(game.id) ? ' selected' : '')}
              onDoubleClick={e => { if (!busy && !included.includes(game.id) && !e.target.closest('input')) add([game.id]); }}>
              <label><input type="checkbox" aria-label={'Select game ' + game.name} checked={included.includes(game.id) || selected.includes(game.id)}
                disabled={busy || included.includes(game.id)} onChange={() => setSelected(old => toggleGameValue(old, game.id))} />
                <span>{game.name}<small>{game.id}{included.includes(game.id) ? ' · In category' : ''}</small></span></label>
              <button type="button" className="btn" aria-label={'Add ' + game.name} disabled={busy || included.includes(game.id)} onClick={() => add([game.id])}>+</button>
            </div>)}
          </fieldset>;
        })}
        {!games.some(g => (g.name + ' ' + g.id + ' ' + publishers.find(p => p.id === g.publisher_id)?.name).toLowerCase().includes(search)) && <p className="hint">No games match this search.</p>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="customer-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Done</button>
        <button type="button" className="btn pri" disabled={busy || !selected.some(id => !included.includes(id))}
          onClick={() => add(selected)}>Add selected games</button></div>
    </SegmentDialog>
  </div>;
}

function GameCategories({ categories, games, publishers, selected, onToggle, onSaved, onClose }) {
  const [query, setQuery] = React.useState('');
  const [editing, setEditing] = React.useState(null);
  const [activeId, setActiveId] = React.useState(categories[0]?.id);
  const [sort, setSort] = React.useState('popularity');
  const [dragged, setDragged] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [addingGames, setAddingGames] = React.useState(false);
  const active = categories.find(c => c.id === activeId);
  const persist = async body => {
    setBusy(true); setError('');
    try {
      onSaved(await apiRequest(GAME_API + '/categories/' + active.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }));
      return true;
    } catch (e) { setError(Object.values(e.fields || {}).join('; ') || e.message); return false; }
    finally { setBusy(false); }
  };
  const move = (from, to) => {
    if (busy || from === to) return;
    const ids = active.game_ids.filter(id => id !== from);
    ids.splice(active.game_ids.indexOf(to), 0, from);
    persist({ game_ids: ids, sort_mode: 'manual' });
  };
  return <SegmentDialog title="Game categories" wide busy={busy} onClose={onClose}>
    <div className="game-category-layout">
      <div className="game-category-list">
        <label className="field">Search categories<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <button type="button" className="btn pri" disabled={busy} onClick={() => setEditing({})}>+ New category</button>
        <div className="game-category-scroll" role="region" aria-label="Category list" tabIndex={0}>
        {categories.filter(c => (c.name + ' ' + c.cms_identifier).toLowerCase().includes(query.trim().toLowerCase())).map(c => <div key={c.id}
          className={'game-category-row' + (activeId === c.id ? ' active' : '') + (c.kind === 'dynamic' ? ' dynamic dynamic-' + c.dynamic_kind : '')}>
          <input type="checkbox" aria-label={c.name} disabled={busy || c.kind === 'dynamic'} checked={selected.includes(c.id)} onChange={() => onToggle(c.id)} />
          <div className="category-row-badges" aria-label={'Segments and tags for ' + c.name}>
            {c.segments.map(s => <span key={'segment-' + s} className="segment-tag" title={'Segment: ' + s}>{s}</span>)}
            {c.tags.map(t => <span key={'tag-' + t} className="game-tag" title={'Tag: ' + t}>{t}</span>)}
          </div>
          <button type="button" className="game-category-name" disabled={busy} aria-label={'View games in ' + c.name} onClick={() => { setActiveId(c.id); setError(''); }}>{c.name}
            <small>{c.kind === 'dynamic' ? 'Dynamic / per customer' : c.game_ids.length + ' games'} · {c.cms_identifier}</small></button>
          <button type="button" className="btn" disabled={busy} aria-label={'Edit category ' + c.name} onClick={() => setEditing(c)}>Edit</button>
        </div>)}
        {!categories.some(c => (c.name + ' ' + c.cms_identifier).toLowerCase().includes(query.trim().toLowerCase())) && <p className="hint">No categories match this search.</p>}
        </div>
      </div>
      {active && <section className="game-category-detail" aria-label={'Games in ' + active.name}>
        <h3>{active.name}</h3>
        <div className="segment-tags">{active.segments.map(s => <span key={s} className="segment-tag">{s}</span>)}{active.tags.map(t => <span key={t} className="game-tag">{t}</span>)}</div>
        {active.kind === 'dynamic' ? <p className="hint">Dynamic category definition only. {active.dynamic_kind === 'recent' ? 'Recently played' : 'Favourite'} games are customer-specific and are not resolved in this catalog.</p> : <>
          <p className="hint">Games may belong to many categories. Drag to reorder, or use the move buttons. Statistics below are demo data.</p>
          <div className="game-category-toolbar">
            <label className="field">Predefined sorting<select aria-label="Predefined sorting" value={sort} onChange={e => setSort(e.target.value)}>{CATEGORY_SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <button type="button" className="btn" disabled={busy || !active.game_ids.length} onClick={() => persist({ sort_mode: sort })}>Auto-sort</button>
          </div>
          <div className="category-game-list-toolbar">
            <p className="hint">Current sorting: {CATEGORY_SORTS.find(([key]) => key === active.sort_mode)?.[1] || 'Custom'}</p>
            <button type="button" className="btn" disabled={busy || !active.game_ids.length}
              title="Remove all games from this category only" onClick={() => persist({ game_ids: [] })}>Clear all games</button>
          </div>
          <ol className="category-game-list" aria-label="Ordered category games" tabIndex={0} key={active.id}>
            {active.game_ids.map((id, index) => {
              const game = games.find(g => g.id === id);
              return <li key={id} data-category-game-id={id} draggable={!busy}
                onDragStart={e => { setDragged(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); }}
                onDragOver={e => { if (dragged && dragged !== id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                onDrop={e => { e.preventDefault(); if (dragged && active.game_ids.includes(dragged)) move(dragged, id); setDragged(null); }}
                onDragEnd={() => setDragged(null)}>
                <div className="category-game-info"><strong>{game.name}</strong><small>Popularity: {game.popularity}/100 · Plays: {game.play_count.toLocaleString()} (demo)</small>
                  <div className="game-tag-group">{categories.filter(c => c.game_ids.includes(id)).map(c => <span className="game-tag" key={c.id}>{c.name}</span>)}</div></div>
                <div className="category-game-actions">
                  <button type="button" className="btn" disabled={busy || index === 0} title="Move up" aria-label={'Move up ' + game.name} onClick={() => move(id, active.game_ids[index - 1])}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg></button>
                  <button type="button" className="btn" disabled={busy || index === active.game_ids.length - 1} title="Move down" aria-label={'Move down ' + game.name} onClick={() => move(id, active.game_ids[index + 1])}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button>
                  <button type="button" className="btn" disabled={busy} title="Remove game" aria-label={'Remove ' + game.name + ' from ' + active.name} onClick={() => persist({ game_ids: active.game_ids.filter(v => v !== id) })}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>
                </div>
              </li>;
            })}
          </ol>
          {!active.game_ids.length && <p className="hint">No games yet. Use Add games to choose games.</p>}
          <div className="category-add-games"><button type="button" className="btn pri" disabled={busy} onClick={() => { setError(''); setAddingGames(true); }}>Add games</button></div>
        </>}
      </section>}
    </div>
    {error && !addingGames && <p role="alert" className="error">{error}</p>}
    <div className="customer-actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Done</button></div>
    {addingGames && <CategoryGamePicker games={games} publishers={publishers} included={active.game_ids} busy={busy} error={error}
      onAdd={ids => persist({ game_ids: [...new Set([...active.game_ids, ...ids])] })} onClose={() => setAddingGames(false)} />}
    {editing && <GameCategoryEditor category={editing} categories={categories} games={games}
      onClose={() => setEditing(null)} onSaved={saved => { onSaved(saved); setActiveId(saved.id); }} />}
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
  const [catalog, setGames] = React.useState([]);
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
  const games = catalog.map(game => ({
    ...game, category_ids: categories.filter(c => c.kind === 'static' && c.game_ids.includes(game.id)).map(c => c.id)
  }));
  const closeMenu = React.useCallback(() => setMenu(null), []);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [list, cats, pubs] = await Promise.all([apiRequest(GAME_API), apiRequest(GAME_API + '/categories'), apiRequest(GAME_API + '/publishers')]);
      if (!list.items.every(g => Number.isFinite(g.popularity) && Number.isFinite(g.play_count)) ||
          !cats.items.every(c => ['static', 'dynamic'].includes(c.kind) && Array.isArray(c.game_ids))) {
        throw new Error('Game catalog API is out of date. Restart the CRM API server, then retry.');
      }
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
    const text = [g.id, g.external_id, g.name, pub?.name, ...g.category_ids.map(categoryName), ...g.tags, ...g.segments].join(' ').toLowerCase();
    return filters.q.toLowerCase().trim().split(/\s+/).every(t => text.includes(t)) &&
      (!filters.status || g.enabled === (filters.status === 'enabled')) &&
      (!filters.publisher || g.publisher_id === filters.publisher) &&
      (!filters.currency || g.deposit_currencies.includes(filters.currency)) &&
      (!filters.variance || g.variance === filters.variance) &&
      (!filters.attribute || g.attributes.includes(filters.attribute)) &&
      (!filters.segment || g.segments.includes(filters.segment)) && (!filters.tag || g.tags.includes(filters.tag)) &&
      (!selectedCategories.length || g.category_ids.some(id => selectedCategories.includes(id)));
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
    <div className="game-table"><table><thead><tr>{['ID', 'ExternalID', 'Name', 'Status', 'Created_at', 'Segments / Tags / Categories', 'Popularity /100 (demo)', 'Play count (demo)', 'RTP %', 'Deposit currencies', 'Bonus contribution %', 'Multiplier', 'Variance', 'Game attributes', 'Edit'].map(h => <th key={h}>{h}</th>)}</tr></thead>
      {publishers.map(pub => {
        const rows = filtered.filter(g => g.publisher_id === pub.id);
        if (!rows.length) return null;
        return <tbody key={pub.id}><tr className="publisher-row"><th scope="rowgroup" colSpan="15"><span className="publisher-heading"><img src={pub.logo} alt={pub.name + ' publisher mark'} />{pub.name}<small>{rows.length} games</small></span></th></tr>
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
              <div className="game-tag-group"><small>Categories</small>{g.category_ids.map(id => <span key={id} className="game-tag">{categoryName(id)}</span>)}</div></td>
            <td className="num">{g.popularity}</td><td className="num">{g.play_count.toLocaleString()}</td>
            <td className="num">{g.rtp}%</td><td><div className="game-tag-group">{g.deposit_currencies.map(c => <span className="game-tag" key={c}>{c}</span>)}</div></td>
            <td className="num">{g.bonus_contribution ?? g.provider_bonus_contribution}%<span className="game-provider-default" title="Provider default">({g.provider_bonus_contribution}%)</span></td>
            <td>{g.multiplier}</td><td>{g.variance}</td><td><div className="game-tag-group">{GAME_ATTRIBUTES.filter(([key]) => g.attributes.includes(key)).map(([key, label]) => <span className="game-tag" key={key}>{label}</span>)}</div></td>
            <td><button className="game-edit" type="button" aria-label={'Modify ' + g.name} onClick={() => setEditing(g)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 14.75V17h2.25L15.9 6.35l-2.25-2.25L3 14.75Z" /><path d="m12.8 5.2 2.25 2.25M3 17h14" /></svg></button></td>
          </tr>)}</tbody>;
      })}
      {!loading && !filtered.length && <tbody><tr><td colSpan="15" className="empty">No games match the filters.</td></tr></tbody>}
    </table></div>
    {categoryOpen && <GameCategories categories={categories} games={games} publishers={publishers} selected={selectedCategories}
      onToggle={id => setSelectedCategories(old => toggleGameValue(old, id))} onClose={() => setCategoryOpen(false)}
      onSaved={saved => setCategories(old => old.some(c => c.id === saved.id) ? old.map(c => c.id === saved.id ? saved : c) : [...old, saved])} />}
    {editing && <GameEditor game={editing} categories={categories} onClose={() => setEditing(null)} onSave={saved => { updateGame(saved); setEditing(null); load(); }} />}
    {menu && <GameContextMenu menu={menu} onClose={closeMenu} onToggle={toggleStatus} />}
  </>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<GamesPage />);
