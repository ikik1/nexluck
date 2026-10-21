const SECTIONS=[
{k:'analytics',href:'/crm/a/',n:'Analytics',i:'📈',c:'#0b5cab',big:['€482.3k','GGR (7d)'],kv:[['NGR','€391.8k','up'],['Active players','18,742','up'],['ARPU','€25.7','up'],['Retention D30','21.4%','down']]},
{k:'casinos',href:'/crm/c/l/',n:'My casinos',i:'🏛️',c:'#7f3fbf',big:['6','Brands live'],kv:[['Jurisdictions','4',''],['Uptime','99.98%','up'],['Licences active','5 / 6',''],['Open incidents','1','down']]},
{k:'customers',href:'/crm/c/list/',n:'Customers',i:'👥',c:'#2e844a',big:['126,480','Total players'],kv:[['New (7d)','1,356','up'],['VIP','842',''],['Pending KYC','87','down'],['Self-excluded','312','']]},
{k:'games',href:'/crm/g/',n:'Games',i:'🎰',c:'#e8590c',big:['3,214','Games live'],kv:[['Providers','48',''],['Avg RTP','96.2%',''],['Top game','Gates of Olympus',''],['New this month','37','up']]},
{k:'bonuses',href:'/crm/b/',n:'Bonuses / Promotion',i:'🎁',c:'#c23934',big:['24','Active campaigns'],kv:[['Bonus cost (7d)','€58.2k','down'],['Redemption rate','34%','up'],['Wagering done','61%',''],['Abuse flags','9','down']]},
{k:'loyalty',n:'Loyalty',i:'⭐',c:'#b8860b',big:['12,904','Club members'],kv:[['Diamond tier','128',''],['Points issued','4.2M','up'],['Redeemed','1.1M',''],['Churn risk VIPs','23','down']]},
{k:'finance',href:'/crm/f/',n:'Finance',i:'💶',c:'#0a7d8c',big:['€1.26M','Deposits (7d)'],kv:[['Withdrawals','€812k','down'],['Pending payouts','64',''],['Chargebacks','0.4%','up'],['PSP success rate','94.7%','up']]},
{k:'compliance',n:'Compliance',i:'🛡️',c:'#5a4fcf',big:['87','KYC in queue'],kv:[['AML alerts','14','down'],['SAR filed (30d)','3',''],['RG interventions','41',''],['Reports due','2','down']]},
{k:'audit',n:'Audit',i:'📋',c:'#444',big:['2,381','Events (24h)'],kv:[['Admin logins','96',''],['Permission changes','4',''],['Failed logins','17','down'],['Last export','Today 09:12','']]}
];
const USER={name:'v.kovalevskiy',device:'MacBook · Chrome 126',last:'02 Oct 2026, 09:41',plan:'Enterprise · active'};
const CRM_PAGE_INDEX = [
  { key: 'games', name: 'List of games', href: '/crm/g/', aliases: ['game catalog', 'games', 'publishers', 'game categories'] },
  { key: 'home', name: 'CRM home', href: '/crm/', aliases: ['home', 'dashboard', 'operator console'] },
  ...SECTIONS.filter(s => s.k !== 'games').map(s => ({
    key: s.k, name: s.k === 'customers' ? 'List of customers' : s.k === 'bonuses' ? 'List of bonuses' : s.k === 'finance' ? 'Payment connections' : s.n,
    href: s.href || '/crm/section.html?s=' + s.k,
    aliases: [s.n, s.k, ...(s.k === 'casinos' ? ['casino websites', 'websites', 'website settings', 'cms'] : []), ...(s.k === 'analytics' ? ['reports', 'management reports', 'casino dashboard', 'financial performance', 'retention', 'acquisition', 'risk reports'] : []), ...(s.k === 'finance' ? ['finance', 'payment methods', 'payment systems', 'connection editor'] : [])]
  })),
  { key: 'new-bonus', name: 'New bonus', href: '/crm/b/e/?new=1', aliases: ['create bonus', 'add bonus', 'empty bonus'] },
  { key: 'ai-bonus', name: 'New bonus with AI agent', href: '/crm/b/e/?new=1&ai=1', aliases: ['ai bonus', 'generate bonus'] },
  { key: 'edit-bonus', name: 'Edit bonus', href: '/crm/b/', template: '/crm/b/e/?id=', aliases: ['bonus editor', 'modify bonus'], hint: 'Choose a bonus from the list, or include its BN-ID.' },
  { key: 'customer-info', name: 'Customer profile', href: '/crm/c/list/', template: '/crm/c/i/?id=', aliases: ['customer info', 'customer details', 'edit customer'], hint: 'Choose a customer from the list, or include its CU-ID.' },
  { key: 'wallets', name: 'List of wallets', href: '/crm/f/wallets/', aliases: ['wallets', 'wallet balances', 'balances'] },
  { key: 'transactions', name: 'List of transactions', href: '/crm/f/transactions/', aliases: ['transactions', 'ledger', 'payments'] },
  { key: 'cascades', name: 'Payment cascades', href: '/crm/f/cascades/', aliases: ['cascades', 'payment routing'] },
  { key: 'api-docs', name: 'API documentation', href: '/crm/api-docs/', aliases: ['api docs', 'swagger', 'api documentation'] }
];

function crmNavigationMatches(text) {
  const normalized = text.toLowerCase().trim().replace(/[?!.,]/g, '').replace(/\s+/g, ' ');
  const customerId = normalized.match(/\bcu-\d+\b/i), bonusId = normalized.match(/\bbn-\d+\b/i);
  if (customerId || bonusId) {
    const page = CRM_PAGE_INDEX.find(p => p.key === (customerId ? 'customer-info' : 'edit-bonus'));
    const id = (customerId || bonusId)[0].toUpperCase();
    return [{ ...page, href: page.template + id, name: (customerId ? 'Customer ' : 'Edit bonus ') + id, hint: '' }];
  }
  const words = normalized.replace(/^(please\s+)?(show\s+me|take\s+me\s+to|navigate\s+to|go\s+to|open|find|view)\b\s*/, '')
    .replace(/\b(the|a|an|list|of|page|please)\b/g, ' ').trim().split(/\s+/).filter(Boolean);
  return CRM_PAGE_INDEX.filter(page => words.every(word => [page.name, ...page.aliases].join(' ').toLowerCase().split(/[\s/]+/).some(token => token.startsWith(word))));
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
      if (!Array.isArray(parsed) || !parsed.every(validRequest)) throw new Error('Invalid recent requests');
      recent = parsed.slice(0, 8);
    }
  } catch (error) { notify('Recent requests could not be loaded. Navigation is still available.'); }
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
      clear.type = 'button'; clear.className = 'crm-nav-clear'; clear.textContent = 'Clear recent requests';
      clear.addEventListener('click', () => {
        try { localStorage.removeItem(storageKey); recent = []; renderRecent(); }
        catch (error) { notify('Recent requests could not be cleared.'); }
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
    input.value = prefix + page.name.charAt(0).toLowerCase() + page.name.slice(1);
    typed = input.value; input.setSelectionRange(input.value.length, input.value.length);
    notify('Completed: ' + input.value + '. Press Enter to navigate.');
  };
  const suggest = () => {
    matches = crmNavigationMatches(typed);
    list.replaceChildren();
    matches.forEach((page, i) => {
      const option = document.createElement('li');
      option.id = 'crm-nav-option-' + i; option.role = 'option'; option.setAttribute('aria-selected', 'false');
      const name = document.createElement('strong'); name.textContent = page.name;
      const detail = document.createElement('small'); detail.textContent = page.hint || page.href;
      option.append(name, detail);
      option.addEventListener('mousedown', e => e.preventDefault());
      option.addEventListener('mouseenter', () => highlight(i));
      option.addEventListener('click', () => navigate(page, typed));
      list.append(option);
    });
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', String(Boolean(matches.length)));
    highlight(matches.length ? 0 : -1);
    notify(matches.length ? matches.length + ' destinations. Use arrows, Tab to complete, Enter to open.' : 'No CRM page matches. Try games, customers, bonuses, or API docs.');
  };
  input.addEventListener('focus', () => { typed = input.value; suggest(); });
  input.addEventListener('input', () => { typed = input.value; suggest(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { close(); notify('Suggestions closed.'); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (list.hidden) suggest();
      if (matches.length) highlight((active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    }
    if (e.key === 'Tab' && !e.shiftKey && !list.hidden && matches.length) { e.preventDefault(); complete(); close(); }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!input.value.trim()) { notify('Type a request or choose a destination first.'); input.focus(); return; }
    const page = matches[active] || crmNavigationMatches(input.value)[0];
    if (page) navigate(page, typed);
    else notify('No CRM page matches this request. Choose a suggestion.');
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
  catch (error) { notify('Navigation pin preference could not be loaded.'); }
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
    catch (error) { notify('Navigation pin changed, but the preference could not be saved.'); }
    showNavigation();
  });
}

function chrome(crumb){
document.getElementById('hdr').innerHTML=`<a class="brand" href="/crm/"><div class="logo">N</div>NexLuck</a>
<div class="crm-context" id="crm-context"></div>
<div class="right"><div class="meta"><span>User <b>${USER.name}</b></span><i class="sep"></i><span>Device <b>${USER.device}</b></span><i class="sep"></i><span>Last login <b>${USER.last}</b></span><i class="sep"></i><span>Subscription <b class="badge">${USER.plan}</b></span></div>
<button class="gear" title="Settings" aria-label="Settings">⚙️</button></div>`;
document.getElementById('sub').innerHTML=`<button id="crm-nav-reveal" type="button" aria-label="AI navigation" title="AI navigation" aria-controls="crm-navigation" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h12M3 12h9M3 19h12M18 8l1.2 2.8L22 12l-2.8 1.2L18 16l-1.2-2.8L14 12l2.8-1.2L18 8Z"/></svg></button><div class="crm-navigation" id="crm-navigation" hidden>
<div class="crm-nav-caption"><label for="nav">Navigate to</label><button id="crm-nav-pin" type="button" aria-label="Pin navigation" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v7"/></svg></button><div id="crm-nav-recent" aria-label="Recent navigation requests"></div></div>
<form id="crm-nav-form" role="search" aria-label="Conversational CRM navigation">
<div class="crm-nav-input"><input id="nav" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="crm-nav-options" aria-describedby="crm-nav-status" autocomplete="off" maxlength="200" placeholder="Show me list of games, or list of customers...">
<ul id="crm-nav-options" role="listbox" aria-label="CRM destinations" hidden></ul></div><button type="submit">Go</button></form>
<p id="crm-nav-status" role="status">Local navigation: type a request, then choose a suggestion. Tab completes.</p></div>${crumb||''}`;
mountCRMNavigation();
document.getElementById('ftr').innerHTML=`<span>Powered by NexLuck</span>|<a href="#">Terms of Services</a>|<a href="#">Privacy Policy</a>`;
CRMContext.attach();
}
