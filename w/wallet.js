(() => {
  'use strict';

  const CURRENCIES = ['EUR', 'USD', 'GBP', 'INR'];
  // Units of currency per 1 EUR. The CRM rates (when reachable) override these.
  const RATES = { EUR: 1, USD: 1.08, GBP: 0.85, INR: 90 };
  const SPREAD = 0.005;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TYPES = {
    topup: { label: 'Top-ups', one: 'Top-up', icon: '＋' },
    withdrawal: { label: 'Withdrawals', one: 'Withdrawal', icon: '↑' },
    wagering: { label: 'Bonus wagering', one: 'Bonus wagering', icon: '🎁' },
    win: { label: 'Wins', one: 'Win', icon: '★' },
    loss: { label: 'Losses', one: 'Loss', icon: '✕' },
    exchange: { label: 'Exchange', one: 'Exchange', icon: '⇄' },
  };
  const walletContext = new URLSearchParams(location.search);
  let demoCustomer = walletContext.get('customer') || '';
  let demoCasino = walletContext.get('casino_context') || '';
  const demoRequest = async (path = '', body) => {
    if (!demoCasino) {
      const response = await fetch('/crm/ui-api/v1/casinos');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load demo casinos.');
      demoCasino = (Array.isArray(payload) ? payload : payload.items)?.[0]?.id;
      if (!demoCasino) throw new Error('No demo casino is available.');
    }
    const response = await fetch('/crm/ui-api/v1/compliance/demo-wallet' + path + '?customer=' + encodeURIComponent(demoCustomer), {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Casino-Id': demoCasino },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error([payload.error, ...Object.values(payload.fields || {})].filter(Boolean).join(': ') || 'Demo wallet request failed.');
    if (payload.customer) {
      demoCustomer = payload.customer.id;
      state.kyc = payload.customer.kyc_status;
      state.demoName = payload.customer.name;
      const url = new URL(location.href);
      url.searchParams.set('casino_context', demoCasino);
      url.searchParams.set('customer', demoCustomer);
      history.replaceState(null, '', url);
      renderProfile();
    }
    return payload;
  };
  const PAGE = 10;
  const LANGUAGES = [
    ['en', 'English'], ['ru', 'Русский'], ['pt-PT', 'Português (Portugal)'],
    ['pt-BR', 'Português (Brasil)'], ['es', 'Español (España)'],
  ];
  const languageCookie = 'nexluck_website_language';
  const savedLanguage = document.cookie.split('; ').find(value => value.startsWith(languageCookie + '='))?.split('=')[1];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const round2 = (n) => Math.round(n * 100) / 100;
  const money = (n, cur) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur;
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (d, withTime) => {
    d = new Date(d);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getFullYear() % 100)}` + (withTime ? `, ${pad(d.getHours())}:${pad(d.getMinutes())}` : '');
  };
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const DAY = 864e5;

  const makeTransactions = () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const pickOne = (list) => list[Math.floor(rnd() * list.length)];
    const games = ['Gates of Olympus', 'Sweet Bonanza', 'Book of Dead', 'European Roulette', 'Aviator', 'Live Blackjack'];
    const now = Date.now();
    const out = [];
    for (let i = 0; i < 44; i++) {
      const ts = now - Math.floor(rnd() * 75 * DAY) - Math.floor(rnd() * DAY / 2);
      const r = rnd();
      const currency = rnd() < 0.2 ? 'USD' : 'EUR';
      let type, amount, note, status = 'Completed';
      if (r < 0.12) { type = 'topup'; amount = pickOne([50, 100, 200, 500]); note = pickOne(['Visa/MasterCard', 'QR Code']); }
      else if (r < 0.2) { type = 'withdrawal'; amount = -pickOne([40, 80, 150]); note = 'Bank transfer'; if (i % 5 === 0) status = 'Pending'; }
      else if (r < 0.45) { type = 'wagering'; amount = -round2(rnd() * 40 + 5); note = pickOne(['Welcome Pack 100%', 'Boost 20%']) + ' · ' + pickOne(games); }
      else if (r < 0.7) { type = 'win'; amount = round2(rnd() * 120 + 5); note = pickOne(games); }
      else { type = 'loss'; amount = -round2(rnd() * 60 + 2); note = pickOne(games); }
      out.push({ id: 'T' + (1000 + i), ts, type, currency, amount, note, status });
    }
    return out.sort((a, b) => b.ts - a.ts);
  };

  const state = {
    currency: 'EUR',
    balances: { EUR: 100, USD: 100, GBP: 85, INR: 0 },
    rates: { ...RATES },
    profile: { name: 'Luna Play', email: 'luna.play@example.com', phone: '',
      language: LANGUAGES.some(([code]) => code === savedLanguage) ? savedLanguage : 'en' },
    kyc: 'Verified',
    points: 12480,
    nextLevel: { name: 'Platinum', at: 20000 },
    bonuses: [
      { id: 'b1', name: 'Welcome Pack 100%', status: 'active', amountEur: 40, wagered: 620, required: 1400, expires: '2026-12-31' },
      { id: 'b2', name: 'Boost 20%', status: 'active', amountEur: 15, wagered: 90, required: 450, expires: '2026-11-30' },
      { id: 'b3', name: 'Reload Friday 50%', status: 'completed', amountEur: 25, wagered: 875, required: 875, expires: '2026-09-18' },
      { id: 'b4', name: 'Free Spins Gates of Olympus', status: 'completed', amountEur: 0, wagered: 0, required: 0, expires: '2026-08-30' },
      { id: 'b5', name: 'Weekend Special 15%', status: 'expired', amountEur: 12, wagered: 100, required: 360, expires: '2026-07-31' },
    ],
    tx: makeTransactions(),
    filter: { period: 'all', from: '', to: '', types: new Set(), shown: PAGE },
  };

  const rate = (from, to) => state.rates[to] / state.rates[from];
  const bonusBalanceEur = () => state.bonuses.filter((b) => b.status === 'active').reduce((s, b) => s + b.amountEur, 0);
  const addTx = (type, currency, amount, note, status) => {
    state.tx.unshift({ id: 'T' + Date.now() + Math.floor(Math.random() * 1000), ts: Date.now(), type, currency, amount, note, status: status || 'Completed' });
  };

  let toastTimer = 0;
  const toast = (text) => {
    const el = $('#wl-toast');
    el.textContent = text;
    el.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { el.hidden = true; }, 4500);
  };

  // ---------- modals (styled with the deposit screen classes) ----------
  const modals = [];
  const closeModal = (el) => {
    el.remove();
    modals.splice(modals.indexOf(el), 1);
    if (!modals.length) document.body.classList.remove('dp-open');
  };
  const openModal = (title, html) => {
    const el = document.createElement('div');
    el.className = 'dp wl-modal';
    el.innerHTML = '<div class="dp-scrim" data-close></div><section class="dp-panel" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">'
      + '<div class="dp-head"><h2>' + esc(title) + '</h2><button type="button" class="dp-x" data-close aria-label="Close">×</button></div>' + html + '</section>';
    document.body.appendChild(el);
    document.body.classList.add('dp-open');
    modals.push(el);
    el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(el); });
    return el;
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modals.length) closeModal(modals[modals.length - 1]);
  });
  const setErr = (el, name, text) => {
    const msg = $('[data-err="' + name + '"]', el);
    if (msg) msg.textContent = text || '';
    const input = $('[data-f="' + name + '"]', el);
    if (input) input.classList.toggle('dp-bad', !!text);
  };
  const field = (id, label, inner) => '<div class="dp-field"><label class="dp-lbl" for="' + id + '">' + label + '</label>' + inner + '<span class="dp-err" data-err="' + id + '"></span></div>';
  const curOptions = (sel) => CURRENCIES.map((c) => '<option' + (c === sel ? ' selected' : '') + '>' + c + '</option>').join('');

  // ---------- profile ----------
  const renderProfile = () => {
    const p = state.profile;
    const left = Math.max(0, state.nextLevel.at - state.points);
    const pct = Math.min(100, Math.round(state.points / state.nextLevel.at * 100));
    $('#wl-profile').innerHTML =
      '<div class="wl-avatar" aria-hidden="true">' + esc(p.name.trim().charAt(0).toUpperCase() || '?') + '<b>✦</b></div>'
      + '<div><h2 class="wl-name">' + esc(p.name) + '</h2>'
      + (state.demoName ? '<p class="wl-avail">Demo CRM customer: ' + esc(state.demoName) + '</p>' : '')
      + '<div class="wl-pills"><span class="wl-pill ok">✓ KYC: ' + esc(state.kyc) + '</span>'
      + '<span class="wl-pill gold">✦ Gold</span>'
      + '<span class="wl-pill">' + state.points.toLocaleString('en-US') + ' loyalty points</span></div>'
      + '<div class="wl-loyal">' + left.toLocaleString('en-US') + ' points to ' + esc(state.nextLevel.name) + '<div class="wl-bar"><i style="width:' + pct + '%"></i></div></div></div>'
      + '<div class="wl-profile-actions"><button type="button" class="wl-ghost" id="wl-kyc">KYC & chat (demo)</button>'
      + '<button type="button" class="wl-ghost" id="wl-settings">Profile settings</button></div>';
  };

  const openSettings = () => {
    const p = state.profile;
    const el = openModal('Profile settings',
      field('name', 'Display name', '<input type="text" id="name" data-f="name" maxlength="40" autocomplete="nickname" value="' + esc(p.name) + '">')
      + field('email', 'Email', '<input type="text" id="email" data-f="email" maxlength="120" autocomplete="email" value="' + esc(p.email) + '">')
      + field('phone', 'Phone', '<input type="tel" id="phone" data-f="phone" maxlength="20" autocomplete="tel" placeholder="+49 151 2345 6789" value="' + esc(p.phone) + '">')
      + field('language', 'Language', '<select id="language" data-f="language">' + LANGUAGES.map(([code, label]) =>
        '<option value="' + code + '"' + (code === p.language ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select>')
      + '<button type="button" class="dp-go" id="s-save">Save</button>');
    $('#s-save', el).addEventListener('click', () => {
      const v = { name: $('#name', el).value.trim(), email: $('#email', el).value.trim(), phone: $('#phone', el).value.trim(),
        language: $('#language', el).value };
      const bad = {
        name: v.name.length < 2 || v.name.length > 40 ? 'Enter 2-40 characters.' : '',
        email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ? 'Enter a valid email.' : '',
        phone: v.phone && !/^\+?[0-9 ()-]{7,20}$/.test(v.phone) ? 'Enter a valid phone number.' : '',
        language: !LANGUAGES.some(([code]) => code === v.language) ? 'Choose a supported language.' : '',
      };
      Object.keys(bad).forEach((k) => setErr(el, k, bad[k]));
      if (Object.values(bad).some(Boolean)) return;
      document.cookie = languageCookie + '=' + v.language + '; Path=/; Max-Age=31536000; SameSite=Lax' +
        (location.protocol === 'https:' ? '; Secure' : '');
      if (!document.cookie.split('; ').includes(languageCookie + '=' + v.language)) {
        setErr(el, 'language', 'Language preference could not be saved. Check browser cookie permissions.');
        return;
      }
      state.profile = v;
      closeModal(el);
      renderProfile();
      toast('Profile saved.');
    });
  };

  // ---------- balances ----------
  const renderBalances = () => {
    const cur = state.currency;
    const bonus = bonusBalanceEur() * state.rates[cur];
    $('#wl-balances').innerHTML =
      '<div class="wl-card wl-bal"><small>Balance</small><strong>' + money(state.balances[cur], cur) + '</strong>'
      + '<select id="wl-cur" aria-label="Balance currency">' + curOptions(cur) + '</select></div>'
      + '<div class="wl-card wl-bal bonus"><small>Bonus balance</small><strong>' + money(round2(bonus), cur) + '</strong>'
      + '<p class="wl-note">Always shown in the same currency as your balance.</p></div>';
  };

  // ---------- bonuses ----------
  const renderBonuses = () => {
    const order = { active: 0, completed: 1, expired: 2, cancelled: 3 };
    const list = state.bonuses.slice().sort((a, b) => order[a.status] - order[b.status]);
    $('#wl-bonuses').innerHTML = list.map((b) => {
      const isActive = b.status === 'active';
      const pct = b.required ? Math.min(100, Math.round(b.wagered / b.required * 100)) : 100;
      const amount = money(round2(b.amountEur * state.rates[state.currency]), state.currency);
      return '<article class="wl-bonus' + (isActive ? ' active' : '') + '">'
        + '<div><b>' + esc(b.name) + '</b><div class="meta">' + (b.amountEur ? 'Bonus ' + amount + ' · ' : '') + (isActive ? 'Expires ' : 'Ended ') + fmtDate(b.expires + 'T00:00') + '</div></div>'
        + '<span class="wl-tag">' + b.status + '</span>'
        + (b.required ? '<div class="prog"><small>Wagering ' + pct + '%</small><div class="wl-bar"><i style="width:' + pct + '%"></i></div></div>' : '')
        + (isActive ? '<div class="foot"><button type="button" class="wl-cancel" data-cancel="' + b.id + '">Cancel bonus</button></div>' : '')
        + '</article>';
    }).join('');
  };

  const confirmCancel = (id) => {
    const b = state.bonuses.find((x) => x.id === id);
    if (!b || b.status !== 'active') return;
    const el = openModal('Cancel bonus',
      '<div class="wl-confirm"><p>Cancel <b>' + esc(b.name) + '</b>? The remaining bonus funds (' + money(round2(b.amountEur * state.rates[state.currency]), state.currency)
      + ') and any winnings made with them will be forfeited. This cannot be undone.</p>'
      + '<div class="wl-btns"><button type="button" class="wl-ghost" data-close>Keep bonus</button><button type="button" class="wl-danger" id="c-yes">Cancel bonus</button></div></div>');
    $('#c-yes', el).addEventListener('click', () => {
      b.status = 'cancelled';
      closeModal(el);
      renderBalances();
      renderBonuses();
      toast('Bonus “' + b.name + '” cancelled.');
    });
  };

  // ---------- transaction history ----------
  const calIcon = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2v2M13 2v2M2 6h12M3 3h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const dateField = (id, label, value) =>
    '<label><span class="dp-lbl">' + label + '</span><div class="wl-date" data-date="' + id + '">'
    + (value ? '<span>' + fmtDate(value + 'T00:00') + '</span>' : '<em>Select date…</em>') + calIcon
    + '<input type="date" id="' + id + '" value="' + value + '" tabindex="-1" aria-label="' + label + '"></div></label>';

  const renderFilters = () => {
    const f = state.filter;
    $('#wl-filters').innerHTML = '<div class="wl-filters">'
      + '<div class="wl-frow"><label><span class="dp-lbl">Period</span><select id="f-period">'
      + [['all', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['custom', 'Custom range']].map(([v, l]) => '<option value="' + v + '"' + (f.period === v ? ' selected' : '') + '>' + l + '</option>').join('')
      + '</select></label>'
      + (f.period === 'custom' ? dateField('f-from', 'From', f.from) + dateField('f-to', 'To', f.to) : '') + '</div>'
      + '<div><span class="dp-lbl">Transaction types</span><div class="wl-chips">'
      + Object.keys(TYPES).map((t) => '<button type="button" class="wl-chip" data-type="' + t + '" aria-pressed="' + f.types.has(t) + '">' + TYPES[t].label + '</button>').join('')
      + '<button type="button" class="wl-link" id="f-clear">Clear filters</button></div></div></div>';
  };

  const filtered = () => {
    const f = state.filter;
    let from = -Infinity, to = Infinity;
    if (f.period === '7' || f.period === '30') from = Date.now() - Number(f.period) * DAY;
    if (f.period === 'custom') {
      if (f.from) from = new Date(f.from + 'T00:00').getTime();
      if (f.to) to = new Date(f.to + 'T23:59:59').getTime();
    }
    return state.tx.filter((t) => t.ts >= from && t.ts <= to && (!f.types.size || f.types.has(t.type)));
  };

  const renderTx = () => {
    const list = filtered();
    const shown = list.slice(0, state.filter.shown);
    $('#wl-tx').innerHTML = (list.length ? '<p class="wl-count">' + list.length + ' transaction' + (list.length === 1 ? '' : 's') + '</p>' : '<div class="wl-empty">No transactions match these filters.</div>')
      + shown.map((t) => '<div class="wl-tx"><span class="wl-ico" aria-hidden="true">' + TYPES[t.type].icon + '</span>'
        + '<div><b>' + TYPES[t.type].one + '</b><div class="meta">' + esc(t.note) + ' · ' + fmtDate(t.ts, true) + '</div></div>'
        + '<div class="wl-amt ' + (t.amount >= 0 ? 'pos' : 'neg') + '">' + (t.amount >= 0 ? '+' : '−') + money(Math.abs(t.amount), t.currency) + '<small>' + esc(t.status) + '</small></div></div>').join('')
      + (list.length > shown.length ? '<button type="button" class="wl-ghost wl-more" id="f-more">Show more</button>' : '');
  };

  const bindFilters = () => {
    const box = $('#wl-filters');
    box.addEventListener('change', (e) => {
      const f = state.filter;
      if (e.target.id === 'f-period') { f.period = e.target.value; if (f.period === 'custom' && !f.from) { f.from = isoDay(new Date(Date.now() - 30 * DAY)); f.to = isoDay(new Date()); } f.shown = PAGE; renderFilters(); renderTx(); }
      if (e.target.id === 'f-from') { f.from = e.target.value; f.shown = PAGE; renderFilters(); renderTx(); }
      if (e.target.id === 'f-to') { f.to = e.target.value; f.shown = PAGE; renderFilters(); renderTx(); }
    });
    box.addEventListener('click', (e) => {
      const f = state.filter;
      const date = e.target.closest('[data-date]');
      if (date) { const input = $('input', date); try { input.showPicker(); } catch (err) { input.focus(); } return; }
      const chip = e.target.closest('[data-type]');
      if (chip) { const t = chip.dataset.type; if (f.types.has(t)) f.types.delete(t); else f.types.add(t); f.shown = PAGE; renderFilters(); renderTx(); return; }
      if (e.target.closest('#f-clear')) { state.filter = { period: 'all', from: '', to: '', types: new Set(), shown: PAGE }; renderFilters(); renderTx(); }
    });
    $('#wl-tx').addEventListener('click', (e) => {
      if (e.target.closest('#f-more')) { state.filter.shown += PAGE; renderTx(); }
    });
  };

  // ---------- withdrawal ----------
  const openWithdrawal = async () => {
    let payload;
    try { payload = await demoRequest(); } catch (error) { toast(error.message); return; }
    const w = { connection: payload.connections.find(connection => connection.currency === state.currency) || payload.connections[0], method: '', key: crypto.randomUUID() };
    const el = openModal('Withdrawal',
      '<p class="wl-avail">Demo customer: ' + esc(payload.customer.name) + '. No payment is executed.</p>'
      + '<div class="dp-sec"><label class="dp-lbl" for="w-connection">Payment connection</label><select id="w-connection">' + payload.connections.map(connection => '<option value="' + esc(connection.id) + '"' + (connection.id === w.connection?.id ? ' selected' : '') + '>' + esc(connection.brand + ' · ' + connection.name + ' · ' + connection.currency) + '</option>').join('') + '</select></div>'
      + '<div class="dp-sec"><span class="dp-lbl">Withdrawal method</span><div class="dp-methods" id="w-methods"></div></div>'
      + '<div class="dp-widget" id="w-widget"></div>'
      + '<button type="button" class="dp-go" id="w-go" style="margin-top:16px">Withdraw</button>'
      + '<p role="alert" id="w-error" class="dp-err"></p>');

    const renderWidget = () => {
      if (!w.connection) { $('#w-widget', el).textContent = 'No enabled payout connections. Configure Finance first.'; $('#w-go', el).disabled = true; return; }
      const cur = w.connection.currency;
      const avail = state.balances[cur] || 0;
      const amount = field('w-amount', 'Amount (' + esc(cur) + ')', '<div class="dp-amt"><input type="text" id="w-amount" data-f="w-amount" inputmode="decimal" autocomplete="off" placeholder="0.00"><div class="dp-chips"><button type="button" class="dp-chip" id="w-max">Max</button></div></div>');
      const card = ['Visa', 'MasterCard'].includes(w.method);
      const details = card
        ? field('w-first', 'Card first 4 digits (demo)', '<input id="w-first" inputmode="numeric" maxlength="4" autocomplete="off">') + field('w-last', 'Card last 4 digits (demo)', '<input id="w-last" inputmode="numeric" maxlength="4" autocomplete="off">')
        : field('w-destination', 'Masked destination only (e.g. xxxx 1234)', '<input id="w-destination" maxlength="100" autocomplete="off">');
      $('#w-widget', el).innerHTML = '<h3>' + esc(w.method) + '</h3><p class="wl-avail">Available: <b>' + money(avail, cur) + '</b></p>' + amount + details;
    };
    const renderMethods = () => {
      const list = w.connection?.methods || [];
      if (!list.includes(w.method)) w.method = list[0];
      $('#w-methods', el).innerHTML = list.map(m => '<button type="button" class="dp-method" data-method="' + esc(m) + '" aria-pressed="' + (m === w.method) + '">' + esc(m) + '</button>').join('');
    };
    renderMethods();
    renderWidget();

    $('#w-connection', el).addEventListener('change', event => { w.connection = payload.connections.find(connection => String(connection.id) === event.target.value); renderMethods(); renderWidget(); });
    $('#w-methods', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-method]');
      if (!b) return;
      w.method = b.dataset.method;
      renderMethods();
      renderWidget();
    });
    $('#w-widget', el).addEventListener('click', event => {
      if (event.target.closest('#w-max')) $('#w-amount', el).value = String(state.balances[w.connection.currency] || 0);
    });
    $('#w-go', el).addEventListener('click', async () => {
      const cur = w.connection.currency;
      const avail = state.balances[cur] || 0;
      const raw = $('#w-amount', el).value.trim().replace(',', '.');
      const amount = /^\d+(\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
      let destination = $('#w-destination', el)?.value.trim();
      const card = ['Visa', 'MasterCard'].includes(w.method);
      if (card) destination = $('#w-first', el).value + ' xxxxxx ' + $('#w-last', el).value;
      const button = $('#w-go', el);
      button.disabled = true;
      try {
        if (!(amount >= 10) || amount > avail) throw new Error('Enter an amount of at least 10 within your demo balance.');
        if (card && !/^\d{4} x{6} \d{4}$/.test(destination)) throw new Error('Enter only the first four and last four digits.');
        await demoRequest('/payouts', { connection_id: w.connection.id, method: w.method, destination, amount, currency: cur, request_key: w.key });
        state.balances[cur] = round2(avail - amount);
        addTx('withdrawal', cur, -amount, w.connection.brand + ' · ' + destination, 'New');
        state.currency = cur;
        closeModal(el); render(); toast('Demo payout request saved in Compliance.');
      } catch (error) { $('#w-error', el).textContent = error.message; }
      finally { button.disabled = false; }
    });
  };

  const openKYC = async () => {
    let payload;
    try { payload = await demoRequest(); } catch (error) { toast(error.message); return; }
    const el = openModal('KYC & chat (demo)',
      '<p>Simulated player portal. Document submissions use a fictional demo image, not real uploads.</p>'
      + field('kyc-player', 'Demo customer', '<select id="kyc-player">' + payload.customers.map(customer => '<option value="' + esc(customer.id) + '"' + (customer.id === demoCustomer ? ' selected' : '') + '>' + esc(customer.name) + '</option>').join('') + '</select>')
      + '<p>KYC: ' + esc(payload.customer.kyc_status) + '</p>'
      + '<ul>' + payload.messages.map(message => '<li>' + esc(message.message) + '</li>').join('') + '</ul>'
      + field('player-message', 'Message to Compliance', '<textarea id="player-message" maxlength="4000"></textarea>')
      + '<button type="button" class="dp-go" id="player-send">Send demo message</button>'
      + field('kyc-request', 'KYC request', '<select id="kyc-request">' + payload.requests.map(request => '<option value="' + esc(request.id) + '">' + esc(request.document_name + ' · ' + request.status) + '</option>').join('') + '</select>')
      + field('kyc-name', 'Demo document version name', '<input id="kyc-name" maxlength="200">')
      + '<button type="button" class="dp-go" id="player-document"' + (payload.requests.length ? '' : ' disabled') + '>Submit demo document</button>'
      + '<p role="status" id="player-feedback"></p>');
    $('#kyc-player', el).addEventListener('change', event => { demoCustomer = event.target.value; closeModal(el); openKYC(); });
    const submit = (selector, path, body) => $(selector, el).addEventListener('click', async event => {
      event.target.disabled = true;
      try { await demoRequest(path, body()); $('#player-feedback', el).textContent = 'Saved in Compliance.'; }
      catch (error) { $('#player-feedback', el).textContent = error.message; }
      finally { event.target.disabled = false; }
    });
    submit('#player-send', '/chat', () => ({ message: $('#player-message', el).value, request_id: $('#kyc-request', el).value }));
    submit('#player-document', '/documents', () => ({ request_id: $('#kyc-request', el).value, name: $('#kyc-name', el).value }));
  };

  // ---------- exchange ----------
  const openExchange = () => {
    const x = { side: 'BUY', a: 'USD', b: 'EUR', amount: '' };
    const el = openModal('Exchange',
      '<div class="wl-seg" role="group" aria-label="Exchange type"><button type="button" data-side="BUY">Buy</button><button type="button" data-side="SELL">Sell</button></div>'
      + '<div class="wl-split"><div class="dp-field"><label class="dp-lbl" for="x-a">Currency</label><select id="x-a">' + curOptions(x.a) + '</select></div>'
      + '<div class="dp-field"><label class="dp-lbl" for="x-amount" id="x-amount-l">Amount to buy</label><input type="text" id="x-amount" data-f="x-amount" inputmode="decimal" autocomplete="off" placeholder="0.00"></div></div>'
      + '<div class="wl-split"><div class="dp-field"><label class="dp-lbl" for="x-b" id="x-b-l">Pay with</label><select id="x-b">' + curOptions(x.b) + '</select></div>'
      + '<div class="dp-field"><span class="dp-lbl" id="x-out-l">You pay</span><div class="wl-ro" id="x-out" aria-live="polite">—</div></div></div>'
      + '<p class="wl-rate" id="x-rate"></p><p class="wl-avail" id="x-avail"></p><span class="dp-err" id="x-err"></span>'
      + '<button type="button" class="dp-go" id="x-go" style="margin-top:8px">Exchange</button>');

    const calc = () => {
      const amt = Number(x.amount.replace(',', '.'));
      const valid = /^\d+(\.\d{1,2})?$/.test(x.amount.replace(',', '.')) && amt > 0;
      const mid = rate(x.a, x.b);
      const eff = x.side === 'BUY' ? mid * (1 + SPREAD) : mid * (1 - SPREAD);
      return { valid, amt, mid, eff, out: valid ? round2(amt * eff) : 0 };
    };
    const refresh = () => {
      const c = calc();
      const buy = x.side === 'BUY';
      el.querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === x.side)));
      $('#x-amount-l', el).textContent = buy ? 'Amount to buy' : 'Amount to sell';
      $('#x-b-l', el).textContent = buy ? 'Pay with' : 'Receive in';
      $('#x-out-l', el).textContent = buy ? 'You pay' : 'You receive';
      $('#x-out', el).textContent = c.valid && x.a !== x.b ? money(c.out, x.b) : '—';
      $('#x-rate', el).innerHTML = x.a === x.b ? 'Choose two different currencies.'
        : 'Exchange rate: <b>1 ' + x.a + ' = ' + c.eff.toFixed(4) + ' ' + x.b + '</b> (market ' + c.mid.toFixed(4) + ' ' + (buy ? '+' : '−') + ' ' + (SPREAD * 100).toFixed(1) + '% spread)';
      const giveCur = buy ? x.b : x.a;
      $('#x-avail', el).innerHTML = 'Available ' + giveCur + ': <b>' + money(state.balances[giveCur], giveCur) + '</b>';
    };
    refresh();

    el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-side]');
      if (s) { x.side = s.dataset.side; $('#x-err', el).textContent = ''; refresh(); }
    });
    $('#x-a', el).addEventListener('change', (e) => { x.a = e.target.value; refresh(); });
    $('#x-b', el).addEventListener('change', (e) => { x.b = e.target.value; refresh(); });
    $('#x-amount', el).addEventListener('input', (e) => { x.amount = e.target.value.trim(); $('#x-err', el).textContent = ''; setErr(el, 'x-amount', ''); refresh(); });
    $('#x-go', el).addEventListener('click', () => {
      const c = calc();
      const buy = x.side === 'BUY';
      const err = $('#x-err', el);
      if (x.a === x.b) { err.textContent = 'Choose two different currencies.'; return; }
      if (!c.valid) { setErr(el, 'x-amount', 'Enter a valid amount.'); return; }
      const giveCur = buy ? x.b : x.a, giveAmt = buy ? c.out : c.amt;
      const getCur = buy ? x.a : x.b, getAmt = buy ? c.amt : c.out;
      if (giveAmt > state.balances[giveCur]) { err.textContent = 'Not enough ' + giveCur + ': you need ' + money(giveAmt, giveCur) + '.'; return; }
      state.balances[giveCur] = round2(state.balances[giveCur] - giveAmt);
      state.balances[getCur] = round2(state.balances[getCur] + getAmt);
      const note = (buy ? 'Bought ' : 'Sold ') + money(c.amt, x.a) + ' · 1 ' + x.a + ' = ' + c.eff.toFixed(4) + ' ' + x.b;
      addTx('exchange', giveCur, -giveAmt, note);
      addTx('exchange', getCur, getAmt, note);
      closeModal(el);
      render();
      toast((buy ? 'Bought ' : 'Sold ') + money(c.amt, x.a) + ' for ' + money(c.out, x.b) + '.');
    });
  };

  const render = () => {
    renderProfile();
    renderBalances();
    renderBonuses();
    renderFilters();
    renderTx();
  };

  const loadRates = async () => {
    try {
      const res = await fetch('/crm/ui-api/v1/exchange-rates');
      if (!res.ok) return;
      const data = await res.json();
      Object.keys(data.rates || {}).forEach((c) => { if (CURRENCIES.includes(c) && Number(data.rates[c]) > 0) state.rates[c] = Number(data.rates[c]); });
      renderBalances();
      renderBonuses();
    } catch (err) { /* demo rates stay */ }
  };

  const init = () => {
    render();
    bindFilters();
    $('#wl-profile').addEventListener('click', (e) => { if (e.target.closest('#wl-settings')) openSettings(); if (e.target.closest('#wl-kyc')) openKYC(); });
    $('#wl-balances').addEventListener('change', (e) => {
      if (e.target.id !== 'wl-cur') return;
      state.currency = e.target.value;
      renderBalances();
      renderBonuses();
    });
    $('#wl-bonuses').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cancel]');
      if (b) confirmCancel(b.dataset.cancel);
    });
    $('#wl-topup').addEventListener('click', (e) => { if (window.NexDeposit) window.NexDeposit.open(e.currentTarget); });
    $('#wl-withdraw').addEventListener('click', openWithdrawal);
    $('#wl-exchange').addEventListener('click', openExchange);
    loadRates();
  };

  // deposit.js is deferred and runs first, so NexDeposit exists by now.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
