import React, { useEffect, useRef, useState } from 'react';
import { t } from './i18n';

export function PageManagement({ pages, selected, busy, onSelect, onCreate }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [copy, setCopy] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    const close = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return <div className="page-management" ref={root} onKeyDown={event => {
    if (event.key === 'Escape') { setOpen(false); root.current.querySelector('button').focus(); }
  }}>
    <button aria-label={t("Page management")} aria-expanded={open} aria-controls="cms-page-navigation"
      disabled={busy} onClick={() => setOpen(!open)}>☰</button>
    {open && <section id="cms-page-navigation" className="page-navigation" aria-label={t("Page management")}>
      <h2>{t("Pages")}</h2>
      <nav aria-label={t("Page selection")}>{pages.map(page => <button key={page.id} disabled={busy}
        aria-current={page.id === selected ? 'page' : undefined} onClick={async () => {
          if (await onSelect(page.id)) setOpen(false);
        }}>{page.title}<small>/{page.slug === 'home' ? '' : page.slug}</small></button>)}</nav>
      <form onSubmit={async event => {
        event.preventDefault();
        if (await onCreate({ title, slug, ...(copy ? { source_id: selected } : {}) })) {
          setOpen(false); setTitle(''); setSlug(''); setCopy(false);
        }
      }}>
        <h2>{t("New page")}</h2>
        <label>{t("Page title")}<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>{t("Page URL")}<input required maxLength={50} pattern="[a-zA-Z0-9_-]+" value={slug}
          onChange={event => setSlug(event.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={copy} disabled={!selected} onChange={event => setCopy(event.target.checked)} />
          {t("Copy selected page")}</label>
        <button type="submit" disabled={busy}>{t("Create page")}</button>
      </form>
    </section>}
  </div>;
}
