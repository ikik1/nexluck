require 'digest'
require_relative 'home_dashboard'
require_relative 'compliance'

# One atomic snapshot contains the registry, tenants, migration and operation keys.
# The file lock also serializes independent Ruby processes sharing the store.
class CasinoContext
  class InvalidReference < StandardError; end
  GROUPS = %w[segments games catalogs payment_connections].freeze
  FILE_KEYS = {
    'profiles.json' => 'profiles', 'credentials.json' => 'credentials',
    'segments.json' => 'segments', 'games.json' => 'games',
    'casino_websites.json' => 'casinos'
  }.freeze

  class Tenant < CustomerStore
    include ComplianceStore
    attr_reader :state, :casino_id

    def initialize(state, casino_id, casinos)
      @state, @casino_id, @casino_websites = state, casino_id, casinos
      @profiles = state.fetch('profiles')
      @credentials = state.fetch('credentials')
      @segments = state.fetch('segments')
      @game_catalog = state.fetch('games')
    end

    def write_file(name, value)
      @state[FILE_KEYS.fetch(name)] = value
    end

    def publishers
      @state.fetch('catalogs').fetch('providers')
    end

    alias publisher_catalog publishers

    def currency_codes
      @state['catalogs']['currencies'].map { |record| record['code'] }
    end

    def profile_options
      OPTIONS.merge('country' => @state['catalogs']['countries'].map { |r| r['code'] },
        'currency' => currency_codes, 'lang' => @state['catalogs']['languages'].map { |r| r['code'] })
    end

    def owned_ids(prefix)
      "#{prefix}-#{SecureRandom.random_number(9_000_000_000_000_000) + 1_000_000_000_000_000}"
    end

    def save_segment(id, body)
      return [nil, { 'id' => 'Segment not found' }] if id && !segment(id)
      clean, errors = CustomerSegments.validate(body, parameters)
      return [nil, errors] unless errors.empty?
      clean['tag_name'] = @segments.dig(id, 'tag_name') if id && !body.key?('tag_name') && @segments.dig(id, 'tag_name')
      check = lambda do |node|
        if node['kind'] == 'group'
          node['children'].each { |child| check.call(child) }
        else
          errors['rules'] = 'Rule currency must belong to this casino' if node['currency'] && !currency_codes.include?(node['currency'])
        end
      end
      check.call(clean['rules'])
      return [nil, errors] unless errors.empty?
      if segments.any? { |s| s['id'] != id && s['name'].casecmp(clean['name']).zero? }
        return [nil, { 'name' => 'Segment name is already in use' }]
      end
      id ||= owned_ids('SG')
      now = Time.now.utc.iso8601
      previous_name = @segments.dig(id, 'name')
      saved = clean.merge('id' => id, 'casino_id' => @casino_id,
        'created_at' => @segments.dig(id, 'created_at') || now, 'updated_at' => now)
      @segments[id] = saved
      if previous_name && previous_name != saved['name']
        records = @game_catalog['games'] + @game_catalog['categories'] +
          @state['finance'].fetch('connections', []) + @state['finance'].fetch('cascades', [])
        records.each do |record|
          record['segments'] = record.fetch('segments', []).map { |name| name.casecmp(previous_name).zero? ? saved['name'] : name }
        end
        @state['bonuses'].each do |bonus|
          %w[includeSegments excludeSegments].each do |key|
            bonus['availability'][key] = bonus['availability'][key].map { |name| name.casecmp(previous_name).zero? ? saved['name'] : name }
          end
          bonus['groups'] = bonus['availability']['includeSegments']
        end
      end
      [saved, {}]
    end

    def parameters
      CustomerSegments::PARAMETERS.map do |parameter|
        options = case parameter['key']
                  when 'country' then @state['catalogs']['countries'].map { |r| r['code'] }
                  when 'currency' then @state['catalogs']['currencies'].map { |r| r['code'] }
                  when 'lang' then @state['catalogs']['languages'].map { |r| r['code'] }
                  when 'favourite_game' then catalog_games.map { |r| r['name'] }
                  when 'favourite_category', 'favourite_type'
                    primary_ids = catalog_games.map { |game| game['category'] }
                    game_categories.select { |category| primary_ids.include?(category['id']) }.map { |category| category['name'] }
                  when 'favourite_provider' then publishers.map { |r| r['name'] }
                  else parameter['options']
                  end
        parameter.merge('options' => options)
      end
    end
  end

  attr_reader :path

  def initialize(legacy, seeds)
    mode = ENV.fetch('CRM_UI_MODE', 'demo')
    raise 'CRM_UI_MODE must be demo or authenticated' unless %w[demo authenticated].include?(mode)
    if mode == 'authenticated'
      raise 'Authenticated CRM requires operator credentials' if ENV['CRM_OPERATOR_USERNAME'].to_s.empty? || ENV['CRM_OPERATOR_PASSWORD'].to_s.length < 12
      raise 'Authenticated CRM requires explicit operational and reporting casino permissions' unless ENV.key?('CRM_ALLOWED_CASINOS') && ENV.key?('CRM_REPORTING_CASINOS')
    end
    @legacy, @seeds = legacy, seeds
    @dir = legacy.instance_variable_get(:@dir)
    @path = File.join(@dir, 'casino_context.json')
    @lock_path = File.join(@dir, 'casino_context.lock')
    raise 'Refusing symlink context storage' if File.symlink?(@path) || File.symlink?(@lock_path)
    transaction do |document|
      next if document
      backup = File.join(@dir, 'before-casino-context')
      FileUtils.mkdir_p(backup, mode: 0700)
      %w[profiles credentials segments games casino_websites].each do |name|
        source = File.join(@dir, "#{name}.json")
        FileUtils.cp(source, backup) if File.file?(source)
      end
      File.write(File.join(backup, 'in-memory-demo-seeds.json'), JSON.generate(@seeds), mode: 'wx', perm: 0600) unless File.exist?(File.join(backup, 'in-memory-demo-seeds.json'))
      document = migrate
      persist(document)
    end
    transaction do |document|
      changed = false
      document.fetch('tenants').each do |id, state|
        changed = ComplianceStore.prepare(state, id, demo: false) || changed
        unless state.key?('home_dashboard')
          state['home_dashboard'] = HomeDashboard.seed(id)
          changed = true
        end
      end
      persist(document) if changed
    end
  end

  def transaction
    File.open(@lock_path, File::RDWR | File::CREAT, 0600) do |lock|
      lock.flock(File::LOCK_EX)
      document = File.exist?(@path) ? JSON.parse(File.read(@path)) : nil
      yield document
    ensure
      lock.flock(File::LOCK_UN)
    end
  end

  def persist(document)
    Tempfile.create(['context-', '.json'], @dir) do |file|
      file.chmod(0600)
      file.write(JSON.generate(document))
      file.flush
      file.fsync
      File.rename(file.path, @path)
    end
    File.open(@dir) { |directory| directory.fsync }
  end

  def empty_state
    {
      'revision' => 0, 'profiles' => {}, 'credentials' => {}, 'segments' => {},
      'games' => { 'categories' => [], 'games' => [], 'demo_expansion_version' => 1, 'demo_category_metadata_version' => 1 },
      'catalogs' => { 'providers' => [], 'countries' => [], 'currencies' => [], 'languages' => [] },
      'finance' => empty_finance, 'bonuses' => [], 'changelog' => {}, 'promo_codes' => {},
      'promo_banners' => {}, 'rates' => {}, 'rates_meta' => {}
    }
  end

  def empty_finance
    finance_seed.transform_values { |value| value.is_a?(Hash) ? {} : [] }
  end

  def finance_seed
    JSON.parse(File.read(File.join(__dir__, 'finance_seed.json')))
  end

  def migrate
    casinos = @legacy.casino_websites.sort_by { |site| [site['created_at'], site['id']] }
    raise 'Casino context migration requires at least one casino' if casinos.empty?
    first = casinos.first.fetch('id')
    original = empty_state.merge(@seeds).merge(
      'profiles' => @legacy.instance_variable_get(:@profiles),
      'credentials' => @legacy.instance_variable_get(:@credentials),
      'segments' => @legacy.instance_variable_get(:@segments),
      'games' => @legacy.instance_variable_get(:@game_catalog),
      'finance' => finance_seed,
      'catalogs' => {
        'providers' => JSON.parse(JSON.generate(GameCatalog::PUBLISHERS)),
        'countries' => CustomerStore::COUNTRIES.map { |code| { 'id' => "country-#{code}", 'code' => code } },
        'currencies' => CustomerStore::CURRENCIES.map { |code| { 'id' => "currency-#{code}", 'code' => code } },
        'languages' => CustomerStore::LANGUAGES.map { |code| { 'id' => "language-#{code}", 'code' => code } }
      })
    import_legacy_targeting(original)
    stamp(original, first)
    validate_references(original)
    document = { 'version' => 1, 'casinos' => casinos, 'tenants' => { first => original }, 'operations' => {}, 'audit' => [],
      'migration' => { 'version' => 1, 'source' => first, 'at' => Time.now.utc.iso8601, 'copies' => {} } }
    casinos.drop(1).each do |site|
      copied, report = clone_state(original, site['id'], GROUPS)
      document['tenants'][site['id']] = copied
      document['migration']['copies'][site['id']] = report
    end
    document
  end

  def import_legacy_targeting(state)
    referenced = state['games']['games'].flat_map { |record| record.fetch('segments', []) } +
      state['games']['categories'].flat_map { |record| record.fetch('segments', []) } +
      state['finance'].fetch('connections', []).flat_map { |record| record.fetch('segments', []) } +
      state['finance'].fetch('cascades', []).flat_map { |record| record.fetch('segments', []) } +
      state['bonuses'].flat_map { |record| record['availability'].values_at('includeSegments', 'excludeSegments').flatten }
    options = CustomerSegments::BY_KEY.fetch('legacy_group').fetch('options')
    referenced.uniq.each do |name|
      next if state['segments'].values.any? { |segment| segment['name'].casecmp(name).zero? }
      raise "Unknown legacy targeting tag #{name.inspect}; resolve before migration" unless options.include?(name)
      id = "SG-#{SecureRandom.random_number(8_000_000_000_000_000) + 1_000_000_000_000_000}"
      state['segments'][id] = { 'id' => id, 'name' => name, 'legacy_imported' => true,
        'rules' => { 'kind' => 'rule', 'field' => 'legacy_group', 'operator' => 'IS', 'value' => [name], 'not' => false } }
    end
    state['profiles'].each_value do |profile|
      player = state['finance'].fetch('players', []).find { |record| record['name'] == profile['name'] }
      tags = player ? player.fetch('segments', []) : []
      profile['legacy_groups'] = (tags + tags.map(&:downcase)).select { |name| options.include?(name) }.uniq
    end
  end

  def stamp(state, casino_id)
    visit = lambda do |value|
      case value
      when Hash
        value['casino_id'] = casino_id if value.key?('id') || value.key?('customer_id') || value.key?('code') || value.key?('at')
        value.each_value { |child| visit.call(child) }
      when Array then value.each { |child| visit.call(child) }
      end
    end
    visit.call(state)
    state['finance'].each_value do |records|
      records.each { |record| record['casino_id'] = casino_id } if records.is_a?(Array)
    end
    state['promo_banners'].each_value { |banner| banner['casino_id'] = casino_id }
    state['rates_meta']['casino_id'] = casino_id
    state
  end

  def effective_groups(source, requested)
    groups = requested.dup
    loop do
      before = groups.dup
      if groups.include?('games')
        groups << 'catalogs' unless source['catalogs'].values.all?(&:empty?) && source['games']['categories'].empty?
        groups << 'segments' if source['games'].values.grep(Array).flatten.any? { |r| r.is_a?(Hash) && !r.fetch('segments', []).empty? }
      end
      if groups.include?('catalogs')
        groups << 'games' if source['games']['categories'].any? { |c| !c.fetch('game_ids', []).empty? }
        groups << 'segments' if source['games']['categories'].any? { |c| !c.fetch('segments', []).empty? }
      end
      if groups.include?('payment_connections')
        groups << 'catalogs'
        groups << 'segments' if source['finance'].values.grep(Array).flatten.any? { |r| r.is_a?(Hash) && !r.fetch('segments', []).empty? }
      end
      if groups.include?('segments')
        rules = JSON.generate(source['segments'])
        groups << 'catalogs' if rules.match?(/"field":"(?:country|currency|lang|geo_zone|favourite_provider|favourite_category|favourite_type)"/) || rules.include?('"currency":')
        groups << 'games' if rules.include?('"field":"favourite_game"')
      end
      groups = groups.uniq.sort
      break if groups == before.sort
    end
    groups
  end

  def clone_state(source, casino_id, requested)
    groups = effective_groups(source, requested)
    target = empty_state
    target['segments'] = source['segments'] if groups.include?('segments')
    target['games']['games'] = source['games']['games'] if groups.include?('games')
    if groups.include?('catalogs')
      target['games']['categories'] = source['games']['categories']
      target['catalogs'] = source['catalogs']
      target['rates'] = source['rates']
    end
    if groups.include?('payment_connections')
      %w[connections gateways cascades].each { |key| target['finance'][key] = source['finance'][key] if source['finance'].key?(key) }
    end
    target = JSON.parse(JSON.generate(target))
    mapping = {}
    collect = lambda do |value|
      case value
      when Hash
        if value.key?('id')
          old = value['id']
          mapping[old] ||= if old.is_a?(Integer)
                            SecureRandom.random_number(8_000_000_000_000) + 1_000_000_000_000
                          elsif old.start_with?('SG-')
                            "SG-#{SecureRandom.random_number(8_000_000_000_000_000) + 1_000_000_000_000_000}"
                          else
                            "#{old.split('-').first}-#{SecureRandom.hex(8)}"
                          end
        end
        value.each_value { |child| collect.call(child) }
      when Array then value.each { |child| collect.call(child) }
      end
    end
    collect.call(target)
    remap = lambda do |value|
      case value
      when Hash then value.map { |key, child| [mapping.fetch(key, key), key == 'external_id' ? child : remap.call(child)] }.to_h
      when Array then value.map { |child| remap.call(child) }
      else mapping.fetch(value, value)
      end
    end
    target = remap.call(target)
    now = Time.now.utc.iso8601
    reset = lambda do |value|
      case value
      when Hash
        %w[created_at updated_at].each { |key| value[key] = now if value.key?('id') || value.key?(key) }
        value.each_value { |child| reset.call(child) }
      when Array then value.each { |child| reset.call(child) }
      end
    end
    reset.call(target)
    target['games']['games'].each { |game| game['popularity'] = 0; game['play_count'] = 0 }
    %w[connections cascades].each do |key|
      target['finance'].fetch(key, []).each do |record|
        record['settings'] = {} if record.key?('settings')
        record['enabled'] = false
        record['configuration_required'] = true
        record['status'] = 'Disabled' if record.key?('status')
        record['conn'] = 'offline' if record.key?('conn')
      end
      target['finance'].fetch('gateways', []).each { |gateway| gateway['conn'] = 'offline' }
    end
    stamp(target, casino_id)
    validate_references(target)
    [target, { 'requested_groups' => requested, 'dependency_groups' => groups - requested,
      'counts' => counts(target), 'id_map' => mapping }]
  end

  def validate_references(state)
    games = state['games']['games']
    categories = state['games']['categories']
    game_ids = games.map { |game| game['id'] }
    category_ids = categories.map { |category| category['id'] }
    provider_ids = state['catalogs']['providers'].map { |provider| provider['id'] }
    currency_codes = state['catalogs']['currencies'].map { |record| record['code'] }
    country_codes = state['catalogs']['countries'].map { |record| record['code'] }
    names = state['segments'].values.map { |segment| segment['name'].downcase }
    connections = state['finance'].fetch('connections', [])
    connection_names = connections.map { |connection| connection['name'] }
    game_ids.each { |id| raise InvalidReference, 'Duplicate game identity' if game_ids.count(id) > 1 }
    games.each do |game|
      raise InvalidReference, 'Game provider is missing from the owning casino' unless provider_ids.include?(game['publisher_id'])
      raise InvalidReference, 'Game deposit currencies are outside this casino' unless (game.fetch('deposit_currencies', []) - currency_codes).empty?
      if game['category'] && !game['category'].empty? && !category_ids.include?(game['category'])
        raise InvalidReference, 'Game category is missing from the owning casino'
      end
    end
    categories.each do |category|
      raise InvalidReference, 'Category contains foreign or missing games' unless (category.fetch('game_ids', []) - game_ids).empty?
    end
    (games + categories + connections + state['finance'].fetch('cascades', [])).each do |record|
      raise InvalidReference, 'Targeting segment is missing from the owning casino' unless (record.fetch('segments', []).map(&:downcase) - names).empty?
    end
    connections.each do |connection|
      raise InvalidReference, 'Connection currency is outside this casino' unless currency_codes.include?(connection['currency'])
      raise InvalidReference, 'Connection countries are outside this casino' unless (connection.fetch('countries', []) - country_codes).empty?
    end
    state['finance'].fetch('cascades', []).each do |cascade|
      raise InvalidReference, 'Cascade contains foreign or missing connections' unless cascade.fetch('steps', []).all? { |step| connection_names.include?(step['psp']) }
      raise InvalidReference, 'Cascade country is outside this casino' if !cascade['country'].to_s.empty? && !country_codes.include?(cascade['country'])
    end
    state['bonuses'].each do |bonus|
      raise InvalidReference, 'Bonus category is outside this casino' unless category_ids.include?(bonus['category'])
      link = bonus['games']
      raise InvalidReference, 'Bonus game is outside this casino' if link['game'] && !game_ids.include?(link['game'])
      raise InvalidReference, 'Bonus categories are outside this casino' unless (link.fetch('categories', []) - category_ids).empty?
      targeting = bonus['availability'].values_at('includeSegments', 'excludeSegments').flatten
      raise InvalidReference, 'Bonus targeting is outside this casino' unless (targeting.map(&:downcase) - names).empty?
    end
    true
  end

  def permitted_ids(document, reporting: false)
    setting = ENV[reporting ? 'CRM_REPORTING_CASINOS' : 'CRM_ALLOWED_CASINOS']
    ids = document['casinos'].map { |site| site['id'] }
    setting.nil? || setting == '*' ? ids : ids & setting.split(',').map(&:strip)
  end

  def operator_authorized?(req, res, secured)
    return authorize(req, res, SCOPES) if secured
    mode = ENV.fetch('CRM_UI_MODE', 'demo')
    res['X-CRM-Mode'] = mode
    return true if mode == 'demo'
    raise 'CRM_UI_MODE must be demo or authenticated' unless mode == 'authenticated'
    username, password = ENV.values_at('CRM_OPERATOR_USERNAME', 'CRM_OPERATOR_PASSWORD')
    raise 'Authenticated CRM requires operator credentials' if username.to_s.empty? || password.to_s.length < 12
    WEBrick::HTTPAuth.basic_auth(req, res, 'NexLuck CRM') do |user, secret|
      secure_eq(OpenSSL::Digest::SHA256.digest(user.to_s), OpenSSL::Digest::SHA256.digest(username)) &&
        secure_eq(OpenSSL::Digest::SHA256.digest(secret.to_s), OpenSSL::Digest::SHA256.digest(password))
    end
    req.attributes['operator'] = username
    if !%w[GET HEAD].include?(req.request_method)
      origin = req['Origin']
      expected = "#{req['X-Forwarded-Proto'] || req.request_uri.scheme}://#{req['Host']}"
      return json(res, 403, { error: 'Cross-origin writes are forbidden' }) && false if origin && origin != expected
      return json(res, 403, { error: 'Cross-site writes are forbidden' }) && false if req['Sec-Fetch-Site'] == 'cross-site'
      return json(res, 403, { error: 'JSON content type required' }) && false unless req.request_method == 'DELETE' || req.content_type == 'application/json'
    end
    true
  end

  def dispatch(req, res, rest, secured)
    return unless operator_authorized?(req, res, secured)
    transaction do |document|
      allowed = permitted_ids(document)
      registry = document['casinos'].select { |site| allowed.include?(site['id']) }.sort_by { |site| [site['created_at'], site['id']] }
      if rest == 'casinos/clone-preview'
        return json(res, 405, { error: 'POST required' }) unless req.request_method == 'POST'
        return if secured && !authorize(req, res, 'casinos:write')
        body = read_json(req, res)
        return unless body
        source, groups = clone_request(document, allowed, body, res)
        return unless source
        _, report = clone_state(source, 'preview', groups)
        report.delete('id_map')
        return json(res, 200, report.merge('source_id' => body['source_id'], 'source_revision' => source['revision']))
      end
      if rest == 'context-events'
        return json(res, 405, { error: 'POST required' }) unless req.request_method == 'POST'
        return if secured && !authorize(req, res, 'casinos:read')
        body = read_json(req, res)
        return unless body
        return json(res, 400, { error: 'Invalid previous context' }) unless body['from'].nil? || (body['from'].is_a?(String) && body['from'].match?(/\ACS-[a-f0-9]{16}\z/))
        return json(res, 403, { error: 'Context is not permitted' }) unless allowed.include?(body['to'])
        document['audit'] << audit(req, 'context_changed', nil, body.slice('from', 'to'))
        persist(document)
        return json(res, 200, { recorded: true })
      end
      if rest == 'casinos' || rest.start_with?('casinos/')
        match = rest.match(%r{\Acasinos(?:/(CS-[a-f0-9]{16}))?\z})
        return json(res, 404, { error: 'Not found' }) unless match
        id = match[1]
        method = req.request_method
        return json(res, 405, { error: 'Method not allowed' }) unless (id ? %w[GET PATCH] : %w[GET POST]).include?(method)
        return if secured && !authorize(req, res, method == 'GET' ? 'casinos:read' : 'casinos:write')
        website = registry.find { |site| site['id'] == id } if id
        return json(res, 404, { error: 'Website not found' }) if id && !website
        return json(res, 200, id ? website : { items: registry, total: registry.length, mode: ENV.fetch('CRM_UI_MODE', 'demo') }) if method == 'GET'
        body = read_json(req, res)
        return unless body
        operation_key = req['Idempotency-Key'].to_s
        if id && (body.keys & %w[source_id source_revision groups]).any?
          return json(res, 422, { error: 'Copy options are only supported when creating a casino' })
        end
        if method == 'POST'
          return json(res, 400, { error: 'Idempotency-Key of 8-200 characters required' }) unless operation_key.length.between?(8, 200)
          fingerprint = Digest::SHA256.hexdigest(JSON.generate(body))
          key = "#{req.attributes['client'] || ENV.fetch('CRM_OPERATOR_USERNAME', 'demo')}:create:#{operation_key}"
          if (previous = document['operations'][key])
            return json(res, 409, { error: 'Idempotency key was already used with a different request' }) unless previous['fingerprint'] == fingerprint
            return json(res, 201, previous['result'])
          end
        end
        source, groups = nil, []
        if body['source_id']
          source, groups = clone_request(document, allowed, body, res)
          return unless source
          return json(res, 409, { error: 'Source changed. Refresh the copy preview before continuing.' }) unless body['source_revision'] == source['revision']
        elsif body.fetch('groups', []) != []
          return json(res, 422, { error: 'Choose a source casino before copying configuration' })
        end
        return json(res, 422, { error: 'Copying is only available when creating a casino' }) if id && source
        draft_store = Tenant.new(empty_state, '', document['casinos'])
        saved, errors = draft_store.save_casino_website(id, body.reject { |k, _| %w[source_id source_revision groups].include?(k) })
        return json(res, 422, { error: 'Validation failed', fields: errors }) unless errors.empty?
        document['casinos'] = draft_store.casino_websites
        report = nil
        unless id
          target, report = source ? clone_state(source, saved['id'], groups) : [empty_state, { 'counts' => counts(empty_state), 'requested_groups' => [], 'dependency_groups' => [] }]
          target['home_dashboard'] = HomeDashboard.seed(saved['id'])
          ComplianceStore.prepare(target, saved['id'], demo: false)
          stamp(target, saved['id'])
          document['tenants'][saved['id']] = target
        end
        result = report ? saved.merge('clone' => report.reject { |k, _| k == 'id_map' }) : saved
        document['operations'][key] = { 'fingerprint' => fingerprint, 'result' => result } unless id
        document['audit'] << audit(req, id ? 'casino_updated' : 'casino_created', saved['id'],
          { 'source_id' => body['source_id'], 'source_revision' => body['source_revision'], 'clone' => report })
        persist(document)
        return json(res, id ? 200 : 201, result)
      end
      if rest.start_with?('reporting/')
        return reporting(req, res, rest.delete_prefix('reporting/'), document, secured)
      end
      casino_id = req['X-Casino-Id'].to_s
      return json(res, 400, { error: 'A valid X-Casino-Id header is required' }) unless casino_id.match?(/\ACS-[a-f0-9]{16}\z/)
      return json(res, 403, { error: 'Casino context is not permitted' }) unless allowed.include?(casino_id)
      state = document['tenants'].fetch(casino_id)
      Thread.current[:crm_tenant] = Tenant.new(state, casino_id, document['casinos'])
      res['X-Casino-Id'] = casino_id
      res['Cache-Control'] = 'no-store'
      if rest == 'dashboard'
        return json(res, 405, { error: 'GET required' }) unless req.request_method == 'GET'
        return if secured && !authorize(req, res, 'dashboard:read')
        return json(res, 200, HomeDashboard.payload(state.fetch('home_dashboard'), registry))
      end
      if rest == 'catalogs'
        return json(res, 405, { error: 'GET required' }) unless req.request_method == 'GET'
        return if secured && !authorize(req, res, %w[games:read bonuses:read customers:read segments:read])
        return json(res, 200, state['catalogs'].merge('categories' => customer_store.game_categories))
      end
      if rest == 'compliance' || rest.start_with?('compliance/')
        return if secured && !authorize(req, res, req.request_method == 'GET' ? 'compliance:read' : 'compliance:write')
        if rest == 'compliance' && req.request_method == 'GET' && ComplianceStore.prepare(state, casino_id)
          state['revision'] += 1
          document['audit'] << audit(req, 'compliance_demo_seeded', casino_id, { 'source' => 'synthetic_demo' })
          persist(document)
        end
        customer_store.handle_compliance(req, res, rest)
      elsif rest == 'finance' || rest.start_with?('finance/')
        return if secured && !authorize(req, res, req.request_method == 'GET' ? 'finance:read' : 'finance:write')
        match = rest.match(%r{\Afinance(?:/(connections|cascades)(?:/([\w-]+))?)?\z})
        return json(res, 404, { error: 'Not found' }) unless match
        resource, id = match.captures
        if req.request_method == 'GET' && !resource
          json(res, 200, customer_store.finance_data)
        elsif resource && %w[POST PATCH DELETE].include?(req.request_method)
          body = req.request_method == 'DELETE' ? { '_delete' => true } : read_json(req, res)
          return unless body
          saved, errors = customer_store.save_finance(resource, id, body)
          return json(res, errors.key?('id') ? 404 : 422, { error: 'Validation failed', fields: errors }) unless errors.empty?
          json(res, 200, saved)
        else
          return json(res, 405, { error: 'Method not allowed' })
        end
      else
        yield
      end
      if res.status.between?(200, 299) && !%w[GET HEAD].include?(req.request_method)
        stamp(state, casino_id)
        validate_references(state)
        state['revision'] += 1
        document['audit'] << audit(req, "#{req.request_method} #{rest}", casino_id, {})
        persist(document)
        # Restamp returned newly created objects after server-side ownership assignment.
        payload = JSON.parse(res.body)
        payload['casino_id'] = casino_id if payload.is_a?(Hash)
        stamp_response(payload, casino_id)
        res.body = JSON.generate(payload)
      end
    ensure
      Thread.current[:crm_tenant] = nil
    end
  end

  def stamp_response(value, casino_id)
    case value
    when Hash
      value['casino_id'] = casino_id if value.key?('id') || value.key?('code')
      value.each_value { |child| stamp_response(child, casino_id) }
    when Array then value.each { |child| stamp_response(child, casino_id) }
    end
  end

  def clone_request(document, allowed, body, res)
    id, groups = body['source_id'], body.fetch('groups', [])
    unless id.is_a?(String) && allowed.include?(id)
      json(res, 403, { error: 'Copy source is not permitted' })
      return
    end
    unless groups.is_a?(Array) && (groups - GROUPS).empty? && groups.uniq == groups
      json(res, 422, { error: 'Choose valid configuration groups' })
      return
    end
    [document['tenants'].fetch(id), groups]
  end

  def audit(req, action, casino_id, details)
    { 'at' => Time.now.utc.iso8601, 'actor' => req.attributes['client'] || req.attributes['operator'] || (ENV.fetch('CRM_UI_MODE', 'demo') == 'demo' ? 'demo' : 'unauthenticated'),
      'action' => action, 'casino_id' => casino_id, 'result' => 'success', 'details' => details }
  end

  def record_failure(req, res, rest)
    return if %w[GET HEAD].include?(req.request_method) || res.status < 400
    transaction do |document|
      casino_id = req['X-Casino-Id']
      casino_id = nil unless document['tenants'].key?(casino_id)
      event = audit(req, "#{req.request_method} #{rest}", casino_id, { 'http_status' => res.status })
      event['result'] = 'failed'
      document['audit'] << event
      persist(document)
    end
  end

  def reporting(req, res, resource, document, secured)
    return json(res, 405, { error: 'Reporting APIs are read-only' }) unless req.request_method == 'GET'
    return if secured && !authorize(req, res, resource.start_with?('segments') ? 'segments:read' : 'games:read')
    ids = permitted_ids(document, reporting: true)
    return json(res, 200, { items: CustomerSegments::PARAMETERS }) if resource == 'segments/parameters'
    return json(res, 404, { error: 'Reporting resource not found' }) unless %w[segments games games/categories games/publishers].include?(resource)
    items = ids.flat_map do |id|
      state = document['tenants'].fetch(id)
      store = Tenant.new(state, id, document['casinos'])
      rows = case resource
             when 'segments' then store.segments
             when 'games' then store.catalog_games
             when 'games/categories' then store.game_categories
             else store.publishers
             end
      name = document['casinos'].find { |site| site['id'] == id }.fetch('name')
      rows.map do |row|
        result = row.merge('id' => "#{id}:#{row['id']}", 'object_id' => row['id'], 'casino_id' => id, 'casino_name' => name,
          'original_name' => row['name'], 'name' => "#{row['name']} (#{name}, #{id})")
        if resource == 'segments'
          result['name'] = "#{row['name']} (#{name}, #{id})"
        elsif resource == 'games'
          result['category'] = "#{id}:#{row['category']}"
          result['category_ids'] = row['category_ids'].map { |ref| "#{id}:#{ref}" }
          result['publisher_id'] = "#{id}:#{row['publisher_id']}"
        elsif resource == 'games/categories'
          result['game_ids'] = row['game_ids'].map { |ref| "#{id}:#{ref}" }
        end
        result
      end
    end
    json(res, 200, { items: items, total: items.length })
  end

  def counts(state)
    {
      'segments' => state['segments'].length, 'games' => state['games']['games'].length,
      'categories' => state['games']['categories'].length,
      'providers' => state['catalogs']['providers'].length,
      'countries' => state['catalogs']['countries'].length,
      'currencies' => state['catalogs']['currencies'].length,
      'languages' => state['catalogs']['languages'].length,
      'connections' => state['finance'].fetch('connections', []).length,
      'cascades' => state['finance'].fetch('cascades', []).length
    }
  end
end

def customer_store
  Thread.current[:crm_tenant] || raise('Casino context has not been resolved')
end

def tenant_data(key)
  customer_store.state.fetch(key)
end
