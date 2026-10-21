(() => {
  if (parent === window) return;
  const send = data => parent.postMessage(data, location.origin);
  let dragging = '';
  const disableHiddenControls = () => {
    document.querySelectorAll('[data-cms-hidden] :is(button,input,select,textarea,a)').forEach(node => {
      if (node.matches('a')) { node.tabIndex = -1; node.setAttribute('aria-disabled', 'true'); }
      else node.disabled = true;
    });
  };
  disableHiddenControls();
  new MutationObserver(disableHiddenControls).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-cms-hidden]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  document.addEventListener('click', event => {
    if (event.target.closest('a,button,input,select,textarea')) return;
    const node = event.target.closest('[data-block-key]');
    if (node) send({ type: 'cms:select', key: node.dataset.blockKey });
  });
  document.addEventListener('contextmenu', event => {
    const node = event.target.closest('[data-block-key]');
    if (!node) return;
    event.preventDefault();
    send({ type: 'cms:context', key: node.dataset.blockKey, x: event.clientX, y: event.clientY });
  });
  document.addEventListener('keydown', event => {
    const node = event.target.closest('[data-block-key]');
    if (node && (event.key === 'F10' && event.shiftKey || event.key === 'ContextMenu')) {
      event.preventDefault();
      send({ type: 'cms:context', key: node.dataset.blockKey });
    }
  });
  const clear = () => document.querySelectorAll('.cms-dragging,.cms-drop-target').forEach(node => node.classList.remove('cms-dragging', 'cms-drop-target'));
  document.addEventListener('dragstart', event => {
    const node = event.target.closest('[data-block-key]');
    if (!node) return;
    dragging = node.dataset.blockKey;
    event.dataTransfer.setData('text/plain', dragging);
    event.dataTransfer.effectAllowed = 'move'; node.classList.add('cms-dragging');
  });
  document.addEventListener('dragover', event => {
    const node = event.target.closest('[data-block-key]');
    if (!node || !dragging || node.dataset.blockKey === dragging) return;
    event.preventDefault(); clear();
    document.querySelector(`[data-block-key="${dragging}"]`)?.classList.add('cms-dragging');
    node.classList.add('cms-drop-target'); event.dataTransfer.dropEffect = 'move';
  });
  document.addEventListener('drop', event => {
    const node = event.target.closest('[data-block-key]');
    if (node && dragging) {
      event.preventDefault();
      send({ type: 'cms:reorder', key: dragging, target: node.dataset.blockKey });
    }
    clear(); dragging = '';
  });
  document.addEventListener('dragend', () => { clear(); dragging = ''; });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'cms:highlight') return;
    document.querySelectorAll('[data-block-key]').forEach(node => {
      const wasSelected = node.classList.contains('preview-selected');
      const selected = node.dataset.blockKey === event.data.key;
      node.classList.toggle('preview-selected', selected);
      if (node.classList.contains('home-menu') && (selected || wasSelected)) node.hidden = !selected;
      if (selected && !node.classList.contains('landing-bottom-nav')) node.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    });
  });
})();
