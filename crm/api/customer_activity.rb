module CustomerActivity
  TAGS = %w[customer game finance loyalty bonus compliance segment].freeze

  def prepare_customer_activity
    return false unless ENV.fetch('CRM_UI_MODE', 'demo') == 'demo'
    logs = @state['customer_activity'] ||= {}
    changed = false
    list.each_with_index do |customer, index|
      next if logs.key?(customer['id'])
      logs[customer['id']] = demo_customer_activity(customer, index)
      changed = true
    end
    changed
  end

  def demo_customer_activity(customer, index)
    registered = Time.iso8601(customer['created_at'])
    finish = Time.now.utc - (index % 7) * 3600 - 60
    finish = [finish, registered + 60].max
    finish = [finish, Time.now.utc].min
    start = [registered, finish - (2 + index % 12) * 86400].max
    span = finish - start
    currency = customer['currency']
    amount = 100 + index * 25
    game = catalog_games[index % [catalog_games.length, 1].max]
    bonus = @state['bonuses'].reject { |item| item['deleted'] }[index % [@state['bonuses'].count { |item| !item['deleted'] }, 1].max]
    wallet = @state['finance']['wallets'].find { |item| item['customer_id'] == customer['id'] && item['type'] == 'Real' }
    bonus_wallet = @state['finance']['wallets'].find { |item| item['customer_id'] == customer['id'] && item['type'] == 'Bonus' }
    segment = segments[index % [segments.length, 1].max]
    tier = @state['loyalty']['tiers'].select { |item| item['minimum_points'] <= customer['loyalty_points'] && item['segment_ids'].empty? }.max_by { |item| item['minimum_points'] }
    events = [
      ['customer', 'Registration', { 'User name' => customer['name'] }],
      ['customer', 'Email confirmation', { 'Email' => "#{customer['id'].downcase}@example.invalid", 'User name' => customer['name'] }],
      ['customer', 'Sign in', { 'User name' => customer['name'] }],
      ['segment', 'Assign segment', { 'Segment name' => segment ? segment['name'] : 'Demo registered players' }],
      ['finance', 'Deposit', { 'Amount' => amount, 'Currency' => currency, 'Payment method' => index.even? ? 'Visa' : 'Bank transfer' }],
      ['compliance', 'KYC doc requested', { 'Document name' => 'Demo identity document' }],
      ['compliance', 'KYC doc approved', { 'Document name' => 'Demo identity document' }],
      ['game', 'Round start', { 'Game name' => game ? game['name'] : 'Demo slots', 'Game external ID' => game ? game.fetch('external_id', game['id']) : 'DEMO-GAME' }],
      ['game', 'Round end', { 'Game name' => game ? game['name'] : 'Demo slots', 'Game external ID' => game ? game.fetch('external_id', game['id']) : 'DEMO-GAME',
        'Total bets' => 10 + index, 'Wins' => 4 + index, 'Losses' => 6, 'Currency' => currency }],
      ['loyalty', 'Loyalty points', { 'LP' => customer['loyalty_points'] }],
      ['loyalty', 'Tier assigned', { 'Tier name' => tier ? tier['name'] : 'Unranked' }],
      ['customer', 'Sign in', { 'User name' => customer['name'] }],
      ['bonus', 'Bonus wager', { 'Bonus external ID' => bonus ? bonus['id'] : 'DEMO-BONUS', 'Bonus name' => bonus ? bonus['name'] : 'Demo welcome bonus', 'Wagered (%)' => 100 }],
      ['bonus', 'Transfer', { 'Amount' => 20 + index, 'Currency' => currency, 'Wallet from (bonus)' => bonus_wallet ? bonus_wallet['id'] : 'Demo bonus wallet', 'Wallet to (real)' => wallet ? wallet['id'] : 'Demo real wallet' }],
      ['finance', 'Cash out requested', { 'Amount' => 30 + index, 'Currency' => currency }],
      ['finance', 'Cashout approved', { 'Amount' => 30 + index, 'Currency' => currency }],
      ['segment', 'Removed from segment', { 'Segment name' => segment ? segment['name'] : 'Demo registered players' }]
    ]
    events.each_with_index.map do |(tag, type, details), event_index|
      time = event_index.zero? ? registered : start + span * event_index / (events.length - 1)
      { 'id' => owned_ids('EV'), 'casino_id' => @casino_id, 'customer_id' => customer['id'],
        'created_at' => time.utc.iso8601(3), 'user_name' => customer['name'], 'event_type' => type,
        'event_tag' => tag, 'session_id' => "DEMO-SESSION-#{customer['id']}-#{event_index < 11 ? 1 : 2}",
        'details' => details, 'demo' => true }
    end
  end

  def handle_customer_activity(req, res, customer_id)
    return json(res, 405, { error: 'GET required' }) unless req.request_method == 'GET'
    return json(res, 404, { error: 'Customer not found' }) unless find(customer_id)
    query = URI.decode_www_form(req.query_string.to_s).to_h
    errors = {}
    (query.keys - %w[from to tag offset limit]).each { |key| errors[key] = 'Unknown filter' }
    %w[from to].each do |key|
      next if query[key].to_s.empty?
      begin
        date = Date.iso8601(query[key])
        errors[key] = 'Use YYYY-MM-DD' unless date.iso8601 == query[key]
      rescue ArgumentError
        errors[key] = 'Use YYYY-MM-DD'
      end
    end
    errors['tag'] = 'Choose a supported event tag' if query['tag'] && !query['tag'].empty? && !TAGS.include?(query['tag'])
    errors['from'] = 'Start date must not be after end date' if errors.empty? && !query['from'].to_s.empty? && !query['to'].to_s.empty? && query['from'] > query['to']
    %w[offset limit].each do |key|
      errors[key] = 'Supply a nonnegative integer (limit 1 to 100)' if query[key] && (!query[key].match?(/\A\d{1,8}\z/) || (key == 'limit' && !query[key].to_i.between?(1, 100)))
    end
    return json(res, 422, { error: 'Validation failed', fields: errors }) unless errors.empty?
    offset = query.fetch('offset', '0').to_i
    limit = query.fetch('limit', '10').to_i
    rows = @state.fetch('customer_activity', {}).fetch(customer_id, []).select do |event|
      day = event['created_at'][0, 10]
      (query['tag'].to_s.empty? || event['event_tag'] == query['tag']) &&
        (query['from'].to_s.empty? || day >= query['from']) && (query['to'].to_s.empty? || day <= query['to'])
    end.sort_by { |event| [event['created_at'], event['id']] }.reverse
    json(res, 200, { items: rows.slice(offset, limit) || [], total: rows.length, offset: offset,
      limit: limit, tags: TAGS, demo: ENV.fetch('CRM_UI_MODE', 'demo') == 'demo' })
  end
end
