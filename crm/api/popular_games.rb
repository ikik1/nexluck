module PopularGames
  COUNTRY_NAMES = {
    'PL' => 'Poland', 'BR' => 'Brazil', 'GB' => 'United Kingdom', 'US' => 'United States',
    'DE' => 'Germany', 'FR' => 'France', 'ES' => 'Spain', 'NL' => 'Netherlands',
    'CA' => 'Canada', 'PT' => 'Portugal', 'RU' => 'Russia', 'IT' => 'Italy'
  }.freeze
  def handle_popular_games(req, res, rest)
    return json(res, 503, { error: 'Demo rankings are disabled outside CRM demo mode' }) unless ENV.fetch('CRM_UI_MODE', 'demo') == 'demo'
    query = URI.decode_www_form(req.query_string.to_s).to_h
    player = query['player'].to_s
    country = query.fetch('country', 'WORLD')
    return json(res, 422, { error: 'Invalid demo player' }) unless player.empty? || player.match?(/\Ademo-[a-zA-Z0-9-]{1,80}\z/)
    countries = @state['catalogs']['countries']
    return json(res, 422, { error: 'Unknown country' }) unless country == 'WORLD' || countries.any? { |c| c['code'] == country }
    if rest == 'games/ranking'
      return json(res, 405, { error: 'GET required' }) unless req.request_method == 'GET'
      mode = query.fetch('mode', 'geo')
      minutes = query.fetch('minutes', '60')
      return json(res, 422, { error: 'Invalid ranking parameters' }) unless %w[geo personal].include?(mode) && minutes.match?(/\A[1-9]\d{0,6}\z/) && minutes.to_i <= 525600
      seed = Digest::SHA256.hexdigest([@casino_id, country, mode, player].join(':')).to_i(16)
      games = catalog_games.select { |g| g['enabled'] }
      games = games.sort_by { |g| [-g.fetch('popularity', 0), g['id']] }
      games = games.rotate(seed % games.length) unless games.empty?
      return json(res, 200, {
        items: games.map { |g| { gameId: g['id'] } }, total: games.length,
        metric: 'bet_volume', country: country,
        countryName: country == 'WORLD' ? nil : COUNTRY_NAMES.fetch(country, country),
        period: { minutes: minutes.to_i, live: minutes.to_i <= 60 },
        updatedAt: Time.now.utc.iso8601, personalized: mode == 'personal' && !player.empty?,
        demo: true
      })
    end
    return json(res, 422, { error: 'Choose a demo player' }) if player.empty?
    favourites = (@state['demo_game_favourites'] ||= {})
    ids = favourites.fetch(player, [])
    if req.request_method == 'POST'
      body = read_json(req, res)
      return unless body
      return json(res, 422, { error: 'Supply gameId and favourite boolean' }) unless (body.keys - %w[gameId favourite]).empty? && [true, false].include?(body['favourite']) && catalog_games.any? { |g| g['id'] == body['gameId'] && g['enabled'] }
      ids = ids.reject { |id| id == body['gameId'] }
      ids << body['gameId'] if body['favourite']
      favourites[player] = ids
    elsif req.request_method != 'GET'
      return json(res, 405, { error: 'GET or POST required' })
    end
    json(res, 200, { items: ids.map { |id| { gameId: id } }, total: ids.length, demo: true })
  end
end
