(function (root) {
  root.createSegmentSelection = function (React) {
    const h = React.createElement;
    return function SegmentSelection({ entries, selected, onSelect, checkbox = true, renderDetails, renderActions }) {
      return h('div', { className: 'segment-library' }, entries.map(segment =>
        h('div', {
          className: 'segment-library-item' + (selected.includes(segment.id) ? ' selected' : ''),
          key: segment.id, tabIndex: 0, 'aria-label': 'Select segment ' + segment.name,
          onDoubleClick: e => { if (!e.target.closest('button,input')) onSelect(segment); },
          onKeyDown: e => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault(); onSelect(segment);
            }
          }
        }, h('div', null,
          h(checkbox ? 'label' : 'div', { className: 'segment-choice' },
            checkbox && h('input', { type: 'checkbox', checked: selected.includes(segment.id), onChange: () => onSelect(segment) }),
            h('span', { className: 'segment-tags' }, h('span', { className: 'segment-tag', title: segment.name }, segment.name))),
          renderDetails?.(segment)), renderActions?.(segment))));
    };
  };
})(globalThis);
