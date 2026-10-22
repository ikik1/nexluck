const FinanceMenu = ({ current }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const down = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, []);
  const items = [['/crm/f/', "Payment methods", '💳'], ['/crm/f/transactions/', "Transactions", '☰'], ['/crm/f/wallets/', "Wallets", '▣'], ['/crm/f/cascades/', "Cascades / Routing", '⇢']];
  const h = React.createElement;
  return h('div', { className: 'hmenu', ref },
    h('button', { className: 'hbtn', 'aria-label': NexLuckI18n.t('Finance menu'), 'aria-haspopup': 'true', 'aria-expanded': open, onClick: () => setOpen(o => !o) },
      h('svg', { viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': true }, h('path', { d: 'M3 5h14M3 10h14M3 15h14', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }))),
    open && h('nav', { className: 'hlist', 'aria-label': NexLuckI18n.t('Finance') },
      items.map(([href, label, ico]) => h('a', { key: href, href, className: href === current ? 'cur' : '', 'aria-current': href === current ? 'page' : undefined }, h('span', null, ico), NexLuckI18n.t(label)))));
};
