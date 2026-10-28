(function () {
  'use strict';
  function status(customer, tiers, segments, parameters, now = Date.now()) {
    const membership = customerSegmentIds(customer, segments, parameters, now);
    const ordered = [...tiers].sort((a, b) => a.minimum_points - b.minimum_points);
    const matches = tier => tier.segment_ids.every(id => membership.includes(id));
    const current = ordered.filter(tier => customer.loyalty_points >= tier.minimum_points && matches(tier)).pop() || null;
    const next = ordered.find(tier => !current || tier.minimum_points > current.minimum_points) || null;
    const start = current ? current.minimum_points : 0;
    const progress = next ? customer.loyalty_points >= next.minimum_points ? 100 : Math.max(0, (customer.loyalty_points - start) / Math.max(1, next.minimum_points - start) * 100) : current ? 100 : 0;
    return { current, next, progress, remaining: next ? Math.max(0, next.minimum_points - customer.loyalty_points) : 0,
      missingSegments: next ? next.segment_ids.filter(id => !membership.includes(id)) : [] };
  }

  function breakdown(customers, tiers, segments, parameters, from, to, now = Date.now()) {
    const active = new Set(WALLET_TX.filter(tx => tx.type === 'Bet' && tx.ts >= from && tx.ts <= to && tx.ts <= now)
      .map(tx => WALLETS.find(wallet => wallet.id === tx.wallet)?.customer_id).filter(Boolean));
    const counts = Object.fromEntries(tiers.map(tier => [tier.id, 0]));
    let unranked = 0;
    customers.filter(customer => active.has(customer.id)).forEach(customer => {
      const current = status(customer, tiers, segments, parameters, now).current;
      if (current) counts[current.id] += 1;
      else unranked += 1;
    });
    return { counts, unranked, total: Object.values(counts).reduce((sum, count) => sum + count, unranked) };
  }
  window.NexLuckLoyalty = { status, breakdown };
})();
