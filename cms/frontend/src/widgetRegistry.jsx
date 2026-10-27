import { t } from './i18n';
import React from 'react';
import '../../../h/art.js';

const widgets = new Map();
export function registerWidget(key, component) {
  if (widgets.has(key)) throw new Error(`Duplicate widget: ${key}`);
  widgets.set(key, component);
}
export function getWidget(key) {
  return widgets.get(key);
}

function CatalogCards({ data, kind }) {
  const classes = { promotions: 'home-promo-track', categories: 'category-slider', providers: 'provider-grid' };
  if (!data.items.length) return <p className="widget-status">{t("No matching catalog items.")}</p>;
  return <div className={classes[kind]}>{data.items.map((item, index) => kind === 'promotions' ?
    <article className="home-feature-card catalog-card" style={{ '--home-art': `url("${globalThis.NexluckHomeArt[index % globalThis.NexluckHomeArt.length]}")` }} key={item.id}>
      <span className="eyebrow">{t("Promotion")}</span><h3>{item.name}</h3><p>{t("See offer terms before participating.")}</p><button data-action="deposit">{t("Deposit")}</button></article> :
    kind === 'categories' ? <article className="home-category-card catalog-card" key={item.id}><span aria-hidden="true">{['✦', '♠', '●', '⚽', '▶', '♛'][index % 6]}</span><small>{item.name}</small></article> :
    <article className="provider-card catalog-card" key={item.id}><span aria-hidden="true">{item.name.slice(0, 2).toUpperCase()}</span><strong>{item.name}</strong></article>)}</div>;
}
for (const kind of ['promotions', 'categories', 'providers']) {
  registerWidget(kind, props => <CatalogCards {...props} kind={kind} />);
}
