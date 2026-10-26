const { useState, useEffect, useRef, useMemo } = React;
const REVIEW_STATUSES = ['New', 'Pending', 'Approved', 'Declined'];
const COMPLIANCE_TABS = [
  ['payouts', 'Payout requests'],
  ['kyc_requests', 'KYC requests'],
  ['alerts', 'Customers with alerts']
];
const complianceDate = value => value ? new Date(value).toLocaleString(NexLuckI18n.formatLocale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const scoreTone = score => NexLuckSegmentTags.riskLevel(score);
const segmentLabel = segment => segment.tag_name || segment.name;
const ComplianceSegmentSelection = createSegmentSelection(React);

async function complianceRequest(path = '', options = {}) {
  const response = await CRMContext.fetch('/crm/ui-api/v1/compliance' + path, options);
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error(NexLuckI18n.t('Compliance API is unavailable.'));
  }
  const payload = await response.json();
  if (!response.ok) {
    const details = Object.entries(payload.fields || {}).map(([field, value]) => field + ': ' + value).join('; ');
    throw new Error([payload.error || NexLuckI18n.t('Unable to save compliance changes.'), details].filter(Boolean).join(' '));
  }
  return payload;
}

function ComplianceForm({ title, onClose, onSubmit, children, submitLabel = 'Save', wide = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => CRMContext.setDirty('compliance-form', false), []);
  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await onSubmit();
      CRMContext.setDirty('compliance-form', false);
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <SegmentDialog title={NexLuckI18n.t(title)} wide={wide} busy={busy} onClose={onClose}>
    <form onSubmit={submit} onChange={() => CRMContext.setDirty('compliance-form', true)}>
      <fieldset disabled={busy} className="compliance-fieldset">{children}</fieldset>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="customer-actions">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>{NexLuckI18n.t('Cancel')}</button>
        <button type="submit" className="btn pri" disabled={busy}>{NexLuckI18n.t(busy ? 'Saving…' : submitLabel)}</button>
      </div>
    </form>
  </SegmentDialog>;
}

function RiskMatrix({ segments, entries, onClose, onSaved }) {
  const [rows, setRows] = useState(entries.map(entry => ({ ...entry })));
  const [selected, setSelected] = useState('');
  const update = (index, value) => setRows(old => old.map((entry, i) => i === index ? { ...entry, score: value } : entry));
  return <ComplianceForm title="Risk matrix" wide onClose={onClose} onSubmit={async () => {
    if (rows.some(row => row.score === '' || !Number.isInteger(Number(row.score)) || Number(row.score) < 0 || Number(row.score) > 100)) {
      throw new Error(NexLuckI18n.t('Risk scores must be whole numbers from 0 to 100.'));
    }
    await complianceRequest('/risk-matrix', { method: 'PATCH', body: JSON.stringify({ entries: rows.map(row => ({ segment_id: row.segment_id, score: Number(row.score) })) }) });
    await onSaved();
  }}>
    <p className="notice">{NexLuckI18n.t('Customer risk is the highest score among matching segments, not the sum. No matches means 0/100.')}</p>
    <p className="hint">{NexLuckI18n.t('Risk tags: 0–40 gold, 41–60 orange, 61–100 red. Only risk_ segment names receive risk colours.')}</p>
    {rows.map((row, index) => {
      const segment = segments.find(entry => entry.id === row.segment_id);
      return <div className="matrix-row" key={row.segment_id}>
        <div><b>{segment ? segmentLabel(segment) : row.segment_id}</b><small>{segment?.name}</small></div>
        <label className="field">{NexLuckI18n.t('Risk score')}<input aria-label={NexLuckI18n.t('Risk score') + ' ' + (segment?.name || row.segment_id)} type="number" min="0" max="100" step="1" required value={row.score} onChange={event => update(index, event.target.value)} /></label>
        <button type="button" className="btn" onClick={() => { setRows(old => old.filter((_, i) => i !== index)); CRMContext.setDirty('compliance-form', true); }}>{NexLuckI18n.t('Remove')}</button>
      </div>;
    })}
    <div className="matrix-row">
      <label className="field">{NexLuckI18n.t('Add segment')}<select aria-label={NexLuckI18n.t('Add segment')} value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">{NexLuckI18n.t('Select a segment')}</option>
        {segments.filter(segment => !rows.some(row => row.segment_id === segment.id)).map(segment => <option key={segment.id} value={segment.id}>{segmentLabel(segment)} · {segment.name}</option>)}
      </select></label>
      <button type="button" className="btn" disabled={!selected} onClick={() => {
        setRows(old => [...old, { segment_id: selected, score: 0 }]); setSelected(''); CRMContext.setDirty('compliance-form', true);
      }}>{NexLuckI18n.t('Add')}</button>
    </div>
  </ComplianceForm>;
}

function KYCRequestForm({ customers, customerId = '', onClose, onSaved }) {
  const [selected, setSelected] = useState(customerId);
  const [documentName, setDocumentName] = useState('');
  return <ComplianceForm title="New KYC request" onClose={onClose} submitLabel="Create request" onSubmit={async () => {
    await complianceRequest('/kyc-requests', { method: 'POST', body: JSON.stringify({ customer_id: selected, document_name: documentName.trim() }) });
    await onSaved();
  }}>
    <p className="notice">{NexLuckI18n.t('Internal review request only. No document upload or external notification is sent.')}</p>
    <label className="field">{NexLuckI18n.t('Customer')}<select required aria-label={NexLuckI18n.t('Customer')} value={selected} onChange={event => setSelected(event.target.value)}>
      <option value="">{NexLuckI18n.t('Select a customer')}</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.external_id || customer.id}</option>)}
    </select></label>
    <label className="field">{NexLuckI18n.t('Document name')}<input required maxLength="200" value={documentName} onChange={event => setDocumentName(event.target.value)} /></label>
  </ComplianceForm>;
}

function ReviewRequest({ row, kind, onClose, onSaved }) {
  const [status, setStatus] = useState(row.status === 'New' ? 'Pending' : row.status);
  const resource = kind === 'kyc_requests' ? 'kyc-requests' : kind;
  return <ComplianceForm title="Process request" onClose={onClose} onSubmit={async () => {
    await complianceRequest('/' + resource + '/' + encodeURIComponent(row.id), { method: 'PATCH', body: JSON.stringify({ status }) });
    await onSaved();
  }}>
    <p><b>{row.external_id}</b> · {row.customer.name}</p>
    <p className="notice">{NexLuckI18n.t('Review status only. Approving a payout does not execute a payment.')}</p>
    <label className="field">{NexLuckI18n.t('Status')}<select aria-label={NexLuckI18n.t('Status')} value={status} onChange={event => setStatus(event.target.value)}>
      {REVIEW_STATUSES.map(value => <option key={value} value={value}>{NexLuckI18n.t(value)}</option>)}
    </select></label>
  </ComplianceForm>;
}

function ComplianceChat({ customer, onClose }) {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const path = '/customers/' + encodeURIComponent(customer.id) + '/chat';
  const load = async () => {
    setLoading(true); setError('');
    try { setItems((await complianceRequest(path)).items); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  return <ComplianceForm title="Customer conversation" onClose={onClose} submitLabel="Save message" onSubmit={async () => {
    if (!message.trim()) throw new Error(NexLuckI18n.t('Enter a message.'));
    await complianceRequest(path, { method: 'POST', body: JSON.stringify({ message: message.trim() }) });
  }}>
    <p><b>{customer.name}</b> · {customer.id}</p>
    <p className="notice">{NexLuckI18n.t('Internal staff conversation. Messages are stored in CRM and are not delivered to the customer.')}</p>
    {loading && <p role="status">{NexLuckI18n.t('Loading…')}</p>}
    {error && <p role="alert" className="error">{error} <button type="button" className="btn" onClick={load}>{NexLuckI18n.t('Retry')}</button></p>}
    <ul className="compliance-chat">{items.map(item => <li key={item.id}><time>{complianceDate(item.created_at)}</time><p>{item.message}</p></li>)}</ul>
    <label className="field">{NexLuckI18n.t('Message')}<textarea required maxLength="4000" value={message} onChange={event => setMessage(event.target.value)} /></label>
  </ComplianceForm>;
}

function ComplianceMenu({ menu, onClose, onAction }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.querySelector('button')?.focus();
    const dismiss = event => { if (!ref.current?.contains(event.target)) onClose(); };
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...ref.current.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
      }
      if (event.key === 'Tab') onClose();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', keyboard);
    const close = () => onClose();
    window.addEventListener('resize', close);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('touchmove', close, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', close); window.removeEventListener('touchmove', close);
      menu.trigger?.focus();
    };
  }, []);
  const actions = menu.kind === 'kyc_requests' ? [['request', 'New request'], ['chat', 'Chat'], ['review', 'Process ...'], ['decline', 'Decline']]
    : menu.kind === 'payouts' ? [['review', 'Process ...'], ['request', 'KYC Request'], ['decline', 'Decline']]
    : [['block', 'Block']];
  return <div ref={ref} role="menu" className="compliance-menu" aria-label={NexLuckI18n.t('Actions')} style={{ left: Math.max(12, Math.min(menu.x, innerWidth - 200)), top: Math.max(12, Math.min(menu.y, innerHeight - 210)) }}>
    {actions.map(([action, label]) => <button type="button" role="menuitem" key={action} disabled={action === 'block' && menu.row.customer.compliance_blocked === true} onClick={() => onAction(action, menu)}>{NexLuckI18n.t(action === 'block' && menu.row.customer.compliance_blocked ? 'Blocked' : label)}</button>)}
  </div>;
}

function Compliance() {
  const [data, setData] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [segments, setSegments] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [tab, setTab] = useState('payouts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);
  const [filters, setFilters] = useState({});
  const [selectedSegments, setSelectedSegments] = useState([]);
  const [segmentPicker, setSegmentPicker] = useState(false);
  const [page, setPage] = useState(0);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const payload = await complianceRequest();
      const [profiles, list, fields] = await Promise.all([
        apiRequest('/crm/ui-api/v1/customers'), apiRequest(SEGMENT_API), apiRequest(SEGMENT_API + '/parameters')
      ]);
      setData(payload); setCustomers(profiles.items); setSegments(list.items); setParameters(fields.items);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const membership = useMemo(() => Object.fromEntries(customers.map(customer => [
    customer.id, customerSegmentIds(customer, segments, parameters)
  ])), [customers, segments, parameters]);
  const customerById = Object.fromEntries(customers.map(customer => [customer.id, customer]));
  const matrix = Object.fromEntries((data?.risk_matrix || []).map(entry => [entry.segment_id, entry.score]));
  const groupsFor = customer => segments.filter(segment => membership[customer.id]?.includes(segment.id));
  const riskFor = customer => Math.max(0, ...groupsFor(customer).map(segment => matrix[segment.id] || 0));
  const ggrFor = customer => segmentFacts(customer).monetary({ field: 'lifetime_ggr', currency: customer.currency });
  const ggrText = customer => {
    const value = ggrFor(customer);
    return value === null ? '—' : value.toLocaleString(NexLuckI18n.formatLocale, { maximumFractionDigits: 2 }) + ' ' + customer.currency;
  };
  const columns = [
    ['external_id', 'External ID', row => row.external_id],
    ['created_at', 'Created at', row => row.created_at],
    ['updated_at', 'Updated at', row => row.updated_at],
    ...(tab === 'payouts' ? [['amount', 'Amount', row => row.amount], ['currency', 'Currency', row => row.currency]]
      : tab === 'kyc_requests' ? [['document_name', 'Document name', row => row.document_name], ['preview_url', 'Uploaded file', row => row.preview_url ? NexLuckI18n.t('Preview') : NexLuckI18n.t('No file uploaded')]]
      : [['segments', 'Segments', row => groupsFor(row.customer).map(segment => segment.name + ' ' + segmentLabel(segment)).join(' ')]]),
    ['username', 'Username', row => row.customer.name + ' ' + row.customer.id],
    ...(tab === 'payouts' ? [['payment_method', 'Payment method', row => row.payment_method]]
      : tab === 'alerts' ? [['last_session', 'Last session', row => row.last_session ? row.last_session.ip + ' (' + row.last_session.country + ') ' + row.last_session.at + ' ' + row.last_session.device : '']] : []),
    ['risk', 'Risk score', row => riskFor(row.customer) + '/100'],
    ...(tab === 'kyc_requests' ? [] : [['kyc', 'KYC status', row => row.customer.kyc_status]]),
    ['aml', 'AML', row => row.customer.aml_status],
    ['ggr', 'GGR', row => ggrText(row.customer)],
    ...(tab === 'alerts' ? [] : [['status', tab === 'kyc_requests' ? 'Req status' : 'Status', row => row.status]]),
    ...(tab === 'kyc_requests' ? [['kyc', 'KYC status', row => row.customer.kyc_status]] : [])
  ];
  const allRows = (data?.[tab] || []).map(row => ({ ...row, customer: customerById[row.customer_id] })).filter(row => row.customer);
  const rows = allRows.filter(row => columns.every(([key, , value]) => {
    if (key === 'created_at' || key === 'updated_at') {
      if (!filters[key]) return true;
      const date = new Date(value(row));
      const localDate = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      return localDate === filters[key];
    }
    if (key === 'amount') {
      const minimum = filters.amount_min, maximum = filters.amount_max;
      return (minimum === undefined || minimum === '' || row.amount >= Number(minimum)) &&
        (maximum === undefined || maximum === '' || row.amount <= Number(maximum));
    }
    const text = String(value(row) ?? '') + ' ' + (['created_at', 'updated_at'].includes(key) ? complianceDate(value(row)) : NexLuckI18n.t(String(value(row) ?? '')));
    return text.toLocaleLowerCase().includes((filters[key] || '').trim().toLocaleLowerCase());
  }) && (!selectedSegments.length || selectedSegments.some(id => membership[row.customer_id]?.includes(id))))
    .sort((a, b) => (tab !== 'alerts' ? Number(b.status === 'New') - Number(a.status === 'New') : 0) ||
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const pageCount = Math.max(1, Math.ceil(rows.length / 15));
  const currentPage = Math.min(page, pageCount - 1);
  const closeDialog = () => { setDialog(null); CRMContext.setDirty('compliance-form', false); };
  const act = (action, context) => {
    setMenu(null);
    setDialog({ type: action, row: context.row, kind: context.kind });
  };
  const openMenu = (event, row) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ row, kind: tab, x: event.clientX || rect.left, y: event.clientY || rect.bottom, trigger: event.currentTarget });
  };
  const statusClass = row => {
    if (tab === 'alerts') return row.customer.compliance_blocked ? 'customer-blocked' : '';
    const value = tab === 'kyc_requests' ? ({ VERIFIED: 'Approved', REJECTED: 'Declined', PENDING: 'Pending', NOT_STARTED: 'New' }[row.customer.kyc_status] || 'New') : row.status;
    return 'review-' + value.toLowerCase();
  };
  const renderCell = (key, value, row) => {
    const customer = row.customer;
    if (key === 'created_at' || key === 'updated_at') return <time dateTime={value}>{complianceDate(value)}</time>;
    if (key === 'username') return <><a href={CRMContext.url('/crm/c/i/?id=' + encodeURIComponent(customer.id)).href}>{customer.name}</a><small>{customer.id}</small>{customer.compliance_blocked && <small className="status bad">{NexLuckI18n.t('Blocked')}</small>}{tab !== 'alerts' && <SegmentTags segments={groupsFor(customer)} />}</>;
    if (key === 'segments') return <SegmentTags segments={groupsFor(customer)} />;
    if (key === 'risk') return <span className={'compliance-score ' + scoreTone(riskFor(customer))}>{value}</span>;
    if (key === 'ggr') return <button className="compliance-stat" type="button" aria-label={NexLuckI18n.t('Customer segment parameters') + ' ' + customer.name} onClick={() => setDialog({ type: 'statistics', row })}>{value} …</button>;
    if (key === 'preview_url') return row.preview_url ? <button className="btn" type="button" onClick={() => setDialog({ type: 'preview', row })}>{NexLuckI18n.t('Preview')}</button> : <span className="hint">{NexLuckI18n.t('No file uploaded')}</span>;
    if (key === 'last_session') return row.last_session ? <>{row.last_session.ip} ({row.last_session.country})<small>{complianceDate(row.last_session.at)} · {row.last_session.device}</small></> : '—';
    if (key === 'status' || key === 'kyc' || key === 'aml') return <span className="status">{NexLuckI18n.t(value.replace(/_/g, ' '))}</span>;
    if (key === 'amount') return Number(value).toLocaleString(NexLuckI18n.formatLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return value;
  };
  return <>
    <div className="compliance-heading"><p className="lead">{NexLuckI18n.t('Customer verification, payout reviews and risk alerts.')}</p>
      <button type="button" className="btn" disabled={loading || !data} onClick={() => setDialog({ type: 'matrix' })}>{NexLuckI18n.t('Risk matrix')}</button></div>
    {data?.demo && <p className="notice">{NexLuckI18n.t('Demo compliance records. Documents and sessions are fictional. Review actions do not execute payments or contact customers.')}</p>}
    {loading && <p role="status">{NexLuckI18n.t('Loading compliance records…')}</p>}
    {error && <p role="alert" className="error">{error} <button className="btn" type="button" onClick={load}>{NexLuckI18n.t('Retry')}</button></p>}
    {!loading && data && !error && <>
      <div className="compliance-tabs" role="tablist" aria-label={NexLuckI18n.t('Compliance')}>
        {COMPLIANCE_TABS.map(([key, label]) => <button type="button" role="tab" id={'tab-' + key} aria-controls="compliance-panel" aria-selected={tab === key} key={key} onClick={() => { setTab(key); setFilters({}); setSelectedSegments([]); setPage(0); }}>
          <strong>{NexLuckI18n.t(label)}</strong><span className="compliance-new">{NexLuckI18n.t('New')} {data[key].filter(row => row.status === 'New').length}</span>
        </button>)}
      </div>
      <section role="tabpanel" id="compliance-panel" aria-labelledby={'tab-' + tab}>
        <div className="compliance-heading"><h2>{NexLuckI18n.t(COMPLIANCE_TABS.find(([key]) => key === tab)[1])}</h2>
          <div className="inline-actions">
            {tab === 'kyc_requests' && <button className="btn pri" type="button" onClick={() => setDialog({ type: 'request' })}>{NexLuckI18n.t('New request')}</button>}
          </div>
        </div>
        <details className="compliance-filters"><summary>{NexLuckI18n.t('Filter all fields')}</summary>
          <div className="compliance-segment-filter"><button className="btn" type="button" onClick={() => setSegmentPicker(true)}>{NexLuckI18n.t('Segments')}</button>
            <SegmentTags segments={segments.filter(segment => selectedSegments.includes(segment.id))} onRemove={id => { setSelectedSegments(old => old.filter(value => value !== id)); setPage(0); }} />
          </div>
          <p className="hint">{NexLuckI18n.t('Selected segments use OR; field filters use AND. New requests appear first, then newest records.')}</p>
          <div className="compliance-filter-grid">{columns.map(([key, label]) => key === 'amount' ? <fieldset className="compliance-amount-range" key={key}>
            <legend>{NexLuckI18n.t(label)}</legend>
            {['min', 'max'].map(bound => <label className="field" key={bound}>{NexLuckI18n.t(bound === 'min' ? 'Minimum amount' : 'Maximum amount')}
              <input type="number" min="0" step="any" aria-label={NexLuckI18n.t(bound === 'min' ? 'Minimum amount' : 'Maximum amount')} value={filters['amount_' + bound] ?? ''} onChange={event => { setFilters(old => ({ ...old, ['amount_' + bound]: event.target.value })); setPage(0); }} />
            </label>)}
          </fieldset> : <label className="field" key={key}>{NexLuckI18n.t(label)}
            <input type={key === 'created_at' || key === 'updated_at' ? 'date' : 'search'} aria-label={NexLuckI18n.t('Filter') + ' ' + NexLuckI18n.t(label)} value={filters[key] || ''} onChange={event => { setFilters(old => ({ ...old, [key]: event.target.value })); setPage(0); }} />
          </label>)}</div>
          {filters.amount_min !== undefined && filters.amount_min !== '' && filters.amount_max !== undefined && filters.amount_max !== '' && Number(filters.amount_min) > Number(filters.amount_max) && <p role="alert" className="error">{NexLuckI18n.t('Minimum amount must not exceed maximum amount.')}</p>}
          <button type="button" className="btn" onClick={() => { setFilters({}); setSelectedSegments([]); setPage(0); }}>{NexLuckI18n.t('Clear filters')}</button>
        </details>
        <p className="count">{NexLuckI18n.t('Showing {count} of {total}', { count: rows.length, total: allRows.length })}</p>
        <div className="customer-table compliance-table"><table><thead><tr>{columns.map(([key, label]) => <th scope="col" key={key}>{NexLuckI18n.t(label)}</th>)}<th scope="col">{NexLuckI18n.t('Actions')}</th></tr></thead>
          <tbody>{rows.slice(currentPage * 15, (currentPage + 1) * 15).map(row => <tr key={row.id} data-id={row.id} data-status={row.status} className={statusClass(row)} tabIndex="0" onContextMenu={event => openMenu(event, row)} onKeyDown={event => {
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openMenu(event, row);
          }}>{columns.map(([key, , value]) => <td key={key} data-column={key}>{renderCell(key, value(row), row)}</td>)}
            <td><button type="button" className="btn" aria-label={NexLuckI18n.t('Actions') + ' ' + row.external_id} onClick={event => openMenu(event, row)}>⋯</button></td>
          </tr>)}</tbody>
        </table>{!rows.length && <p className="empty">{NexLuckI18n.t('No matching records.')}</p>}</div>
        <div className="pager"><button type="button" className="btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{NexLuckI18n.t('Previous')}</button>
          <span>{currentPage + 1} / {pageCount}</span><button type="button" className="btn" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>{NexLuckI18n.t('Next')}</button></div>
      </section>
    </>}
    {segmentPicker && <SegmentDialog title={NexLuckI18n.t('Segments')} onClose={() => setSegmentPicker(false)}>
      <ComplianceSegmentSelection entries={segments} selected={selectedSegments} onSelect={segment => {
        setSelectedSegments(old => old.includes(segment.id) ? old.filter(id => id !== segment.id) : [...old, segment.id]); setPage(0);
      }} />
      <button className="btn" type="button" onClick={() => setSegmentPicker(false)}>{NexLuckI18n.t('Done')}</button>
    </SegmentDialog>}
    {menu && <ComplianceMenu menu={menu} onClose={() => setMenu(null)} onAction={act} />}
    {dialog?.type === 'matrix' && <RiskMatrix segments={segments} entries={data.risk_matrix} onClose={closeDialog} onSaved={load} />}
    {dialog?.type === 'request' && <KYCRequestForm customers={customers} customerId={dialog.row?.customer_id} onClose={closeDialog} onSaved={load} />}
    {dialog?.type === 'review' && <ReviewRequest row={dialog.row} kind={dialog.kind} onClose={closeDialog} onSaved={load} />}
    {dialog?.type === 'decline' && <ComplianceForm title="Decline request" onClose={closeDialog} submitLabel="Decline" onSubmit={async () => {
      const resource = dialog.kind === 'kyc_requests' ? 'kyc-requests' : dialog.kind;
      await complianceRequest('/' + resource + '/' + encodeURIComponent(dialog.row.id), { method: 'PATCH', body: JSON.stringify({ status: 'Declined' }) });
      await load();
    }}><p>{NexLuckI18n.t('Decline this request?')} <b>{dialog.row.external_id}</b> · {dialog.row.customer.name}</p></ComplianceForm>}
    {dialog?.type === 'chat' && <ComplianceChat customer={dialog.row.customer} onClose={closeDialog} />}
    {dialog?.type === 'block' && <ComplianceForm title="Block customer" onClose={closeDialog} submitLabel="Block" onSubmit={async () => {
      await complianceRequest('/customers/' + encodeURIComponent(dialog.row.customer_id) + '/block', { method: 'POST', body: JSON.stringify({}) });
      await load();
    }}><p><b>{dialog.row.customer.name}</b></p><p className="notice">{NexLuckI18n.t('This saves an internal blocked flag only. It does not prevent login, play or payments in external systems.')}</p></ComplianceForm>}
    {dialog?.type === 'statistics' && <SegmentParameters customer={dialog.row.customer} parameters={parameters} onClose={closeDialog} />}
    {dialog?.type === 'preview' && <SegmentDialog title={NexLuckI18n.t('Document preview')} wide onClose={closeDialog}>
      <p className="notice">{NexLuckI18n.t('Fictional demo document. Not valid identification.')}</p>
      <img className="compliance-preview" src="/coml/demo-document.svg" alt={NexLuckI18n.t('Fictional demo document. Not valid identification.')} />
    </SegmentDialog>}
  </>;
}

CRMContext.mount(() => ReactDOM.createRoot(document.getElementById('root')).render(<Compliance />));
