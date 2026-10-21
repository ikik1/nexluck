import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';
import '../../../crm/c/SegmentSelection.js';

const SegmentSelection = globalThis.createSegmentSelection(React);

export function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => { previous?.focus(); };
  }, []);
  return <dialog className="cms-dialog" ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button aria-label={'Close ' + title} onClick={onClose}>×</button></header>
    {children}
  </dialog>;
}

function SegmentPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [segments, setSegments] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true); setError('');
    try { setSegments((await api('/cms/api/segments/')).items); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  return <div className="segment-property"><span className="property-label">Custom segments</span>
    <div className="segment-tags">{value.map(id => <span className="segment-tag" key={id}>
      {segments.find(s => s.id === id)?.name || id}<button aria-label={'Remove segment ' + id} onClick={() => onChange(value.filter(v => v !== id))}>×</button>
    </span>)}</div>
    <button onClick={() => setOpen(true)}>Select segments</button>
    {error && <p role="alert">{error} <button onClick={load}>Retry segments</button></p>}
    {open && <Dialog title="Segments" onClose={() => setOpen(false)}>
      <label>Search segments<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <p>Saved CRM segments. Select multiple tags; matches are OR-ed. This filters bonus targeting, not player eligibility.</p>
      {error && <p role="alert">{error} <button onClick={load}>Retry segments</button></p>}
      {loading ? <p role="status">Loading segments...</p> : !error && <SegmentSelection
        entries={segments.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))} selected={value}
        onSelect={s => onChange(value.includes(s.id) ? value.filter(id => id !== s.id) : [...value, s.id])} />}
      {!loading && !error && !segments.some(s => s.name.toLowerCase().includes(query.toLowerCase())) && <p>No matching segments.</p>}
      <footer><button onClick={() => setOpen(false)}>Done</button></footer>
    </Dialog>}
  </div>;
}

function HTMLField({ value, onChange, maxLength }) {
  const ref = useRef(null);
  const wrap = tag => {
    const input = ref.current, start = input.selectionStart, end = input.selectionEnd;
    const next = value.slice(0, start) + `<${tag}>` + value.slice(start, end) + `</${tag}>` + value.slice(end);
    if (next.length <= maxLength) onChange(next);
    input.focus();
  };
  return <div><span className="property-label">SEO HTML editor</span>
    <div className="html-toolbar">{['p', 'h2', 'strong', 'em', 'ul', 'li'].map(tag => <button key={tag} onClick={() => wrap(tag)} aria-label={'Insert ' + tag}>{tag}</button>)}</div>
    <textarea ref={ref} aria-label="SEO HTML" className="html-source" value={value} maxLength={maxLength} onChange={e => onChange(e.target.value)} />
    <p>HTML source editor. Safe headings, paragraphs, lists, emphasis and links are retained. Scripts, event handlers, images and unsafe URLs are removed in preview and on save.</p>
  </div>;
}

function ArrayField({ value, onChange, label }) {
  const [text, setText] = useState(value.join('\n'));
  return <textarea aria-label={label} value={text} placeholder="One ID per line"
    onChange={e => {
      setText(e.target.value);
      onChange(e.target.value.split('\n').map(v => v.trim()).filter(Boolean));
    }} />;
}

export function Properties({ block, schema, slots, onChange, onClose }) {
  const update = (name, value) => onChange({ props: { ...block.props, [name]: value } });
  return <Dialog title={schema.label + ' properties'} onClose={onClose}>
    <p>{block.kind} · Changes appear in the private preview. Save draft to persist.</p>
    <label>Section slot<select value={block.slot} onChange={e => onChange({ slot: e.target.value })}>{slots.map(slot => <option key={slot}>{slot}</option>)}</select></label>
    {Object.entries(schema.properties).map(([name, field]) => {
      const value = block.props[name] ?? field.default ?? '';
      const label = name === 'title' ? 'Module heading' : name === 'limit' ? 'Maximum items' : field.title;
      if (field.widget === 'crm-segments') return <SegmentPicker key={name} value={value} onChange={v => update(name, v)} />;
      if (field.widget === 'html') return <HTMLField key={name} value={value} maxLength={field.maxLength} onChange={v => update(name, v)} />;
      if (field.type === 'boolean') return <label className="check" key={name}>
        <input type="checkbox" checked={value === true} onChange={e => update(name, e.target.checked)} />{label}
      </label>;
      return <label key={name}>{label}
        {field.enum ? <select value={value} onChange={e => update(name, e.target.value)}>{field.enum.map(v => <option key={v}>{v}</option>)}</select> :
          field.type === 'array' ? <ArrayField label={label} value={value} onChange={v => update(name, v)} /> :
          field.widget === 'textarea' ? <textarea value={value} maxLength={field.maxLength} onChange={e => update(name, e.target.value)} /> :
          <input aria-label={label} type={field.type === 'integer' ? 'number' : 'text'} value={value}
            min={field.minimum} max={field.maximum} maxLength={field.maxLength}
            onChange={e => update(name, field.type === 'integer' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} />}
      </label>;
    })}
    {block.kind === 'promotions' && <p>Newest created first. Bonus external IDs use the CRM bonus ID (the CRM has no separate external-ID field). Empty segment/ID lists mean no filter. Untargeted bonuses match all segments.</p>}
    <footer><button className="primary" onClick={onClose}>Done</button></footer>
  </Dialog>;
}

export function ContextMenu({ position, block, onProperties, onVisible, onRemove, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.querySelector('button').focus();
    const dismiss = e => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); previous?.focus({ preventScroll: true }); };
  }, []);
  return <div className="cms-context-menu" role="menu" aria-label="Module actions" ref={ref}
    style={{ left: Math.max(8, Math.min(position.x, innerWidth - 220)), top: Math.max(8, Math.min(position.y, innerHeight - 160)) }}
    onKeyDown={e => {
      if (e.key === 'Escape' || e.key === 'Tab') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...ref.current.querySelectorAll('button')], i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    }}>
    <button role="menuitem" onClick={onProperties}>Properties ...</button>
    <button role="menuitem" onClick={onVisible}>{block.enabled ? 'Hide' : 'Show'}</button>
    <button role="menuitem" className="danger" onClick={onRemove}>Remove</button>
  </div>;
}
