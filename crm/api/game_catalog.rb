# Uses CustomerStore's private directory and atomic JSON persistence.
module GameCatalog
  CURRENCIES = CustomerStore::CURRENCIES
  ATTRIBUTES = %w[jackpot free_spins desktop mobile].freeze
  PUBLISHERS = [
    ['pragmatic', 'Pragmatic Play', 'PP', '#9a5700'],
    ['playngo', "Play'n GO", 'PG', '#14638c'],
    ['netent', 'NetEnt', 'NE', '#26723d'],
    ['evolution', 'Evolution', 'EV', '#584593'],
    ['spribe', 'Spribe', 'SP', '#b73838']
  ].map { |id, name, mark, color| { 'id' => id, 'name' => name, 'mark' => mark, 'color' => color, 'logo' => "/crm/g/logos/#{id}.svg" }.freeze }.freeze
  GAME_FIELDS = %w[external_id name enabled segments tags category deposit_currencies rtp bonus_contribution multiplier variance attributes].freeze

  def initialize_game_catalog(games)
    @game_catalog = load_file('games.json') || {
      'categories' => %w[SLOTS TABLE_GAMES LIVE_CASINO CRASH].map { |name| { 'id' => name, 'name' => name.tr('_', ' ').split.map(&:capitalize).join(' ') } },
      'games' => games.each_with_index.map do |game, i|
        publisher = if game['category'] == 'LIVE_CASINO'
                      'evolution'
                    elsif game['category'] == 'CRASH'
                      'spribe'
                    elsif i < 2
                      'pragmatic'
                    elsif i == 2
                      'playngo'
                    else
                      'netent'
                    end
        game.merge('external_id' => game['id'], 'publisher_id' => publisher,
          'created_at' => "2026-09-#{format('%02d', i + 1)}T10:00:00Z", 'updated_at' => '2026-10-01T12:00:00Z',
          'enabled' => i % 5 != 4, 'segments' => ['REGISTERED'], 'tags' => i.even? ? ['popular'] : ['classic'],
          'rtp' => [96.5, 96.48, 96.21, 96.1][i % 4], 'deposit_currencies' => i.even? ? %w[EUR USD GBP] : %w[EUR CAD],
          'provider_bonus_contribution' => game['category'] == 'SLOTS' ? 100 : 10,
          'bonus_contribution' => i % 3 == 0 ? 5 : nil, 'multiplier' => [5000.0, 1000.5, 250.0][i % 3],
          'variance' => %w[low medium high][i % 3],
          'attributes' => %w[desktop mobile] + (game['category'] == 'SLOTS' ? ['free_spins'] : []) + (i == 3 ? ['jackpot'] : []))
      end
    }
    write_file('games.json', @game_catalog)
  end

  def catalog_games
    @game_catalog['games']
  end

  def game_categories
    @game_catalog['categories']
  end

  def save_game(id, body)
    original = catalog_games.find { |game| game['id'] == id }
    errors = {}
    (body.keys - GAME_FIELDS).each { |key| errors[key] = 'Unknown or read-only field' }
    clean = original.merge(body)
    %w[external_id name].each do |key|
      value = clean[key]
      errors[key] = 'Required text, up to 120 characters' unless value.is_a?(String) && !value.strip.empty? && value.length <= 120
      clean[key] = value.strip if value.is_a?(String)
    end
    if catalog_games.any? { |g| g['id'] != id && g['external_id'].casecmp(clean['external_id'].to_s).zero? }
      errors['external_id'] = 'External ID must be unique'
    end
    errors['enabled'] = 'Must be true or false' unless [true, false].include?(clean['enabled'])
    {
      'category' => game_categories.map { |c| c['id'] },
      'variance' => %w[low medium high]
    }.each { |key, values| errors[key] = 'Choose a supported value' unless values.include?(clean[key]) }
    { 'rtp' => [0, 100], 'bonus_contribution' => [0, 100], 'multiplier' => [0, 1_000_000_000] }.each do |key, (min, max)|
      value = clean[key]
      next if key == 'bonus_contribution' && value.nil?
      errors[key] = "Must be a finite number between #{min} and #{max}" unless value.is_a?(Numeric) && value.finite? && value.between?(min, max)
    end
    allowed_segments = segments.map { |s| s['name'] } + original['segments']
    { 'segments' => allowed_segments, 'deposit_currencies' => CURRENCIES, 'attributes' => ATTRIBUTES, 'tags' => nil }.each do |key, options|
      value = clean[key]
      valid = value.is_a?(Array) && value.length <= 100 && value.all? { |v| v.is_a?(String) && !v.strip.empty? && v.length <= 200 }
      valid &&= (value - options).empty? if options
      valid &&= !value.empty? if key == 'deposit_currencies'
      errors[key] = 'Choose valid values (at most 100); at least one deposit currency is required' unless valid
      clean[key] = value.uniq if valid
    end
    return [nil, errors] unless errors.empty?
    clean['updated_at'] = Time.now.utc.iso8601
    updated = @game_catalog.merge('games' => catalog_games.map { |g| g['id'] == id ? clean : g })
    write_file('games.json', updated)
    @game_catalog = updated
    [clean, {}]
  end

  def save_game_category(id, body)
    errors = {}
    (body.keys - ['name']).each { |key| errors[key] = 'Unknown or read-only field' }
    name = body['name']
    errors['name'] = 'Required text, up to 80 characters' unless name.is_a?(String) && !name.strip.empty? && name.length <= 80
    name = name.strip if name.is_a?(String)
    errors['name'] = 'Category name must be unique' if game_categories.any? { |c| c['id'] != id && c['name'].casecmp(name.to_s).zero? }
    return [nil, errors] unless errors.empty?
    id ||= "GC-#{SecureRandom.hex(6)}"
    saved = { 'id' => id, 'name' => name }
    categories = game_categories.any? { |c| c['id'] == id } ? game_categories.map { |c| c['id'] == id ? saved : c } : game_categories + [saved]
    updated = @game_catalog.merge('categories' => categories)
    write_file('games.json', updated)
    @game_catalog = updated
    [saved, {}]
  end
end
