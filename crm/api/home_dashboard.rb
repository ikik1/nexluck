module HomeDashboard
  def self.seed(casino_id)
    random = Random.new(Digest::SHA256.hexdigest(casino_id).to_i(16))
    players = random.rand(18_000..160_000)
    active = (players * random.rand(0.10..0.22)).round
    ggr = random.rand(120_000..850_000)
    ngr = (ggr * random.rand(0.72..0.88)).round
    integer = ->(number) { number.to_s.reverse.gsub(/(\d{3})(?=\d)/, '\1,').reverse }
    money = ->(number) { "EUR #{integer.call(number)}" }
    block = lambda do |value, label, metrics|
      { 'value' => value, 'label' => label,
        'metrics' => metrics.map { |name, amount, tone| { 'label' => name, 'value' => amount, 'tone' => tone || '' } } }
    end
    {
      'casino_id' => casino_id, 'source' => 'synthetic_demo', 'version' => 1,
      'sections' => {
        'analytics' => block.call(money.call(ggr), 'Demo GGR (7d)', [
          ['NGR', money.call(ngr), 'up'], ['Active players', integer.call(active), 'up'],
          ['ARPU', money.call((ggr.to_f / active).round), 'up'], ['Retention D30', "#{random.rand(16..32)}.#{random.rand(0..9)}%", 'down']
        ]),
        'customers' => block.call(integer.call(players), 'Demo total players', [
          ['New (7d)', integer.call(random.rand(250..2200)), 'up'], ['VIP', integer.call((players * 0.007).round)],
          ['Pending KYC', random.rand(20..160).to_s, 'down'], ['Self-excluded', random.rand(50..400).to_s]
        ]),
        'games' => block.call(integer.call(random.rand(850..4200)), 'Demo games live', [
          ['Providers', random.rand(20..65).to_s], ['Avg RTP', "#{random.rand(95..97)}.#{random.rand(0..9)}%"],
          ['Top game', ['Gates of Olympus', 'Sweet Bonanza', 'Book of Dead', 'Aviator'][random.rand(4)]],
          ['New this month', random.rand(12..80).to_s, 'up']
        ]),
        'bonuses' => block.call(random.rand(8..36).to_s, 'Demo active campaigns', [
          ['Bonus cost (7d)', money.call((ggr * 0.12).round), 'down'],
          ['Redemption rate', "#{random.rand(25..48)}%", 'up'], ['Wagering done', "#{random.rand(45..75)}%"],
          ['Abuse flags', random.rand(2..15).to_s, 'down']
        ]),
        'loyalty' => block.call(integer.call((players * 0.11).round), 'Demo club members', [
          ['Diamond tier', random.rand(40..200).to_s], ['Points issued', integer.call(random.rand(1_000_000..5_000_000)), 'up'],
          ['Redeemed', integer.call(random.rand(300_000..1_200_000))], ['Churn risk VIPs', random.rand(8..35).to_s, 'down']
        ]),
        'finance' => block.call(money.call(ggr * 3), 'Demo deposits (7d)', [
          ['Withdrawals', money.call(ggr * 2), 'down'], ['Pending payouts', random.rand(12..95).to_s],
          ['Chargebacks', "0.#{random.rand(1..8)}%", 'up'], ['PSP success rate', "#{random.rand(92..98)}.#{random.rand(0..9)}%", 'up']
        ]),
        'compliance' => block.call(random.rand(20..160).to_s, 'Demo KYC queue', [
          ['AML alerts', random.rand(5..25).to_s, 'down'], ['SAR filed (30d)', random.rand(1..6).to_s],
          ['RG interventions', random.rand(15..65).to_s], ['Reports due', random.rand(1..5).to_s, 'down']
        ]),
        'audit' => block.call(integer.call(random.rand(800..4000)), 'Demo events (24h)', [
          ['Admin logins', random.rand(30..130).to_s], ['Permission changes', random.rand(1..8).to_s],
          ['Failed logins', random.rand(5..25).to_s, 'down'], ['Last export', 'Demo snapshot']
        ])
      }
    }
  end

  def self.payload(snapshot, casinos)
    enabled = casinos.count { |site| site['enabled'] }
    registry = {
      'value' => casinos.length.to_s, 'label' => 'Global casino registry',
      'metrics' => [
        { 'label' => 'Enabled', 'value' => enabled.to_s, 'tone' => '' },
        { 'label' => 'Disabled', 'value' => (casinos.length - enabled).to_s, 'tone' => '' },
        { 'label' => 'Themes', 'value' => casinos.map { |site| site['theme'] }.uniq.length.to_s, 'tone' => '' },
        { 'label' => 'Scope', 'value' => 'All permitted casinos', 'tone' => '' }
      ]
    }
    snapshot.merge('sections' => snapshot.fetch('sections').merge('casinos' => registry))
  end
end
