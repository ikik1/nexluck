import { t } from './i18n';
import React, { useEffect, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { getWidget } from './widgetRegistry';

import.meta.glob('./plugins/*.jsx', { eager: true });

function Widget({ kind, url }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setError('');
      try {
        const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || t("Widget data unavailable."));
        if (!Array.isArray(body.items)) throw new Error(t("Invalid widget data."));
        setData(body);
      } catch (e) {
        if (e.name !== 'AbortError') setError(t(e.message));
      }
    };
    load();
    return () => controller.abort();
  }, [url, attempt]);
  if (error) return <p className="widget-error" role="alert">{error} <button onClick={() => retry(n => n + 1)}>{t("Retry")}</button></p>;
  if (!data) return <p className="widget-status" role="status">{t("Loading catalog...")}</p>;
  const Component = getWidget(kind);
  if (!Component) return <p role="alert">{t("Widget renderer is not installed: {kind}", { kind })}</p>;
  if (!data.items.length) return <p className="widget-status">{t("No content matches these parameters.")}</p>;
  return <Component data={data} />;
}

const islands = JSON.parse(document.getElementById('cms-islands').textContent);
for (const island of islands) {
  const root = [...document.querySelectorAll('[data-island]')].find(el => el.dataset.island === island.key);
  if (root) hydrateRoot(root, <Widget {...island} />, {
    onRecoverableError: error => console.error('CMS widget hydration failed', error)
  });
}
