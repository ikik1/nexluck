import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { ContextMenu, Properties } from './Properties';

function Editor() {
  const [catalog, setCatalog] = useState(null);
  const [siteId, setSiteId] = useState('');
  const [draft, setDraft] = useState(null);
  const [published, setPublished] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewUpdating, setPreviewUpdating] = useState(false);
  const [device, setDevice] = useState('desktop');
  const [crmSites, setCrmSites] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [context, setContext] = useState(null);
  const [properties, setProperties] = useState(false);
  const [dragging, setDragging] = useState('');
  const [dropTarget, setDropTarget] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [newKind, setNewKind] = useState('text');
  const [pluginTitle, setPluginTitle] = useState('');
  const [pluginBody, setPluginBody] = useState('');
  const frame = useRef(null);
  const selectedRef = useRef(null);
  const reorderRef = useRef(null);
  const loadCatalog = async () => {
    const result = await api('/cms/api/bootstrap/');
    setCatalog(result);
    return result;
  };
  useEffect(() => {
    loadCatalog().then(async result => {
      const [websites, modules] = await Promise.all([api('/cms/api/crm-sites/'), api('/cms/api/modules/')]);
      setCrmSites(websites.items); setSchemas(modules.items);
      const requested = new URLSearchParams(location.search).get('crm_site');
      const match = websites.items.find(s => s.crm_id === requested) || (!requested && websites.items[0]);
      if (requested && !match) throw new Error('CRM website not found or not permitted.');
      if (match?.id) setSiteId(String(match.id));
      else if (match && result.can_import) {
        const imported = await api('/cms/api/import/', { method: 'POST', body: JSON.stringify({ crm_id: match.crm_id }) });
        await loadCatalog(); setCrmSites(websites.items.map(s => s.crm_id === match.crm_id ? { ...s, id: imported.id } : s));
        setSiteId(String(imported.id));
      }
    }).catch(e => setError(e.message));
  }, []);
  const reloadDraft = async id => {
    const result = await api(`/cms/api/sites/${id}/draft/`);
    setDraft(result.document); setPublished(result.published_revision); setDirty(false);
    setSelected(result.document.blocks[0]?.key || ''); setPreviewVersion(n => n + 1);
  };
  useEffect(() => {
    if (!siteId) { setDraft(null); return; }
    setDraft(null); setPreviewUrl(''); setError(''); setBusy(true); setProperties(false); setContext(null);
    reloadDraft(siteId).catch(e => setError(e.message)).finally(() => setBusy(false));
  }, [siteId]);
  useEffect(() => {
    if (!draft || !siteId) return;
    let active = true;
    const controller = new AbortController();
    setPreviewUpdating(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api(`/cms/api/sites/${siteId}/previews/`, {
          method: 'POST', body: JSON.stringify(draft), signal: controller.signal
        });
        if (active) { setPreviewUrl(result.url); setPreviewError(''); }
      } catch (e) {
        if (active && e.name !== 'AbortError') setPreviewError('Preview not updated: ' + e.message);
      } finally { if (active) setPreviewUpdating(false); }
    }, 450);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [draft, siteId, previewVersion]);
  useEffect(() => {
    const unload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  useEffect(() => {
    const receive = e => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow || typeof e.data?.key !== 'string') return;
      if (e.data.type === 'cms:select') { setSelected(e.data.key); setContext(null); }
      if (e.data.type === 'cms:context') {
        const rect = frame.current.getBoundingClientRect();
        const x = Number.isFinite(e.data.x) ? e.data.x : 20, y = Number.isFinite(e.data.y) ? e.data.y : 20;
        setSelected(e.data.key); setContext({ x: rect.left + x, y: rect.top + y });
      }
      if (e.data.type === 'cms:reorder') reorderRef.current?.(e.data.key, e.data.target);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'cms:highlight', key: selected }, location.origin);
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected, previewVersion]);
  const task = async work => {
    setBusy(true); setError(''); setStatus('');
    try { await work(); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const change = patch => { setDraft(d => ({ ...d, ...patch })); setDirty(true); setStatus(''); };
  const block = draft?.blocks.find(b => b.key === selected);
  const changeBlock = patch => change({ blocks: draft.blocks.map(b => b.key === selected ? { ...b, ...patch } : b) });
  const reorder = (key, target) => {
    if (!draft || key === target || !draft.blocks.some(b => b.key === key) || !draft.blocks.some(b => b.key === target)) return;
    const blocks = [...draft.blocks], from = blocks.findIndex(b => b.key === key), to = blocks.findIndex(b => b.key === target);
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved); change({ blocks }); setSelected(key);
    setAnnouncement(`${moved.props.title} moved to position ${to + 1}.`);
  };
  reorderRef.current = reorder;
  const openProperties = () => task(async () => {
    setSchemas((await api('/cms/api/modules/')).items); setContext(null); setProperties(true);
  });
  const switchWebsite = crmId => task(async () => {
    if (dirty && !confirm('Discard unsaved draft changes?')) return;
    const match = crmSites.find(s => s.crm_id === crmId);
    if (!match) { setDirty(false); setSiteId(''); return; }
    let id = match.id;
    if (!id) {
      const imported = await api('/cms/api/import/', { method: 'POST', body: JSON.stringify({ crm_id: crmId }) });
      id = imported.id; await loadCatalog();
      setCrmSites(sites => sites.map(s => s.crm_id === crmId ? { ...s, id } : s));
    }
    setDirty(false); setSiteId(String(id));
  });
  const save = () => task(async () => {
    const result = await api(`/cms/api/sites/${siteId}/draft/`, { method: 'PATCH', body: JSON.stringify(draft) });
    setDraft(result.document); setDirty(false); setPublished(result.published_revision);
    setPreviewVersion(n => n + 1); setStatus('Draft saved. Preview updated; public page unchanged.');
  });
  const site = catalog?.sites.find(s => String(s.id) === siteId);
  const slots = catalog?.layouts.find(l => l.key === draft?.layout)?.definition.sections.map(s => s.slot) || ['main'];
  return <>
    <div className="editor-title"><div><h1>Visual page editor</h1><p>NexLuck Demo Layout · CRM-powered modules · Draft / Preview / Publish · <a href="/cms/api/" target="_blank" rel="noopener noreferrer">Module API docs ↗</a></p></div>
      <span className={'state-badge ' + (dirty ? 'unsaved' : '')}>{dirty ? 'Unsaved changes' : draft ? `Draft revision ${draft.revision}` : 'Choose a site'}</span></div>
    {error && <div className="error-panel" role="alert">{error}<button onClick={() => location.reload()}>Reload editor</button></div>}
    {status && <p className="success-panel" role="status">{status}</p>}
    {!catalog ? <p role="status">Loading CMS...</p> : <>
      <div className="editor-toolbar">
        <label>Website<select aria-label="Website" value={site?.crm_id || ''} disabled={busy} onChange={e => switchWebsite(e.target.value)}>
          <option value="">Select a website</option>{crmSites.map(s => <option key={s.crm_id} value={s.crm_id}>{s.name}{!s.enabled ? ' (disabled)' : ''}</option>)}</select></label>
        {draft && <><button disabled={busy || !dirty} onClick={save}>Save draft & preview</button>
          <button disabled={busy} onClick={() => { if (!dirty || confirm('Discard unsaved changes?')) task(() => reloadDraft(siteId)); }}>Reload draft</button>
          <button className="primary" disabled={busy || dirty || !site?.can_publish} onClick={() => task(async () => {
            const result = await api(`/cms/api/sites/${siteId}/publish/`, { method: 'POST', body: JSON.stringify({ revision: draft.revision }) });
            setPublished(result.revision); setStatus(`Published revision ${result.revision}.`);
          })}>Publish</button>{previewUrl && !previewUpdating && !previewError && <a className="button" target="_blank" rel="noopener noreferrer" href={previewUrl + '&standalone=1'}>Preview ↗</a>}
          {published && <a className="button" target="_blank" rel="noopener noreferrer" href={`/cms/sites/${site.slug}/`}>Open published site ↗</a>}
        </>}
      </div>
      {draft ? <div className="editor-workspace">
        <aside className="editor-properties"><fieldset disabled={busy}>
          <h2>Page settings</h2>
          <label>Page title<input maxLength={160} value={draft.title} onChange={e => change({ title: e.target.value })} /></label>
          <label>Theme<select aria-label="Theme" value={draft.theme} onChange={e => change({ theme: e.target.value })}>{catalog.themes.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}</select></label>
          <label>Layout<select aria-label="Layout" value={draft.layout} onChange={e => {
            const firstSlot = catalog.layouts.find(l => l.key === e.target.value).definition.sections[0].slot;
            change({ layout: e.target.value, blocks: draft.blocks.map(b => ({ ...b, slot: firstSlot })) });
          }}>{catalog.layouts.map(l => <option key={l.key} value={l.key}>{l.name}</option>)}</select></label>
          <h2>Modules <small>{draft.blocks.length}/60</small></h2>
          <p className="hint">Drag to reorder. Right-click or press Shift+F10 for properties. Keyboard: Alt+↑ / Alt+↓ reorders.</p>
          <div className="module-list">{draft.blocks.map((b, index) => <button
            className={[selected === b.key ? 'selected' : '', !b.enabled ? 'module-hidden' : '', dragging === b.key ? 'dragging' : '', dropTarget === b.key ? 'drop-target' : ''].join(' ')}
            key={b.key} ref={selected === b.key ? selectedRef : null} draggable disabled={busy}
            data-module-key={b.key}
            onDragStart={e => { setDragging(b.key); e.dataTransfer.setData('text/plain', b.key); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={e => { if (dragging) { e.preventDefault(); setDropTarget(b.key); } }}
            onDrop={e => { e.preventDefault(); reorder(dragging, b.key); setDragging(''); setDropTarget(''); }}
            onDragEnd={() => { setDragging(''); setDropTarget(''); }}
            onContextMenu={e => { e.preventDefault(); setSelected(b.key); setContext({ x: e.clientX, y: e.clientY }); }}
            onKeyDown={e => {
              if (e.key === 'ContextMenu' || e.shiftKey && e.key === 'F10') {
                e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect();
                setSelected(b.key); setContext({ x: rect.right, y: rect.top });
              }
              if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.preventDefault(); const target = draft.blocks[index + (e.key === 'ArrowUp' ? -1 : 1)];
                if (target) reorder(b.key, target.key);
              }
            }}
            onDoubleClick={() => { setSelected(b.key); openProperties(); }}
            onClick={() => { setSelected(b.key); setContext(null); }}>⠿ {b.props.title}{!b.enabled && <small> · hidden</small>}</button>)}</div>
          <p role="status" className="sr-only">{announcement}</p>
          <label>New module<select aria-label="New module" value={newKind} onChange={e => setNewKind(e.target.value)}>{catalog.modules.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
          <button disabled={draft.blocks.length >= 60} onClick={() => {
            const key = 'block-' + crypto.randomUUID(), module = catalog.modules.find(m => m.key === newKind);
            change({ blocks: [...draft.blocks, { key, kind: newKind, slot: slots[0], enabled: true,
              props: schemas.find(s => s.key === newKind)?.defaults || { title: module.label } }] });
            setSelected(key);
          }}>Add module</button>
          <details><summary>Navigation menu</summary>{draft.menu.map((item, i) => <div className="menu-item" key={i}>
            <label>Link label<input value={item.label} onChange={e => change({ menu: draft.menu.map((m, j) => j === i ? { ...m, label: e.target.value } : m) })} /></label>
            <label>Link URL<input value={item.href} onChange={e => change({ menu: draft.menu.map((m, j) => j === i ? { ...m, href: e.target.value } : m) })} /></label>
            <button onClick={() => change({ menu: draft.menu.filter((_, j) => j !== i) })}>Remove link</button>
          </div>)}<button disabled={draft.menu.length >= 20} onClick={() => change({ menu: [...draft.menu, { label: 'New link', href: '/' }] })}>Add link</button></details>
        </fieldset>
        {site?.can_publish && <details><summary>Sample announcements plugin</summary><p>These notices publish immediately to the site's widget feed, separately from page layout publishing.</p>
          <label>Announcement title<input value={pluginTitle} onChange={e => setPluginTitle(e.target.value)} /></label>
          <label>Announcement text<textarea value={pluginBody} onChange={e => setPluginBody(e.target.value)} /></label>
          <button disabled={busy || !pluginTitle.trim() || !pluginBody.trim()} onClick={() => task(async () => {
            await api(`/cms/api/plugins/announcements/${siteId}/`, { method: 'POST', body: JSON.stringify({ title: pluginTitle, body: pluginBody, is_public: true }) });
            setPluginTitle(''); setPluginBody(''); setPreviewVersion(n => n + 1); setStatus('Public announcement added.');
          })}>Publish announcement</button></details>}
        </aside>
        <section className="preview-panel"><div className="preview-toolbar"><strong>Visual preview</strong><label>Viewport<select value={device} onChange={e => setDevice(e.target.value)}><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option></select></label><span>{previewUpdating ? 'Updating preview...' : dirty ? 'Unsaved preview · save to persist' : 'Saved draft · right-click a module to edit'}</span></div>
          {previewError && <p className="error-panel" role="alert">{previewError} <button onClick={() => setPreviewVersion(n => n + 1)}>Retry preview</button></p>}
          <div className={'preview-stage device-' + device}>{previewUrl ? <iframe ref={frame} title="Page preview" src={previewUrl}
            onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'cms:highlight', key: selected }, location.origin)} /> : <p role="status">Preparing private preview...</p>}</div>
        </section>
      </div> : <div className="empty-panel"><h2>Choose a casino website</h2><p>The website list comes from CRM. Selecting a website opens its draft automatically. Existing drafts are never overwritten.</p></div>}
      {context && block && <ContextMenu position={context} block={block} onClose={() => setContext(null)} onProperties={openProperties}
        onVisible={() => { changeBlock({ enabled: !block.enabled }); setContext(null); }}
        onRemove={() => { change({ blocks: draft.blocks.filter(b => b.key !== selected) }); setSelected(''); setContext(null); }} />}
      {properties && block && schemas.find(s => s.key === block.kind) && <Properties siteId={siteId} block={block} slots={slots}
        schema={schemas.find(s => s.key === block.kind)} onChange={changeBlock} onClose={() => setProperties(false)} />}
    </>}
  </>;
}
createRoot(document.getElementById('cms-editor')).render(<Editor />);
