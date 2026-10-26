(function (root) {
  const t = (source, params) => (root.NexLuckI18n ? root.NexLuckI18n.t(source, params) : source);
  const technicalName = segment => (segment && (segment.original_name || segment.name)) || '';
  const friendlyName = segment => {
    if (!segment) return '';
    const tag = typeof segment.tag_name === 'string' ? segment.tag_name.trim() : '';
    if (!tag) return segment.name || '';
    // Reporting mode decorates `name` with an owner-casino suffix after `original_name`.
    const suffix = segment.original_name && segment.name && segment.name.startsWith(segment.original_name) ? segment.name.slice(segment.original_name.length) : '';
    return tag + suffix;
  };
  const isRisk = segment => /^risk_/i.test(technicalName(segment));
  const riskScore = segment => {
    const score = Math.round(Number(segment && segment.risk_score));
    return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
  };
  const riskLevel = score => score > 60 ? 'high' : score > 40 ? 'medium' : 'low';
  const find = (segments, name) => {
    if (!Array.isArray(segments) || name == null) return null;
    const key = String(name);
    return segments.find(s => s.name === key || s.original_name === key) ||
      segments.find(s => technicalName(s).toLowerCase() === key.toLowerCase()) || null;
  };
  // Accepts a segment object, or a stored canonical name plus an optional segment list for lookup.
  const describe = (segmentOrName, segments) => {
    const segment = typeof segmentOrName === 'string' ? find(segments, segmentOrName) || { name: segmentOrName } : segmentOrName || { name: '' };
    const name = segment.name || '';
    const label = friendlyName(segment) || name;
    let title = name;
    let className = '';
    let level = null;
    let score = null;
    if (isRisk(segment)) {
      score = riskScore(segment);
      level = riskLevel(score);
      className = ' segment-risk segment-risk-' + level;
      title = name + ' · ' + t('Risk score') + ': ' + score + '/100 (' + t(level) + ')';
    }
    return { segment, name, label, title, className, risk: level, score };
  };

  const listeners = new Set();
  let catalog = [];
  let pending = null;
  const setCatalog = segments => {
    catalog = Array.isArray(segments) ? segments : [];
    listeners.forEach(listener => listener(catalog));
  };
  const loadCatalog = () => {
    if (!pending && root.CRMContext) {
      pending = root.CRMContext.fetch('/crm/ui-api/v1/segments')
        .then(response => response.ok ? response.json() : { items: [] })
        .then(body => { if (!catalog.length) setCatalog(body.items || []); return catalog; })
        .catch(() => catalog);
    }
    return pending || Promise.resolve(catalog);
  };
  const useCatalog = React => {
    const [segments, setSegments] = React.useState(catalog);
    React.useEffect(() => {
      listeners.add(setSegments);
      setSegments(catalog);
      loadCatalog();
      return () => { listeners.delete(setSegments); };
    }, []);
    return segments;
  };

  const createSegmentTag = React => {
    const h = React.createElement;
    return function SegmentTag({ segment, segments, as = 'span', className = 'segment-tag', onRemove, removeLabel, labelPrefix, title, children, ...rest }) {
      const info = describe(segment, segments);
      return h(as, { className: className + info.className, title: title ? title + ' — ' + info.title : info.title, 'data-segment': info.name,
        ...(labelPrefix ? { 'aria-label': labelPrefix + info.label } : {}), ...rest },
        info.label,
        onRemove && h('button', { type: 'button', 'aria-label': (removeLabel || t('Remove segment ')) + info.label, onClick: () => onRemove(info.segment) }, '×'),
        children);
    };
  };

  root.NexLuckSegmentTags = { technicalName, friendlyName, isRisk, riskScore, riskLevel, find, describe, setCatalog, loadCatalog, useCatalog, createSegmentTag };

  root.createSegmentSelection = function (React) {
    const h = React.createElement;
    const SegmentTag = createSegmentTag(React);
    return function SegmentSelection({ entries, selected, onSelect, checkbox = true, renderDetails, renderActions }) {
      return h('div', { className: 'segment-library' }, entries.map(segment =>
        h('div', {
          className: 'segment-library-item' + (selected.includes(segment.id) ? ' selected' : ''),
          key: segment.id, tabIndex: 0, 'aria-label': t("Select segment ") + friendlyName(segment),
          onDoubleClick: e => { if (!e.target.closest('button,input')) onSelect(segment); },
          onKeyDown: e => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault(); onSelect(segment);
            }
          }
        }, h('div', null,
          h(checkbox ? 'label' : 'div', { className: 'segment-choice' },
            checkbox && h('input', { type: 'checkbox', checked: selected.includes(segment.id), onChange: () => onSelect(segment) }),
            h('span', { className: 'segment-tags' }, h(SegmentTag, { segment }))),
          renderDetails?.(segment)), renderActions?.(segment))));
    };
  };
})(globalThis);
