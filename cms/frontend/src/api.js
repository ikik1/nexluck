import { t } from './i18n';
export async function api(url, options = {}) {
  const csrf = document.cookie.split('; ').find(c => c.startsWith('nexluck_cms_site_csrf='))?.split('=')[1];
  const response = await fetch(url, {
    credentials: 'same-origin', ...options,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(csrf || ''), ...options.headers }
  });
  const body = await response.json();
  if (!response.ok) {
    const message = body.detail || JSON.stringify(body);
    throw new Error(response.status === 409 ? t("Another editor changed this draft. Reload to avoid overwriting it.") : message);
  }
  return body;
}
