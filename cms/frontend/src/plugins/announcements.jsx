import React from 'react';
import { registerWidget } from '../widgetRegistry';

function Announcements({ data }) {
  return <div className="announcement-list">{data.items.map(item =>
    <article key={item.id}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>;
}
registerWidget('announcements.notice', Announcements);
