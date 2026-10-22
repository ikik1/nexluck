(function () {
  'use strict';
  const tiles = document.getElementById('tiles');
  const status = document.getElementById('home-status');
  const retry = document.getElementById('home-retry');

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function load() {
    tiles.replaceChildren();
    status.textContent = NexLuckI18n.t("Loading casino dashboard...");
    status.setAttribute('role', 'status');
    retry.hidden = true;
    try {
      await CRMContext.ready;
      const response = await CRMContext.fetch('/crm/ui-api/v1/dashboard');
      if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error(NexLuckI18n.t("Dashboard API unavailable."));
      const dashboard = await response.json();
      if (!response.ok) throw new Error(NexLuckI18n.t(dashboard.error || 'Unable to load casino dashboard.'));
      if (dashboard.casino_id !== CRMContext.id || dashboard.source !== 'synthetic_demo' ||
          !SECTIONS.every(section => {
            const block = dashboard.sections?.[section.k];
            return block && typeof block.value === 'string' && typeof block.label === 'string' &&
              Array.isArray(block.metrics) && block.metrics.length === 4 &&
              block.metrics.every(metric => typeof metric.label === 'string' && typeof metric.value === 'string' && ['', "up", 'down'].includes(metric.tone));
          })) throw new Error(NexLuckI18n.t("Invalid casino dashboard response."));
      const casino = CRMContext.casinos.find(site => site.id === dashboard.casino_id);
      status.textContent = NexLuckI18n.t('Demo summary for {casino}. Seeded sample metrics, not live operational totals. My Casinos shows the actual permitted registry. Analytics reports keep their independent filters.', { casino: casino.name });
      const cards = SECTIONS.map(section => {
        const block = dashboard.sections[section.k];
        const card = element('a', 'tile');
        card.dataset.section = section.k;
        card.style.setProperty('--c', section.c);
        card.href = CRMContext.url(section.href || '/crm/section.html?s=' + section.k).href;
        const title = element('div', 'top');
        title.append(element('div', 'ico', section.i), document.createTextNode(section.n));
        const headline = element('div', 'big', block.value);
        headline.append(element('small', '', NexLuckI18n.t(block.label)));
        const metrics = element('div', 'kv');
        block.metrics.forEach(metric => {
          const row = element('div', '', NexLuckI18n.t(metric.label));
          row.append(element('b', metric.tone, NexLuckI18n.t(metric.value)));
          metrics.append(row);
        });
        card.append(title, headline, metrics, element('span', 'go', NexLuckI18n.t('View details →')));
        return card;
      });
      tiles.replaceChildren(...cards);
    } catch (error) {
      status.textContent = error.message;
      status.setAttribute('role', 'alert');
      retry.hidden = false;
    }
  }

  retry.addEventListener('click', load);
  load();
})();
