(() => {
  const t = (source, params) => window.CMSWebsiteI18n.t(source, params);
  let toastTimer;
  let menuTrigger;
  const notify = text => {
    const toast = document.querySelector('.home-toast');
    toast.textContent = text; toast.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
  };
  const closeMenu = () => {
    document.querySelectorAll('.home-menu').forEach(node => { node.hidden = true; });
    menuTrigger?.focus();
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (event.target.closest('[data-close-menu]')) closeMenu();
    if (!button) return;
    if (button.dataset.notice) notify(button.dataset.notice);
    const action = button.dataset.action;
    if (action === 'menu') {
      menuTrigger = button;
      document.querySelectorAll('.home-menu').forEach(node => { node.hidden = false; node.querySelector('button')?.focus(); });
    }
    if (action === 'search') {
      const input = document.querySelector('.home-search input');
      input?.scrollIntoView({ block: 'center' }); input?.focus();
    }
    if (action === 'deposit') notify(t('Demo only: deposits are not connected.'));
    if (action === 'mode') {
      const sports = document.body.dataset.mode !== 'sports';
      document.body.dataset.mode = sports ? 'sports' : 'casino';
      document.querySelectorAll('.module-games,.module-categories,.module-providers').forEach(node => { node.hidden = sports; });
      button.querySelector('small').textContent = sports ? t('Casino') : t('Sport');
    }
    if (button.dataset.slide) {
      button.closest('[data-block-key]').querySelector('.home-promo-track')?.scrollBy({ left: Number(button.dataset.slide) * 300, behavior: 'smooth' });
    }
  });
  document.addEventListener('input', event => {
    if (!event.target.matches('.home-search input')) return;
    const query = event.target.value.toLowerCase();
    event.target.closest('[data-block-key]').querySelectorAll('.home-game-tile').forEach(node => { node.hidden = !node.textContent.toLowerCase().includes(query); });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
    const menu = document.querySelector('.home-menu:not([hidden]) section');
    if (event.key !== 'Tab' || !menu) return;
    const items = [...menu.querySelectorAll('button,a')], first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
})();
