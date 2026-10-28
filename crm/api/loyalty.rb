module LoyaltyStore
  MAX_POINTS = 9_007_199_254_740_991
  TIER_FIELDS = %w[name minimum_points game_weight eur_per_point segment_ids bonus_ids cashback rakeback].freeze

  def self.prepare(state, casino_id)
    changed = false
    state['profiles'].each_value do |profile|
      next if profile.key?('loyalty_points')
      profile['loyalty_points'] = 0
      changed = true
    end
    unless state.key?('loyalty')
      state['loyalty'] = { 'tiers' => %w[Bronze Silver Gold].each_with_index.map do |name, index|
        { 'id' => "LT-#{SecureRandom.hex(8)}", 'casino_id' => casino_id, 'name' => name,
          'minimum_points' => [1000, 5000, 10_000][index], 'game_weight' => 1,
          'eur_per_point' => 10, 'segment_ids' => [], 'bonus_ids' => [], 'cashback' => 15, 'rakeback' => 10 }
      end }
      changed = true
    end
    changed
  end

  def handle_loyalty(req, res, rest)
    match = rest.match(%r{\Aloyalty(?:/tiers(?:/(LT-[\w-]+))?)?\z})
    return json(res, 404, { error: 'Not found' }) unless match
    id = match[1]
    tiers = @state.fetch('loyalty').fetch('tiers')
    if rest == 'loyalty' && req.request_method == 'GET'
      return json(res, 200, { tiers: tiers.sort_by { |tier| tier['minimum_points'] },
        bonus_options: @state['bonuses'].reject { |bonus| bonus['deleted'] }.map { |bonus| bonus.slice('id', 'name') } })
    end
    allowed = id ? %w[PATCH DELETE] : (rest == 'loyalty/tiers' ? ['POST'] : [])
    return json(res, 405, { error: 'Method not allowed' }) unless allowed.include?(req.request_method)
    tier = tiers.find { |item| item['id'] == id } if id
    return json(res, 404, { error: 'Tier not found' }) if id && !tier
    if req.request_method == 'DELETE'
      tiers.delete(tier)
      return json(res, 200, { deleted: id })
    end
    return json(res, 413, { error: 'Loyalty request exceeds 64 KiB' }) if req.body.to_s.bytesize > 65_536
    body = read_json(req, res)
    return unless body
    errors = {}
    (body.keys - TIER_FIELDS).each { |key| errors[key] = 'Unknown or read-only field' }
    clean = (tier || {}).slice(*TIER_FIELDS).merge(body.slice(*TIER_FIELDS))
    name = clean['name']
    errors['name'] = 'Supply a name of 1 to 100 characters' unless name.is_a?(String) && name.strip.length.between?(1, 100) && !name.match?(/[\x00-\x1f]/)
    if name.is_a?(String) && tiers.any? { |item| item['id'] != id && item['name'].casecmp(name.strip).zero? }
      errors['name'] = 'Tier name is already in use'
    end
    points = clean['minimum_points']
    errors['minimum_points'] = 'Supply a nonnegative safe integer LP threshold' unless points.is_a?(Integer) && points.between?(0, MAX_POINTS)
    if tiers.any? { |item| item['id'] != id && item['minimum_points'] == points }
      errors['minimum_points'] = 'Each tier must have a different LP threshold'
    end
    %w[game_weight eur_per_point cashback rakeback].each do |key|
      value = clean[key]
      valid = value.is_a?(Numeric) && value.finite?
      valid &&= %w[cashback rakeback].include?(key) ? value.between?(0, 100) : value > 0 && value <= 1_000_000
      errors[key] = %w[cashback rakeback].include?(key) ? 'Supply a percentage from 0 to 100' : 'Supply a positive number up to 1000000' unless valid
    end
    { 'segment_ids' => @segments.keys, 'bonus_ids' => @state['bonuses'].reject { |bonus| bonus['deleted'] }.map { |bonus| bonus['id'] } }.each do |key, available|
      values = clean[key]
      errors[key] = 'Select unique items belonging to this casino' unless values.is_a?(Array) && values.length <= 1000 && values.all? { |value| value.is_a?(String) } && values.uniq == values && (values - available).empty?
    end
    return json(res, 422, { error: 'Validation failed', fields: errors }) unless errors.empty?
    clean['name'] = name.strip
    now = Time.now.utc.iso8601
    saved = clean.merge('id' => id || owned_ids('LT'), 'casino_id' => @casino_id,
      'created_at' => tier && tier['created_at'] || now, 'updated_at' => now)
    tier ? tiers[tiers.index(tier)] = saved : tiers << saved
    json(res, tier ? 200 : 201, saved)
  end
end
