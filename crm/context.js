(function () {
  'use strict';
  const key = 'nexluck.crm.casino-context';
  const nativeFetch = window.fetch.bind(window);
  const reporting = location.pathname.startsWith('/crm/a/');
  const globalPage = reporting || location.pathname.startsWith('/crm/c/l/');
  let casinos = [], active = null, writes = 0, generation = 0, dirty = false, mode = '', transitioning = false, discarding = false;
  let storageWarning = '', contextError = '', mounted = false;
  const dirtySources = new Map();
  const reads = new Set();
  let catalogs = { countries: [], currencies: [], languages: [], providers: [], categories: [] };
  const api = '/crm/ui-api/v1/';

  function url(value, id = active) {
    const target = new URL(value, location.href);
    if (target.origin === location.origin && target.pathname.startsWith('/crm/') && !target.pathname.includes('/api/')) {
      if (id) target.searchParams.set('casino_context', id);
    }
    return target;
  }

  function message(text, kind = 'error') {
    let node = document.getElementById('crm-context-message');
    if (!node) {
      node = document.createElement('div');
      node.id = 'crm-context-message';
      node.setAttribute('role', 'alert');
      (document.getElementById('sub') || document.body).after(node);
    }
    node.className = 'crm-context-message ' + kind;
    node.textContent = NexLuckI18n.t(text);
    node.hidden = !text;
  }

  function savePreference(id) {
    try { sessionStorage.setItem(key, id); }
    catch (error) { storageWarning = 'Tab storage is unavailable. Keep the casino_context URL parameter when navigating.'; }
    history.replaceState(history.state, '', url(location.href, id));
  }

  function decorateLinks(node = document) {
    if (!active) return;
    const links = node.querySelectorAll ? node.querySelectorAll('a[href]') : [];
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      const target = new URL(href, location.href);
      if (target.origin !== location.origin || !target.pathname.startsWith('/crm/') ||
          /\.(md|ya?ml|json|svg)$/.test(target.pathname) || target.pathname.includes('-api/')) return;
      target.searchParams.set('casino_context', active);
      const value = target.pathname + target.search + target.hash;
      if (href !== value) link.setAttribute('href', value);
    });
  }

  function renderSelector() {
    const box = document.getElementById('crm-context');
    if (!box) return;
    box.replaceChildren();
    const label = document.createElement('label');
    label.textContent = NexLuckI18n.t("Context");
    label.htmlFor = 'crm-context-select';
    const select = document.createElement('select');
    select.id = 'crm-context-select';
    select.setAttribute('aria-label', NexLuckI18n.t("Context"));
    select.disabled = !casinos.length;
    if (!casinos.some(casino => casino.id === active)) {
      const empty = new Option(NexLuckI18n.t(casinos.length ? 'Select a casino' : 'No casino available'), '');
      select.add(empty);
    }
    casinos.forEach(casino => {
      const duplicate = casinos.filter(other => other.name === casino.name).length > 1;
      select.add(new Option(casino.name + (duplicate ? ' (' + casino.id + ')' : '') + (casino.enabled ? '' : NexLuckI18n.t(' (disabled)')), casino.id));
    });
    select.value = active || '';
    select.onchange = async event => {
      const requested = event.target.value;
      event.target.value = active || '';
      if (requested) await switchTo(requested);
    };
    box.append(label, select);
    let warning = document.getElementById('crm-context-warning');
    if (!warning) {
      warning = document.createElement('div');
      warning.id = 'crm-context-warning';
      warning.className = 'crm-context-message warning';
      warning.setAttribute('role', 'status');
      document.getElementById('hdr').after(warning);
    }
    const disabled = casinos.find(casino => casino.id === active)?.enabled === false;
    warning.textContent = [
      disabled ? 'This casino website is disabled. CRM editing is still available.' : '',
      mode === 'demo' ? 'Demo CRM: authentication is not enabled. Do not use for production customer data.' : '',
      storageWarning
    ].filter(Boolean).map(text => NexLuckI18n.t(text)).join(' ');
    warning.hidden = !warning.textContent;
    message(contextError);
    decorateLinks();
  }

  async function jsonFetch(path, options = {}) {
    options = { ...options, headers: { ...options.headers, 'Accept-Language': NexLuckI18n.locale } };
    const response = await nativeFetch(path, options);
    if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error(NexLuckI18n.t("CRM API unavailable (HTTP ") + response.status + ').');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || NexLuckI18n.t("CRM request failed (") + response.status + ').');
    return result;
  }

  async function refreshRegistry() {
    const result = await jsonFetch(api + 'casinos');
    if (!Array.isArray(result.items)) throw new Error(NexLuckI18n.t("Invalid casino registry response."));
    casinos = result.items.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    mode = result.mode;
    renderSelector();
    return casinos;
  }

  async function initialize() {
    try {
      await refreshRegistry();
      const explicit = new URL(location.href).searchParams.get('casino_context');
      let restored = null;
      if (explicit === null) {
        try { restored = sessionStorage.getItem(key); }
        catch (error) { storageWarning = 'Tab storage is unavailable. Context will be retained in navigation URLs.'; }
      }
      const candidate = explicit === null ? restored : explicit;
      if (candidate !== null && !casinos.some(casino => casino.id === candidate)) {
        contextError = 'The requested casino context is unavailable or not permitted. Select a valid casino to continue.';
      } else if (candidate) {
        active = candidate;
      } else if (casinos.length) {
        active = casinos[0].id;
      }
      if (active) savePreference(active);
      renderSelector();
    } catch (error) {
      contextError = error.message;
      renderSelector();
    }
  }

  function confirmDiscard() {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'crm-context-dialog';
      const title = document.createElement('p');
      title.textContent = NexLuckI18n.t("Discard unsaved changes and switch casino?");
      const stay = document.createElement('button');
      stay.textContent = NexLuckI18n.t("Stay"); stay.className = 'btn';
      const discard = document.createElement('button');
      discard.textContent = NexLuckI18n.t("Discard and switch"); discard.className = 'btn pri';
      const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
      stay.onclick = () => finish(false);
      discard.onclick = () => finish(true);
      dialog.oncancel = event => { event.preventDefault(); finish(false); };
      dialog.append(title, stay, discard);
      document.body.append(dialog);
      dialog.showModal();
      stay.focus();
    });
  }

  async function switchTo(id) {
    if (!id || id === active) return;
    if (writes) { message(NexLuckI18n.t("A save is in progress. Wait for its result before changing casino.")); return; }
    if (!reporting && (dirty || [...dirtySources.values()].some(Boolean) || document.querySelector('[role="dialog"], .modal, dialog[open]'))) {
      if (!await confirmDiscard()) return;
    }
    const select = document.getElementById('crm-context-select');
    if (select) select.disabled = true;
    transitioning = true;
    const main = document.querySelector('main');
    if (main && !reporting) main.inert = true;
    try {
      await refreshRegistry();
      if (!casinos.some(casino => casino.id === id)) throw new Error(NexLuckI18n.t("This casino is unavailable or not permitted."));
      if (writes) throw new Error(NexLuckI18n.t("A save is in progress. Wait before changing casino."));
      await jsonFetch(api + 'context-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: active, to: id }) });
      generation++;
      reads.forEach(controller => controller.abort());
      reads.clear();
      active = id; contextError = '';
      if (!reporting) { dirty = false; dirtySources.clear(); }
      savePreference(id);
      renderSelector();
      if (reporting) {
        window.dispatchEvent(new Event('crm-context-changed'));
        return;
      }
      let target = new URL(location.href);
      if (target.pathname.startsWith('/crm/b/e/') && !target.searchParams.has('new')) target = new URL('/crm/b/', location.origin);
      if (target.pathname.startsWith('/crm/c/i/')) target = new URL('/crm/c/list/', location.origin);
      const preserved = new URLSearchParams();
      if (target.searchParams.has('new')) preserved.set('new', '1');
      if (target.pathname.endsWith('/section.html') && target.searchParams.has('s')) preserved.set('s', target.searchParams.get('s'));
      preserved.set('casino_context', id);
      target.search = preserved.toString();
      discarding = true;
      location.assign(target.href);
    } catch (error) { renderSelector(); message(error.message); }
    finally {
      transitioning = false;
      if (main) main.inert = false;
      if (select) select.disabled = !casinos.length;
    }
  }

  const ready = initialize();
  async function scopedFetch(input, options = {}) {
    await ready;
    const target = new URL(input, location.href);
    if (target.origin !== location.origin || !/^\/crm\/(?:ui-api|api)\/v1\//.test(target.pathname)) throw new Error(NexLuckI18n.t("Invalid CRM API destination."));
    let rest = target.pathname.replace(/^\/crm\/(?:ui-api|api)\/v1\//, '');
    const method = (options.method || 'GET').toUpperCase();
    if (transitioning && !['GET', 'HEAD'].includes(method)) throw new Error(NexLuckI18n.t("Context is changing. Wait before saving."));
    const headers = new Headers(options.headers);
    headers.set('Accept-Language', NexLuckI18n.locale);
    const isGlobal = rest === 'casinos' || rest.startsWith('casinos/') || rest === 'context-events' || rest.startsWith('reporting/');
    if (options.casinoId) {
      if (!casinos.some(casino => casino.id === options.casinoId)) throw new Error(NexLuckI18n.t("The selected owner casino is not operationally permitted."));
      headers.set('X-Casino-Id', options.casinoId);
    } else if (reporting && !isGlobal) {
      if (method !== 'GET') throw new Error(NexLuckI18n.t("Choose an explicit casino owner before editing from Analytics."));
      target.pathname = target.pathname.replace('/v1/', '/v1/reporting/');
      rest = 'reporting/' + rest;
    } else if (!isGlobal) {
      if (!active || contextError) throw new Error(contextError || 'Select a casino context before loading business data.');
      headers.set('X-Casino-Id', active);
    }
    const captured = generation;
    const tracksContext = !isGlobal && !rest.startsWith('reporting/') && !options.casinoId;
    const write = !['GET', 'HEAD'].includes(method);
    if (write) {
      writes++;
      headers.set('Content-Type', 'application/json');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', abort, { once: true });
    }
    if (!write && tracksContext) reads.add(controller);
    try {
      const response = await nativeFetch(target.href, { ...options, headers, signal: write ? options.signal : controller.signal });
      if (write) await response.clone().arrayBuffer();
      if (captured !== generation && tracksContext) throw new DOMException('Superseded casino context', 'AbortError');
      return response;
    } finally {
      if (write) writes--;
      reads.delete(controller);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  async function mount(render) {
    await ready;
    try {
      if (!globalPage && (!active || contextError)) throw new Error(contextError || 'No casino available. Add a website in My Casinos.');
      if (!globalPage) {
        const response = await scopedFetch(api + 'catalogs');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load casino catalogs.');
        catalogs = payload;
      }
      if (typeof window.installFinanceData === 'function' && !reporting && !location.pathname.startsWith('/crm/c/l/')) {
        const response = await scopedFetch(api + 'finance');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load casino finance data.');
        window.installFinanceData(payload);
      }
      mounted = true;
      render();
    } catch (error) {
      const root = document.getElementById('root');
      if (root) {
        root.replaceChildren();
        const notice = document.createElement('p'); notice.className = 'error'; notice.setAttribute('role', 'alert'); notice.textContent = error.message;
        const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = NexLuckI18n.t("Retry"); retry.onclick = () => location.reload();
        root.append(notice, retry);
      }
      message(error.message);
    }
  }

  window.CRMContext = {
    ready, mount, fetch: scopedFetch, switchTo, url, refreshRegistry,
    get id() { return active; }, get casinos() { return casinos; },
    get reporting() { return reporting; },
    get catalogs() { return catalogs; },
    setDirty(name, value) { dirtySources.set(name, value); if (!value) dirty = false; },
    attach: renderSelector
  };
  document.addEventListener('input', event => {
    if (event.target.closest('form, [role="dialog"], .modal, .sat') && !event.target.closest('#crm-nav-form')) dirty = true;
  });
  window.addEventListener('beforeunload', event => {
    if (!discarding && !reporting && (writes || [...dirtySources.values()].some(Boolean) || document.querySelector('[role="dialog"], .modal'))) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('nexluck:before-language-change', event => {
    if (writes) {
      message(NexLuckI18n.t('A save is in progress. Wait before changing language.'));
      event.preventDefault();
      return;
    }
    if ((dirty || [...dirtySources.values()].some(Boolean) || document.querySelector('[role="dialog"], .modal, dialog[open]')) &&
        !confirm(NexLuckI18n.t('Discard unsaved changes and change language?'))) {
      event.preventDefault();
      return;
    }
    discarding = true;
  });
  document.addEventListener('DOMContentLoaded', () => {
    renderSelector();
    decorateLinks();
    new MutationObserver(() => decorateLinks()).observe(document.body, { childList: true, subtree: true });
    if (!globalPage && !mounted && !document.getElementById('root') && contextError) message(contextError);
  });
})();
