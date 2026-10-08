(() => {
  const CURRENCIES = {
    EUR: ['card', 'qr'], USD: ['card', 'qr'], GBP: ['card'], INR: ['upi', 'paytm', 'qr'],
  };
  const METHODS = {
    card: 'Visa/MasterCard', qr: 'QR Code', paytm: 'Paytm', upi: 'UPI',
  };
  const AMOUNTS = [500, 1000, 1500];
  const MIN = 10, MAX = 100000;
  const FALLBACK_BONUSES = [
    { id: 'demo-1', name: 'Welcome Pack 100%', text: 'dep match · First deposit', image: '' },
    { id: 'demo-2', name: 'Reload Friday 50%', text: 'dep match · Deposit on Friday', image: '' },
    { id: 'demo-3', name: 'Cashback weekend', text: 'cashback · Any deposit', image: '' },
  ];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html; return (d.textContent || '').trim(); };

  const state = { currency: 'EUR', method: 'card', amount: '', bonus: new Set(), bonuses: null };
  let root = null;
  let opener = null;

  const luhn = (n) => {
    let sum = 0;
    n.split('').reverse().forEach((d, i) => { let v = Number(d); if (i % 2) { v *= 2; if (v > 9) v -= 9; } sum += v; });
    return sum % 10 === 0;
  };

  // Demo QR: a deterministic pattern with finder squares, not a scannable code.
  const qrSvg = (seed) => {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    const N = 25;
    const isFinder = (x, y) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
    const finderOn = (x, y) => {
      const f = (cx, cy) => { const d = Math.max(Math.abs(x - cx), Math.abs(y - cy)); return d === 3 || d <= 1; };
      if (x < 7 && y < 7) return f(3, 3);
      if (x >= N - 7 && y < 7) return f(N - 4, 3);
      return f(3, N - 4);
    };
    let d = '';
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const on = isFinder(x, y) ? finderOn(x, y) : rnd() > 0.52;
        if (on) d += 'M' + x + ' ' + y + 'h1v1h-1z';
      }
    }
    return '<svg viewBox="0 0 ' + N + ' ' + N + '" role="img" aria-label="Payment QR code"><path d="' + d + '" fill="#0e122f"/></svg>';
  };

  const qrBlock = () => qrSvg(state.currency + ':' + (state.amount || '0'))
    + '<p>Scan the code with your banking app to pay' + (state.amount ? ' ' + esc(state.amount) + ' ' + state.currency : '') + '.</p>';

  const TRUST = '<div class="dp-trust" aria-hidden="true">'
    + '<svg viewBox="0 0 92 28"><path d="M14 1 3 5v8c0 7 5 12 11 14 6-2 11-7 11-14V5z" fill="none" stroke="#fff" stroke-width="2"/><path d="m9 13 4 4 6-8" fill="none" stroke="#fff" stroke-width="2"/><text x="30" y="19" fill="#fff" font-family="Manrope,sans-serif" font-weight="800" font-size="13">PCI DSS</text></svg>'
    + '<svg viewBox="0 0 64 28"><text x="0" y="22" fill="#fff" font-family="Manrope,sans-serif" font-style="italic" font-weight="800" font-size="24">VISA</text></svg>'
    + '<svg viewBox="0 0 92 28"><circle cx="14" cy="14" r="10" fill="#fff" fill-opacity=".85"/><circle cx="26" cy="14" r="10" fill="#fff" fill-opacity=".5"/><text x="40" y="18" fill="#fff" font-family="Manrope,sans-serif" font-weight="700" font-size="11">Mastercard</text></svg>'
    + '</div>';

  const PANEL = '<div class="dp-scrim" data-dp-close></div>'
    + '<section class="dp-panel" role="dialog" aria-modal="true" aria-labelledby="dp-title">'
    + '<div class="dp-head"><h2 id="dp-title">Deposit</h2><button type="button" class="dp-x" data-dp-close aria-label="Close deposit">×</button></div>'
    + '<div class="dp-sec"><label class="dp-lbl" for="dp-cur">Currency</label><select id="dp-cur"></select></div>'
    + '<div class="dp-sec"><span class="dp-lbl">Payment method</span><div class="dp-methods" id="dp-methods"></div></div>'
    + '<div class="dp-widget" id="dp-widget"></div>'
    + '<div class="dp-sec" style="margin-top:16px"><span class="dp-lbl">Available bonuses</span><div class="dp-bonuses" id="dp-bonuses"><span class="dp-lbl">Loading…</span></div></div>'
    + '<div class="dp-sec"><label class="dp-lbl" for="dp-promo">Promo code</label><input id="dp-promo" type="text" autocomplete="off" autocapitalize="characters" maxlength="32" placeholder="Enter promo code"></div>'
    + '<button type="button" class="dp-go" id="dp-go">Deposit</button>'
    + '<div id="dp-msg" role="status" aria-live="polite"></div>'
    + '<a class="dp-wallet" href="#wallet" id="dp-wallet">My wallet →</a>'
    + TRUST + '</section>';

  const setAmount = (v) => {
    state.amount = String(v);
    root.querySelectorAll('[data-amount]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.amount === state.amount)));
    const qr = root.querySelector('.dp-qr');
    if (qr) qr.innerHTML = qrBlock();
  };

  const renderMethods = () => {
    const list = CURRENCIES[state.currency];
    root.querySelector('#dp-methods').innerHTML = list.map((m, i) => '<button type="button" class="dp-method" data-method="' + m + '" aria-pressed="' + (m === state.method) + '">'
      + METHODS[m] + (i === 0 ? '<small>Default</small>' : '') + '</button>').join('');
  };

  const field = (label, id, attrs, err) => '<div class="dp-field"><label class="dp-lbl" for="' + id + '">' + label + '</label><input id="' + id + '" ' + attrs + '><span class="dp-err" data-err="' + err + '"></span></div>';

  const renderWidget = () => {
    const m = state.method;
    const chips = AMOUNTS.map((a) => '<button type="button" class="dp-chip" data-amount="' + a + '" aria-pressed="' + (String(a) === state.amount) + '">' + a + '</button>').join('');
    const amount = '<div class="dp-field"><label class="dp-lbl" for="dp-amount">Amount (' + state.currency + ')</label>'
      + '<div class="dp-amt"><input id="dp-amount" type="tel" inputmode="numeric" autocomplete="off" placeholder="Enter amount" value="' + esc(state.amount) + '">'
      + '<div class="dp-chips">' + chips + '</div></div><span class="dp-err" data-err="amount"></span></div>';
    let body = '';
    if (m === 'card') {
      body = field('Card number (PAN)', 'dp-pan', 'type="tel" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000"', 'pan')
        + '<div class="dp-row">'
        + field('Expiry date', 'dp-exp', 'type="tel" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY"', 'exp')
        + field('CVC', 'dp-cvc', 'type="tel" inputmode="numeric" autocomplete="cc-csc" placeholder="123"', 'cvc') + '</div>';
    } else if (m === 'qr') {
      body = '<div class="dp-qr">' + qrBlock() + '</div>';
    } else if (m === 'upi') {
      body = field('UPI ID', 'dp-upi', 'type="text" autocomplete="off" autocapitalize="none" placeholder="name@bank"', 'upi');
    } else {
      body = field('Paytm mobile number', 'dp-phone', 'type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="10-digit number"', 'phone');
    }
    root.querySelector('#dp-widget').innerHTML = '<h3>' + METHODS[m] + '</h3>' + amount + body;
  };

  const renderBonuses = () => {
    const box = root.querySelector('#dp-bonuses');
    if (!state.bonuses.length) { box.innerHTML = '<span class="dp-lbl">No bonuses available right now.</span>'; return; }
    box.innerHTML = state.bonuses.map((b) => '<button type="button" class="dp-bonus" data-bonus="' + esc(b.id) + '" aria-pressed="' + state.bonus.has(b.id) + '">'
      + '<span class="dp-bonus-art"></span><span><b>' + esc(b.name) + '</b><span>' + esc(b.text) + '</span></span><i></i></button>').join('');
    box.querySelectorAll('.dp-bonus').forEach((el, i) => {
      if (state.bonuses[i].image) el.firstChild.style.backgroundImage = 'url("' + state.bonuses[i].image + '")';
    });
  };

  const loadBonuses = async () => {
    if (state.bonuses) return;
    try {
      const res = await fetch('/crm/ui-api/v1/bonuses?limit=100');
      if (!res.ok) throw new Error('bonuses');
      const items = (await res.json()).items.filter((b) => b.status === 'active' && !b.deleted)
        .sort((a, b) => Number(b.hasPromo) - Number(a.hasPromo)).slice(0, 6);
      state.bonuses = await Promise.all(items.map(async (b) => {
        let banner = null;
        if (b.hasPromo) {
          try {
            const r = await fetch('/crm/ui-api/v1/bonuses/' + encodeURIComponent(b.id) + '/promo-banner');
            if (r.ok) banner = await r.json();
          } catch (e) { /* the default card is used */ }
        }
        const img = banner && banner.images && (banner.images.mobile || banner.images.web || banner.images.tablet);
        return {
          id: b.id,
          name: (banner && plain(banner.title)) || b.name,
          text: (banner && plain(banner.description).slice(0, 90)) || b.bonusType + ' · ' + b.event,
          image: img && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(img) ? img : '',
        };
      }));
    } catch (e) {
      state.bonuses = FALLBACK_BONUSES;
    }
    renderBonuses();
  };

  const message = (text, ok) => { root.querySelector('#dp-msg').innerHTML = '<p class="dp-msg ' + (ok ? 'ok' : 'bad') + '">' + esc(text) + '</p>'; };

  const fail = (key, text) => {
    const el = root.querySelector('[data-err="' + key + '"]');
    if (el) { el.textContent = text; el.previousElementSibling.classList.add('dp-bad'); }
    return false;
  };

  const validate = () => {
    root.querySelectorAll('[data-err]').forEach((e) => { e.textContent = ''; });
    root.querySelectorAll('.dp-bad').forEach((e) => e.classList.remove('dp-bad'));
    let ok = true;
    const amount = Number(state.amount);
    if (!amount || amount < MIN || amount > MAX) ok = fail('amount', 'Enter an amount between ' + MIN + ' and ' + MAX + ' ' + state.currency + '.');
    const val = (id) => root.querySelector(id).value.trim();
    if (state.method === 'card') {
      const pan = val('#dp-pan').replace(/\s/g, '');
      if (!/^\d{13,19}$/.test(pan) || !luhn(pan)) ok = fail('pan', 'Enter a valid card number.');
      const m = val('#dp-exp').match(/^(\d{2})\/(\d{2})$/);
      if (!m || Number(m[1]) < 1 || Number(m[1]) > 12 || new Date(2000 + Number(m[2]), Number(m[1])) <= new Date()) ok = fail('exp', 'Enter a valid expiry date.');
      if (!/^\d{3,4}$/.test(val('#dp-cvc'))) ok = fail('cvc', 'Enter the CVC.');
    } else if (state.method === 'upi') {
      if (!/^[\w.-]{2,}@[a-z]{2,}$/i.test(val('#dp-upi'))) ok = fail('upi', 'Enter a valid UPI ID, e.g. name@bank.');
    } else if (state.method === 'paytm') {
      if (!/^\d{10}$/.test(val('#dp-phone'))) ok = fail('phone', 'Enter a 10-digit mobile number.');
    }
    return ok;
  };

  // Demo only: nothing is sent anywhere and card details are never stored.
  const submit = () => {
    if (!validate()) { message('Please check the highlighted fields.', false); return; }
    const bonuses = (state.bonuses || []).filter((b) => state.bonus.has(b.id));
    const promo = root.querySelector('#dp-promo').value.trim();
    message('Deposit of ' + state.amount + ' ' + state.currency + ' via ' + METHODS[state.method]
      + (bonuses.length ? ' with ' + bonuses.map((b) => '“' + b.name + '”').join(', ') : '') + (promo ? ' and promo code ' + promo.toUpperCase() : '')
      + ' is ready to connect to the payment provider.', true);
  };

  const onWidgetInput = (e) => {
    const t = e.target;
    if (t.id === 'dp-amount') { setAmount(t.value.replace(/\D/g, '')); t.value = state.amount; }
    if (t.id === 'dp-pan') t.value = t.value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
    if (t.id === 'dp-exp') { const d = t.value.replace(/\D/g, '').slice(0, 4); t.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; }
    if (t.id === 'dp-cvc') t.value = t.value.replace(/\D/g, '').slice(0, 4);
    if (t.id === 'dp-phone') t.value = t.value.replace(/\D/g, '').slice(0, 10);
    t.classList.remove('dp-bad');
  };

  const close = () => {
    root.hidden = true;
    document.body.classList.remove('dp-open');
    if (opener) opener.focus();
  };

  const build = () => {
    root = document.createElement('div');
    root.className = 'dp';
    root.hidden = true;
    root.innerHTML = PANEL;
    document.body.appendChild(root);
    root.querySelector('#dp-cur').innerHTML = Object.keys(CURRENCIES).map((c) => '<option>' + c + '</option>').join('');
    root.querySelector('#dp-cur').addEventListener('change', (e) => {
      state.currency = e.target.value;
      if (!CURRENCIES[state.currency].includes(state.method)) state.method = CURRENCIES[state.currency][0];
      renderMethods();
      renderWidget();
    });
    root.querySelector('#dp-methods').addEventListener('click', (e) => {
      const b = e.target.closest('[data-method]');
      if (!b) return;
      state.method = b.dataset.method;
      renderMethods();
      renderWidget();
    });
    root.querySelector('#dp-bonuses').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bonus]');
      if (!b) return;
      const id = b.dataset.bonus;
      if (state.bonus.has(id)) state.bonus.delete(id); else state.bonus.add(id);
      root.querySelectorAll('[data-bonus]').forEach((x) => x.setAttribute('aria-pressed', String(state.bonus.has(x.dataset.bonus))));
    });
    const widget = root.querySelector('#dp-widget');
    widget.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-amount]');
      if (!chip) return;
      setAmount(chip.dataset.amount);
      widget.querySelector('#dp-amount').value = state.amount;
    });
    widget.addEventListener('input', onWidgetInput);
    root.querySelector('#dp-go').addEventListener('click', submit);
    root.querySelector('#dp-wallet').addEventListener('click', (e) => { e.preventDefault(); message('The wallet screen is coming soon.', false); });
    root.addEventListener('click', (e) => { if (e.target.closest('[data-dp-close]')) close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) close(); });
  };

  const open = (from) => {
    if (!root) build();
    opener = from;
    root.querySelector('#dp-cur').value = state.currency;
    root.querySelector('#dp-msg').innerHTML = '';
    renderMethods();
    renderWidget();
    root.hidden = false;
    document.body.classList.add('dp-open');
    loadBonuses();
    root.querySelector('.dp-x').focus();
  };

  // Capture phase so the page's own Deposit handlers (signup / toast) don't run.
  window.addEventListener('click', (e) => {
    const btn = e.target.closest('.landing-bottom-nav [data-action="deposit"]');
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    open(btn);
  }, true);
})();
