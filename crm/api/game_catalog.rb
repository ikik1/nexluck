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
  GAME_FIELDS = %w[external_id name enabled segments tags category category_ids deposit_currencies rtp bonus_contribution multiplier variance attributes].freeze
  CATEGORY_FIELDS = %w[name cms_identifier game_ids segments tags sort_mode copy_provider_ids copy_category_ids].freeze
  CATEGORY_SORTS = %w[manual popularity new most_played].freeze
  DEMO_CATEGORIES = [
    ['GC-ADVENTURE', 'Adventure'], ['GC-MYTHOLOGY', 'Mythology'],
    ['GC-TREASURES', 'Treasures'], ['GC-SPACE', 'Space'],
    ['GC-OCEAN', 'Ocean'], ['GC-WILDLIFE', 'Wildlife'],
    ['GC-FANTASY', 'Fantasy'], ['GC-FRUITS', 'Fruits'],
    ['GC-GEMS', 'Gems'], ['GC-MYSTERY', 'Mystery'],
    ['GC-CLASSICS', 'Classics'], ['GC-JACKPOTS', 'Jackpots'],
    ['GC-MEGWAYS', 'Megaways'], ['GC-BONUS-BUY', 'Bonus Buy']
  ].freeze

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
    @game_catalog['games'].each_with_index do |game, i|
      game['popularity'] ||= (37 + i * 17) % 101
      game['play_count'] ||= 1200 + ((i * 7919) % 80000)
      game['statistics_source'] = 'demo'
    end
    game_categories.each do |category|
      category['cms_identifier'] ||= category['id'].downcase.tr('_', '-')
      category['kind'] ||= 'static'
      category['game_ids'] ||= @game_catalog['games'].select { |g| g['category'] == category['id'] }.map { |g| g['id'] }
      category['segments'] ||= []
      category['tags'] ||= []
      category['sort_mode'] ||= 'manual'
    end
    [['GC-RECENT', 'Recent games', 'recent'], ['GC-FAVOURITES', 'Favourite games', 'favourites']].each do |id, name, kind|
      next if game_categories.any? { |c| c['id'] == id }
      game_categories << { 'id' => id, 'name' => name, 'cms_identifier' => kind + '-games',
        'kind' => 'dynamic', 'dynamic_kind' => kind, 'game_ids' => [], 'segments' => [], 'tags' => [], 'sort_mode' => 'manual' }
    end
    unless @game_catalog['demo_expansion_version'] == 1
      DEMO_CATEGORIES.each do |id, name|
        next if game_categories.any? { |c| c['id'] == id || c['name'].casecmp(name).zero? || c['cms_identifier'] == name.downcase.tr(' ', '-') }
        game_categories << { 'id' => id, 'name' => name, 'cms_identifier' => name.downcase.tr(' ', '-'),
          'kind' => 'static', 'game_ids' => [], 'segments' => [], 'tags' => [], 'sort_mode' => 'manual' }
      end
      themes = %w[Amber Aurora Coral Crystal Desert Emerald Lunar Mystic Ocean Sapphire Velvet]
      titles = %w[Quest Odyssey Fortune Kingdom Secrets Voyage Legends Riches]
      themes.product(titles).each_with_index do |(theme, title), i|
        name = "#{theme} #{title}"
        id = 'demo-' + name.downcase.tr(' ', '-')
        next if @game_catalog['games'].any? { |g| g['id'] == id || g['external_id'] == id || g['name'].casecmp(name).zero? }
        category_id, category_name = DEMO_CATEGORIES[i % DEMO_CATEGORIES.length]
        category = game_categories.find { |c| c['id'] == category_id || c['name'].casecmp(category_name).zero? || c['cms_identifier'] == category_name.downcase.tr(' ', '-') }
        game = {
          'id' => id, 'external_id' => id, 'name' => name, 'category' => category['id'],
          'publisher_id' => %w[netent playngo evolution][i % 3],
          'created_at' => (Time.utc(2026, 8, 1) + i * 86400).iso8601, 'updated_at' => '2026-10-19T12:00:00Z',
          'enabled' => i % 7 != 0, 'segments' => ['REGISTERED'], 'tags' => ['demo', i.even? ? 'popular' : 'classic'],
          'rtp' => [96.5, 96.2, 95.8, 97.1][i % 4], 'deposit_currencies' => i.even? ? %w[EUR USD GBP] : %w[EUR CAD],
          'provider_bonus_contribution' => 100, 'bonus_contribution' => nil,
          'multiplier' => [250.0, 1000.5, 5000.0][i % 3], 'variance' => %w[low medium high][i % 3],
          'attributes' => %w[desktop mobile free_spins] + (i % 11 == 0 ? ['jackpot'] : []),
          'popularity' => (43 + i * 19) % 101, 'play_count' => 500 + (i * 3571) % 150000, 'statistics_source' => 'demo'
        }
        @game_catalog['games'] << game
        category['game_ids'] << id
      end
      game_categories.each { |c| c['game_ids'] = sort_category_games(c['game_ids'], c['sort_mode']) }
      @game_catalog['demo_expansion_version'] = 1
    end
    unless @game_catalog['demo_category_metadata_version'] == 1
      seeded_ids = %w[SLOTS TABLE_GAMES LIVE_CASINO CRASH GC-RECENT GC-FAVOURITES] + DEMO_CATEGORIES.map(&:first)
      available_segments = segments.map { |s| s['name'] }
      game_categories.select { |c| seeded_ids.include?(c['id']) }.each_with_index do |category, i|
        if category['segments'].empty?
          names = i.even? ? %w[REGISTERED] : %w[REGISTERED VIP]
          category['segments'] = names.select { |name| available_segments.include?(name) }
        end
        category['tags'] = [category['kind'] == 'dynamic' ? 'personalized' : i.even? ? 'popular' : 'classic'] if category['tags'].empty?
      end
      @game_catalog['demo_category_metadata_version'] = 1
    end
    write_file('games.json', @game_catalog)
  end

  def catalog_games
    @game_catalog['games'].map do |game|
      ids = game_categories.select { |c| c['kind'] == 'static' && c['game_ids'].include?(game['id']) }.map { |c| c['id'] }
      primary = ids.include?(game['category']) ? game['category'] : ids.first.to_s
      game.merge('category_ids' => ids, 'category' => primary)
    end
  end

  def game_categories
    @game_catalog['categories']
  end

  def publisher_catalog
    PUBLISHERS
  end

  def currency_codes
    CURRENCIES
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
    static_ids = game_categories.select { |c| c['kind'] == 'static' }.map { |c| c['id'] }
    category_ids = body.key?('category_ids') ? body['category_ids'] : body.key?('category') ? [body['category']] : original['category_ids']
    valid_categories = category_ids.is_a?(Array) && category_ids.length <= 100 && (category_ids - static_ids).empty?
    errors['category_ids'] = 'Choose static categories (at most 100)' unless valid_categories
    if body.key?('category') && (!static_ids.include?(body['category']) || (valid_categories && !category_ids.include?(body['category'])))
      errors['category'] = 'Choose a static category included in category_ids'
    end
    errors['variance'] = 'Choose a supported value' unless %w[low medium high].include?(clean['variance'])
    { 'rtp' => [0, 100], 'bonus_contribution' => [0, 100], 'multiplier' => [0, 1_000_000_000] }.each do |key, (min, max)|
      value = clean[key]
      next if key == 'bonus_contribution' && value.nil?
      errors[key] = "Must be a finite number between #{min} and #{max}" unless value.is_a?(Numeric) && value.finite? && value.between?(min, max)
    end
    allowed_segments = segments.map { |s| s['name'] } + original['segments']
    { 'segments' => allowed_segments, 'deposit_currencies' => currency_codes, 'attributes' => ATTRIBUTES, 'tags' => nil }.each do |key, options|
      value = clean[key]
      valid = value.is_a?(Array) && value.length <= 100 && value.all? { |v| v.is_a?(String) && !v.strip.empty? && v.length <= 200 }
      valid &&= (value - options).empty? if options
      valid &&= !value.empty? if key == 'deposit_currencies'
      errors[key] = 'Choose valid values (at most 100); at least one deposit currency is required' unless valid
      clean[key] = value.uniq if valid
    end
    return [nil, errors] unless errors.empty?
    clean.delete('category_ids')
    clean['category'] = category_ids.first.to_s
    clean['updated_at'] = Time.now.utc.iso8601
    categories = game_categories.map do |category|
      ids = category['game_ids']
      ids = category_ids.include?(category['id']) ? (ids + [id]).uniq : ids - [id]
      category.merge('game_ids' => sort_category_games(ids, category['sort_mode'], clean))
    end
    updated = @game_catalog.merge('games' => @game_catalog['games'].map { |g| g['id'] == id ? clean : g }, 'categories' => categories)
    write_file('games.json', updated)
    @game_catalog = updated
    [catalog_games.find { |g| g['id'] == id }, {}]
  end

  def save_game_category(id, body)
    errors = {}
    original = game_categories.find { |c| c['id'] == id } || {
      'kind' => 'static', 'game_ids' => [], 'segments' => [], 'tags' => [], 'sort_mode' => 'manual'
    }
    (body.keys - CATEGORY_FIELDS).each { |key| errors[key] = 'Unknown or read-only field' }
    clean = original.merge(body.reject { |key, _| key.start_with?('copy_') })
    name = clean['name']
    errors['name'] = 'Required text, up to 80 characters' unless name.is_a?(String) && !name.strip.empty? && name.length <= 80
    name = name.strip if name.is_a?(String)
    errors['name'] = 'Category name must be unique' if game_categories.any? { |c| c['id'] != id && c['name'].casecmp(name.to_s).zero? }
    cms = clean['cms_identifier'] || name.to_s.downcase.gsub(/[^a-z0-9]+/, '-').sub(/-\z/, '')
    errors['cms_identifier'] = 'Use 1-80 lowercase letters, digits, hyphens or underscores, starting with a letter' unless cms.is_a?(String) && cms.match?(/\A[a-z][a-z0-9_-]{0,79}\z/)
    errors['cms_identifier'] = 'CMS identifier must be unique' if game_categories.any? { |c| c['id'] != id && c['cms_identifier'] == cms }
    options = {
      'game_ids' => @game_catalog['games'].map { |g| g['id'] },
      'copy_provider_ids' => publisher_catalog.map { |p| p['id'] },
      'copy_category_ids' => game_categories.select { |c| c['kind'] == 'static' && c['id'] != id }.map { |c| c['id'] },
      'segments' => (segments.map { |s| s['name'] } + original['segments']),
      'tags' => nil
    }
    options.each do |key, allowed|
      value = key.start_with?('copy_') ? body.fetch(key, []) : clean[key]
      limit = key == 'game_ids' ? @game_catalog['games'].length : 100
      valid = value.is_a?(Array) && value.length <= limit && value.all? { |v| v.is_a?(String) && !v.strip.empty? && v.length <= 200 }
      valid &&= (value - allowed).empty? if allowed
      errors[key] = 'Choose valid values' unless valid
    end
    errors['sort_mode'] = 'Choose manual, popularity, new or most_played' unless CATEGORY_SORTS.include?(clean['sort_mode'])
    if original['kind'] == 'dynamic' && (clean['game_ids'] != [] || clean['sort_mode'] != 'manual' ||
        body.fetch('copy_provider_ids', []) != [] || body.fetch('copy_category_ids', []) != [])
      errors['game_ids'] = 'Dynamic categories resolve per customer and cannot contain fixed games or sorting'
    end
    return [nil, errors] unless errors.empty?
    id ||= "GC-#{SecureRandom.hex(6)}"
    ids = clean['game_ids'] + @game_catalog['games'].select { |g| body.fetch('copy_provider_ids', []).include?(g['publisher_id']) }.map { |g| g['id'] }
    game_categories.each { |c| ids += c['game_ids'] if body.fetch('copy_category_ids', []).include?(c['id']) }
    saved = clean.merge('id' => id, 'name' => name, 'cms_identifier' => cms,
      'game_ids' => sort_category_games(ids.uniq, clean['sort_mode']), 'segments' => clean['segments'].uniq, 'tags' => clean['tags'].uniq)
    categories = game_categories.any? { |c| c['id'] == id } ? game_categories.map { |c| c['id'] == id ? saved : c } : game_categories + [saved]
    updated = @game_catalog.merge('categories' => categories)
    write_file('games.json', updated)
    @game_catalog = updated
    [saved, {}]
  end

  def sort_category_games(ids, mode, replacement = nil)
    return ids if mode == 'manual'
    games = @game_catalog['games'].map { |g| replacement && g['id'] == replacement['id'] ? replacement : g }
    by_id = games.each_with_object({}) { |g, all| all[g['id']] = g }
    ids.sort_by do |id|
      game = by_id.fetch(id)
      score = case mode
              when 'popularity' then game['popularity']
              when 'most_played' then game['play_count']
              when 'new' then Time.iso8601(game['created_at']).to_f
              end
      [-score, game['name'].downcase, id]
    end
  end
end
