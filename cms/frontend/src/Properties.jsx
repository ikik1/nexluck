import { t } from './i18n';
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
    <header><h2>{title}</h2><button aria-label={t("Close {title}", { title })} onClick={onClose}>×</button></header>
    {children}
  </dialog>;
}

function SegmentPicker({ siteId, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [segments, setSegments] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true); setError('');
    try { setSegments((await api(`/cms/api/segments/?site_id=${encodeURIComponent(siteId)}`)).items); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  return <div className="segment-property"><span className="property-label">{t("Custom segments")}</span>
    <div className="segment-tags">{value.map(id => <span className="segment-tag" key={id}>
      {segments.find(s => s.id === id)?.name || id}<button aria-label={t("Remove segment {id}", { id })} onClick={() => onChange(value.filter(v => v !== id))}>×</button>
    </span>)}</div>
    <button onClick={() => setOpen(true)}>{t("Select segments")}</button>
    {error && <p role="alert">{error} <button onClick={load}>{t("Retry segments")}</button></p>}
    {open && <Dialog title={t("Segments")} onClose={() => setOpen(false)}>
      <label>{t("Search segments")}<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <p>{t("Saved CRM segments. Select multiple tags; matches are OR-ed. This filters bonus targeting, not player eligibility.")}</p>
      {error && <p role="alert">{error} <button onClick={load}>{t("Retry segments")}</button></p>}
      {loading ? <p role="status">{t("Loading segments...")}</p> : !error && <SegmentSelection
        entries={segments.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))} selected={value}
        onSelect={s => onChange(value.includes(s.id) ? value.filter(id => id !== s.id) : [...value, s.id])} />}
      {!loading && !error && !segments.some(s => s.name.toLowerCase().includes(query.toLowerCase())) && <p>{t("No matching segments.")}</p>}
      <footer><button onClick={() => setOpen(false)}>{t("Done")}</button></footer>
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
  return <div><span className="property-label">{t("SEO HTML editor")}</span>
    <div className="html-toolbar">{['p', 'h2', 'strong', 'em', 'ul', 'li'].map(tag => <button key={tag} onClick={() => wrap(tag)} aria-label={t("Insert {tag}", { tag })}>{tag}</button>)}</div>
    <textarea ref={ref} aria-label={t("SEO HTML")} className="html-source" value={value} maxLength={maxLength} onChange={e => onChange(e.target.value)} />
    <p>{t("HTML source editor. Safe headings, paragraphs, lists, emphasis and links are retained. Scripts, event handlers, images and unsafe URLs are removed in preview and on save.")}</p>
  </div>;
}

function ArrayField({ value, onChange, label }) {
  const [text, setText] = useState(value.join('\n'));
  return <textarea aria-label={label} value={text} placeholder={t("One ID per line")}
    onChange={e => {
      setText(e.target.value);
      onChange(e.target.value.split('\n').map(v => v.trim()).filter(Boolean));
    }} />;
}

export function Properties({ siteId, block, schema, slots, onChange, onClose, contentLocale, onLocaleChange }) {
  const props = contentLocale === 'en' ? block.props : { ...block.props, ...block.translations?.[contentLocale] };
  const update = (name, value) => contentLocale === 'en'
    ? onChange({ props: { ...block.props, [name]: value } })
    : onChange({ translations: { ...block.translations, [contentLocale]: { ...block.translations?.[contentLocale], [name]: value } } });
  return <Dialog title={t("{module} properties", { module: t(schema.label) })} onClose={onClose}>
    <p>{block.kind} · {t("Changes appear in the private preview. Save draft to persist.")}</p>
    <label>{t("Localization")}<select aria-label={t("Localization")} value={contentLocale} onChange={e => onLocaleChange(e.target.value)}>
      <option value="en">{t("English")}</option><option value="ru">{t("Russian")}</option>
      <option value="pt-PT">{t("Portuguese (Portugal)")}</option><option value="pt-BR">{t("Portuguese (Brazil)")}</option>
      <option value="es">{t("Spanish (Spain)")}</option>
    </select></label>
    {contentLocale !== 'en' && <><p>{t("Missing values for this language fall back to English.")}</p>
      <button onClick={() => onChange({ translations: { ...block.translations, [contentLocale]: {} } })}>
        {t("Reset {language} overrides", { language: t(contentLocale === 'ru' ? "Russian" : contentLocale === 'pt-PT' ?
          "Portuguese (Portugal)" : contentLocale === 'pt-BR' ? "Portuguese (Brazil)" : "Spanish (Spain)")})}
      </button></>}
    <label>{t("Section slot")}<select value={block.slot} onChange={e => onChange({ slot: e.target.value })}>{slots.map(slot => <option key={slot}>{slot}</option>)}</select></label>
    {Object.entries(schema.properties).map(([name, field]) => {
      const value = props[name] ?? field.default ?? '';
      const label = name === 'title' ? t("Module heading") : name === 'limit' ? t("Maximum items") : t(field.title);
      if (field.widget === 'crm-segments') return <SegmentPicker key={`${siteId}:${name}:${contentLocale}`} siteId={siteId} value={value} onChange={v => update(name, v)} />;
      if (field.widget === 'html') return <HTMLField key={`${name}:${contentLocale}`} value={value} maxLength={field.maxLength} onChange={v => update(name, v)} />;
      if (field.type === 'boolean') return <label className="check" key={name}>
        <input type="checkbox" checked={value === true} onChange={e => update(name, e.target.checked)} />{label}
      </label>;
      return <label key={`${name}:${contentLocale}`}>{label}
        {field.enum ? <select value={value} onChange={e => update(name, e.target.value)}>{field.enum.map(v => <option key={v}>{v}</option>)}</select> :
          field.type === 'array' ? <ArrayField label={label} value={value} onChange={v => update(name, v)} /> :
          field.widget === 'textarea' ? <textarea value={value} maxLength={field.maxLength} onChange={e => update(name, e.target.value)} /> :
          <input aria-label={label} type={field.type === 'integer' ? 'number' : 'text'} value={value}
            min={field.minimum} max={field.maximum} maxLength={field.maxLength}
            onChange={e => update(name, field.type === 'integer' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} />}
      </label>;
    })}
    {block.kind === 'promotions' && <p>{t("Newest created first. Bonus external IDs use the CRM bonus ID (the CRM has no separate external-ID field). Empty segment/ID lists mean no filter. Untargeted bonuses match all segments.")}</p>}
    <footer><button className="primary" onClick={onClose}>{t("Done")}</button></footer>
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
  return <div className="cms-context-menu" role="menu" aria-label={t("Module actions")} ref={ref}
    style={{ left: Math.max(8, Math.min(position.x, innerWidth - 220)), top: Math.max(8, Math.min(position.y, innerHeight - 160)) }}
    onKeyDown={e => {
      if (e.key === 'Escape' || e.key === 'Tab') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...ref.current.querySelectorAll('button')], i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    }}>
    <button role="menuitem" onClick={onProperties}>{t("Properties ...")}</button>
    <button role="menuitem" onClick={onVisible}>{block.enabled ? t("Hide") : t("Show")}</button>
    <button role="menuitem" className="danger" onClick={onRemove}>{t("Remove")}</button>
  </div>;
}
