const SECTIONS=[
{k:'analytics',href:'/crm/a/',n:NexLuckI18n.t("Analytics"),i:'📈',c:'#0b5cab'},
{k:'casinos',href:'/crm/c/l/',n:NexLuckI18n.t("My casinos"),i:'🏛️',c:'#7f3fbf'},
{k:'customers',href:'/crm/c/list/',n:NexLuckI18n.t("Customers"),i:'👥',c:'#2e844a'},
{k:'games',href:'/crm/g/',n:NexLuckI18n.t("Games"),i:'🎰',c:'#e8590c'},
{k:'bonuses',href:'/crm/b/',n:NexLuckI18n.t("Bonuses / Promotion"),i:'🎁',c:'#c23934'},
{k:'loyalty',n:NexLuckI18n.t("Loyalty"),i:'⭐',c:'#b8860b'},
{k:'finance',href:'/crm/f/',n:NexLuckI18n.t("Finance"),i:'💶',c:'#0a7d8c'},
{k:'compliance',href:'/coml/',n:NexLuckI18n.t("Compliance"),i:'🛡️',c:'#5a4fcf'},
{k:'audit',n:NexLuckI18n.t("Audit"),i:'📋',c:'#444'}
];
const USER={name:'v.kovalevskiy',device:'MacBook · Chrome 126',last:'02 Oct 2026, 09:41',plan:'Enterprise · active'};
const CRM_PAGE_INDEX = [
  { key: 'games', name: NexLuckI18n.t('List of games'), href: '/crm/g/', aliases: ['game catalog', 'games', 'publishers', 'game categories'] },
  { key: 'home', name: NexLuckI18n.t('CRM home'), href: '/crm/', aliases: ['home', 'dashboard', 'operator console'] },
  ...SECTIONS.filter(s => s.k !== 'games').map(s => ({
    key: s.k, name: s.k === 'customers' ? NexLuckI18n.t('List of customers') : s.k === 'bonuses' ? NexLuckI18n.t('List of bonuses') : s.k === 'finance' ? NexLuckI18n.t('Payment connections') : s.n,
    href: s.href || '/crm/section.html?s=' + s.k,
    aliases: [s.n, s.k, ...(s.k === 'casinos' ? ['casino websites', 'websites', 'website settings', 'cms'] : []), ...(s.k === 'analytics' ? ['reports', 'management reports', 'casino dashboard', 'financial performance', 'retention', 'acquisition', 'risk reports'] : []), ...(s.k === 'finance' ? ['finance', 'payment methods', 'payment systems', 'connection editor'] : [])]
  })),
  { key: 'new-bonus', name: NexLuckI18n.t('New bonus'), href: '/crm/b/e/?new=1', aliases: ['create bonus', 'add bonus', 'empty bonus'] },
  { key: 'ai-bonus', name: NexLuckI18n.t('New bonus with AI agent'), href: '/crm/b/e/?new=1&ai=1', aliases: ['ai bonus', 'generate bonus'] },
  { key: 'edit-bonus', name: NexLuckI18n.t('Edit bonus'), href: '/crm/b/', template: '/crm/b/e/?id=', aliases: ['bonus editor', 'modify bonus'], hint: NexLuckI18n.t("Choose a bonus from the list, or include its BN-ID.") },
  { key: 'customer-info', name: NexLuckI18n.t('Customer profile'), href: '/crm/c/list/', template: '/crm/c/i/?id=', aliases: ['customer info', 'customer details', 'edit customer'], hint: NexLuckI18n.t("Choose a customer from the list, or include its CU-ID.") },
  { key: 'wallets', name: NexLuckI18n.t('List of wallets'), href: '/crm/f/wallets/', aliases: ['wallets', 'wallet balances', 'balances'] },
  { key: 'transactions', name: NexLuckI18n.t('List of transactions'), href: '/crm/f/transactions/', aliases: ['transactions', 'ledger', 'payments'] },
  { key: 'cascades', name: NexLuckI18n.t('Payment cascades'), href: '/crm/f/cascades/', aliases: ['cascades', 'payment routing'] },
  { key: 'api-docs', name: NexLuckI18n.t('API documentation'), href: '/crm/api-docs/', aliases: ['api docs', 'swagger', 'api documentation'] }
];

function crmNavigationMatches(text) {
  const normalized = text.toLowerCase().trim().replace(/[?!.,]/g, '').replace(/\s+/g, ' ');
  const customerId = normalized.match(/\bcu-\d+\b/i), bonusId = normalized.match(/\bbn-\d+\b/i);
  if (customerId || bonusId) {
    const page = CRM_PAGE_INDEX.find(p => p.key === (customerId ? 'customer-info' : 'edit-bonus'));
    const id = (customerId || bonusId)[0].toUpperCase();
    return [{ ...page, href: page.template + id, name: (customerId ? 'Customer ' : 'Edit bonus ') + id, hint: '' }];
  }
  const stem = word => word.replace(/(?:ами|ями|ов|ев|ы|и|а|я|ей|ой)$/u, '');
  const words = normalized.replace(/^(please\s+)?(show\s+me|take\s+me\s+to|navigate\s+to|go\s+to|open|find|view)\b\s*/, '')
    .replace(/^(?:покажи(?:\s+мне)?|открой|перейди(?:\s+к)?|найди)\s+/u, '')
    .replace(/\b(the|a|an|list|of|page|please)\b/g, ' ').replace(/(?:^|\s)(?:список|страницу|пожалуйста)(?=\s|$)/gu, ' ')
    .trim().split(/\s+/).filter(Boolean).map(stem);
  return CRM_PAGE_INDEX.filter(page => words.every(word => [page.name, NexLuckI18n.t(page.name), ...page.aliases]
    .join(' ').toLowerCase().split(/[\s/]+/).some(token => stem(token).startsWith(word))));
}

function mountCRMNavigation() {
  const input = document.getElementById('nav'), list = document.getElementById('crm-nav-options');
  const form = document.getElementById('crm-nav-form'), history = document.getElementById('crm-nav-recent');
  const status = document.getElementById('crm-nav-status');
  const storageKey = 'nexluck.crm.navigation.requests.v1';
  let recent = [], matches = [], active = -1, typed = '';
  const notify = message => { status.textContent = message; };
  const validRequest = request => request && typeof request.text === 'string' && request.text.length <= 200 &&
    typeof request.key === 'string' && CRM_PAGE_INDEX.some(p => p.key === request.key);
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(validRequest)) throw new Error(NexLuckI18n.t("Invalid recent requests"));
      recent = parsed.slice(0, 8);
    }
  } catch (error) { notify(NexLuckI18n.t("Recent requests could not be loaded. Navigation is still available.")); }
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const navigate = (page, text) => {
    const request = { key: page.key, text: (text.trim() || page.name).slice(0, 200) };
    recent = [request, ...recent.filter(old => old.text.toLowerCase() !== request.text.toLowerCase())].slice(0, 8);
    try { localStorage.setItem(storageKey, JSON.stringify(recent)); }
    catch (error) { console.error('CRM navigation history could not be saved', error); }
    location.assign(page.href);
  };
  const renderRecent = () => {
    history.replaceChildren();
    recent.forEach(request => {
      const page = crmNavigationMatches(request.text).find(p => p.key === request.key) || CRM_PAGE_INDEX.find(p => p.key === request.key);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'crm-nav-tag'; button.textContent = request.text;
      button.title = 'Repeat request: ' + request.text;
      button.addEventListener('click', () => navigate(page, request.text));
      history.append(button);
    });
    if (recent.length) {
      const clear = document.createElement('button');
      clear.type = 'button'; clear.className = 'crm-nav-clear'; clear.textContent = NexLuckI18n.t("Clear recent requests");
      clear.addEventListener('click', () => {
        try { localStorage.removeItem(storageKey); recent = []; renderRecent(); }
        catch (error) { notify(NexLuckI18n.t("Recent requests could not be cleared.")); }
      });
      history.append(clear);
    }
  };
  const highlight = index => {
    active = index;
    [...list.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    if (index >= 0) {
      input.setAttribute('aria-activedescendant', list.children[index].id);
      list.children[index].scrollIntoView({ block: 'nearest' });
    }
  };
  const complete = () => {
    if (active < 0 || !matches[active]) return;
    const page = matches[active], prefix = /^\s*show\s+me\b/i.test(typed) ? 'Show me ' : '';
    const pageName = NexLuckI18n.t(page.name);
    input.value = prefix + pageName.charAt(0).toLowerCase() + pageName.slice(1);
    typed = input.value; input.setSelectionRange(input.value.length, input.value.length);
    notify(NexLuckI18n.t("Completed: ") + input.value + NexLuckI18n.t(". Press Enter to navigate."));
  };
  const suggest = () => {
    matches = crmNavigationMatches(typed);
    list.replaceChildren();
    matches.forEach((page, i) => {
      const option = document.createElement('li');
      option.id = 'crm-nav-option-' + i; option.role = 'option'; option.setAttribute('aria-selected', 'false');
      const name = document.createElement('strong'); name.textContent = NexLuckI18n.t(page.name);
      const detail = document.createElement('small'); detail.textContent = NexLuckI18n.t(page.hint || page.href);
      option.append(name, detail);
      option.addEventListener('mousedown', e => e.preventDefault());
      option.addEventListener('mouseenter', () => highlight(i));
      option.addEventListener('click', () => navigate(page, typed));
      list.append(option);
    });
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', String(Boolean(matches.length)));
    highlight(matches.length ? 0 : -1);
    notify(matches.length ? matches.length + NexLuckI18n.t(" destinations. Use arrows, Tab to complete, Enter to open.") : 'No CRM page matches. Try games, customers, bonuses, or API docs.');
  };
  input.addEventListener('focus', () => { typed = input.value; suggest(); });
  input.addEventListener('input', () => { typed = input.value; suggest(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { close(); notify(NexLuckI18n.t("Suggestions closed.")); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (list.hidden) suggest();
      if (matches.length) highlight((active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    }
    if (e.key === 'Tab' && !e.shiftKey && !list.hidden && matches.length) { e.preventDefault(); complete(); close(); }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!input.value.trim()) { notify(NexLuckI18n.t("Type a request or choose a destination first.")); input.focus(); return; }
    const page = matches[active] || crmNavigationMatches(input.value)[0];
    if (page) navigate(page, typed);
    else notify(NexLuckI18n.t("No CRM page matches this request. Choose a suggestion."));
  });
  document.addEventListener('click', e => { if (!form.contains(e.target)) close(); });
  form.addEventListener('focusout', e => { if (!form.contains(e.relatedTarget)) close(); });
  renderRecent();
  const navigation = document.querySelector('.crm-navigation');
  const subbar = document.getElementById('sub');
  const reveal = document.getElementById('crm-nav-reveal');
  const pin = document.getElementById('crm-nav-pin');
  const pinKey = 'nexluck.crm.navigation.pinned.v1';
  let pinned = false;
  try { pinned = localStorage.getItem(pinKey) === 'true'; }
  catch (error) { notify(NexLuckI18n.t("Navigation pin preference could not be loaded.")); }
  const renderPin = () => {
    pin.setAttribute('aria-pressed', String(pinned));
    pin.setAttribute('aria-label', pinned ? 'Unpin navigation' : 'Pin navigation');
    pin.title = pinned ? 'Unpin navigation to restore auto-hide' : 'Pin navigation to keep it visible';
  };
  renderPin();
  let slide;
  let expanded = pinned;
  navigation.hidden = !pinned;
  reveal.setAttribute('aria-expanded', String(pinned));
  const slideNavigation = show => {
    if (expanded === show) return;
    expanded = show;
    const height = navigation.getBoundingClientRect().height;
    const opacity = getComputedStyle(navigation).opacity;
    if (slide) { slide.cancel(); slide = null; }
    navigation.hidden = false;
    reveal.setAttribute('aria-expanded', String(show));
    if (!show) close();
    const finish = () => {
      navigation.hidden = !show;
      navigation.style.overflow = '';
      slide = null;
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    navigation.style.overflow = 'hidden';
    slide = navigation.animate([
      { height: height + 'px', opacity },
      { height: show ? navigation.scrollHeight + 'px' : '0px', opacity: show ? 1 : 0 }
    ], { duration: 240, easing: 'ease-in-out' });
    slide.onfinish = finish;
  };
  const hideNavigation = () => {
    if (pinned || navigation.contains(document.activeElement) || subbar.matches(':hover')) return;
    slideNavigation(false);
  };
  const showNavigation = () => {
    slideNavigation(true);
  };
  subbar.addEventListener('pointerenter', showNavigation);
  subbar.addEventListener('pointermove', showNavigation);
  subbar.addEventListener('pointerleave', hideNavigation);
  document.getElementById('hdr').addEventListener('pointermove', showNavigation);
  document.getElementById('hdr').addEventListener('pointerleave', hideNavigation);
  navigation.addEventListener('focusin', showNavigation);
  navigation.addEventListener('focusout', () => queueMicrotask(hideNavigation));
  reveal.addEventListener('click', () => { showNavigation(); input.focus(); });
  pin.addEventListener('click', () => {
    pinned = !pinned;
    renderPin();
    try { localStorage.setItem(pinKey, String(pinned)); }
    catch (error) { notify(NexLuckI18n.t("Navigation pin changed, but the preference could not be saved.")); }
    showNavigation();
  });
}

function chrome(crumb){
document.getElementById('hdr').innerHTML=`<a class="brand" href="/crm/"><div class="logo">${NexLuckI18n.html("N")}</div>${NexLuckI18n.html("NexLuck")}</a>
<div class="crm-context" id="crm-context"></div>
<div class="right"><div class="meta"><span>${NexLuckI18n.html("User ")}<b>${USER.name}</b></span><i class="sep"></i><span>${NexLuckI18n.html("Device ")}<b>${USER.device}</b></span><i class="sep"></i><span>${NexLuckI18n.html("Last login ")}<b>${USER.last}</b></span><i class="sep"></i><span>${NexLuckI18n.html("Subscription ")}<b class="badge">${USER.plan}</b></span></div>
<button class="gear" title="${NexLuckI18n.html("Settings")}" aria-label="${NexLuckI18n.html("Settings")}">⚙️</button></div>`;
document.getElementById('sub').innerHTML=`<button id="crm-nav-reveal" type="button" aria-label="${NexLuckI18n.html("AI navigation")}" title="${NexLuckI18n.html("AI navigation")}" aria-controls="crm-navigation" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h12M3 12h9M3 19h12M18 8l1.2 2.8L22 12l-2.8 1.2L18 16l-1.2-2.8L14 12l2.8-1.2L18 8Z"/></svg></button><div class="crm-navigation" id="crm-navigation" hidden>
<div class="crm-nav-caption"><label for="nav">${NexLuckI18n.html("Navigate to")}</label><button id="crm-nav-pin" type="button" aria-label="${NexLuckI18n.html("Pin navigation")}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v7"/></svg></button><div id="crm-nav-recent" aria-label="${NexLuckI18n.html("Recent navigation requests")}"></div></div>
<form id="crm-nav-form" role="search" aria-label="${NexLuckI18n.html("Conversational CRM navigation")}">
<div class="crm-nav-input"><input id="nav" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="crm-nav-options" aria-describedby="crm-nav-status" autocomplete="off" maxlength="200" placeholder="${NexLuckI18n.html("Show me list of games, or list of customers...")}">
<ul id="crm-nav-options" role="listbox" aria-label="${NexLuckI18n.html("CRM destinations")}" hidden></ul></div><button type="submit">${NexLuckI18n.html("Go")}</button></form>
<p id="crm-nav-status" role="status">${NexLuckI18n.html("Local navigation: type a request, then choose a suggestion. Tab completes.")}</p></div>${crumb||''}`;
mountCRMNavigation();
NexLuckI18n.mountSelector(document.querySelector('#hdr .right'));
document.getElementById('ftr').innerHTML=`<span>${NexLuckI18n.html("Powered by NexLuck")}</span>|<a href="#">${NexLuckI18n.html("Terms of Services")}</a>|<a href="#">${NexLuckI18n.html("Privacy Policy")}</a>`;
CRMContext.attach();
}
