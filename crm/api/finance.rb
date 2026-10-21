require 'json'
require 'securerandom'
require 'time'

# The tenant wrapper owns persistence and commits this state with its other resources.
module FinanceStore
  SEED_JSON = File.read(File.join(__dir__, 'finance_seed.json')).freeze
  HISTORY_KEYS = %w[wallets wallet_transactions transactions players].freeze
  COLLECTION_KEYS = %w[connections gateways cascades wallets wallet_transactions transactions players game_catalog].freeze
  CONNECTION_FIELDS = %w[name brand currency methods countries segments conn settings enabled configuration_required].freeze
  CASCADE_FIELDS = %w[name type country zone segments method currency steps enabled configuration_required].freeze
  DECLINE_REASONS = ['Insufficient funds', 'Do not honor', '3-D Secure failed', 'Suspected fraud', 'Issuer unavailable', 'Expired card', 'Any decline'].freeze
  ZONES = ['SEA', 'APAC', 'MENA', 'LATM', 'CIS', 'Europe', 'Africa', 'Canada', 'United States'].freeze
  COUNTRIES = %w[CA US BR MX AR CL PE DE FR ES IT NL PL SE GB IE AT FI RU KZ UA UZ AZ AE SA TR EG MA NG ZA KE GH TH VN ID PH MY IN JP KR AU NZ BD].freeze
  CURRENCIES = %w[EUR USD GBP CAD INR BRL MXN TRY AED NGN KES ZAR THB VND IDR PHP JPY AUD RUB KZT USDT BTC SEK PLN].freeze
  METHODS = ['Visa', 'MasterCard', 'Apple Pay', 'Google Pay', 'Bank transfer', 'SEPA', 'Open banking', 'E-wallet', 'Prepaid voucher', 'UPI', 'Paytm', 'QR Code', 'Pix', 'Crypto', 'Mobile money', 'Interac', 'ACH'].freeze
  SEGMENTS = %w[REGISTERED NO_DEPOSIT KYC_VERIFIED FIRST_DEP VIP HIGH_ROLLER MOBILE].freeze

  def self.seed(include_history: true)
    data = JSON.parse(SEED_JSON)
    unless include_history
      HISTORY_KEYS.each { |key| data[key] = [] }
      data['game_catalog'] = []
      data['connections'].each do |connection|
        connection.merge!('settings' => {}, 'conn' => 'offline', 'enabled' => false, 'configuration_required' => true)
      end
      data['gateways'].each { |gateway| gateway['conn'] = 'offline' }
      data['cascades'].each { |cascade| cascade.merge!('enabled' => false, 'configuration_required' => true) }
    end
    data
  end

  def finance_data
    data = JSON.parse(JSON.generate(@state.fetch('finance')))
    games = @state.fetch('games', {})
    providers = @state.fetch('catalogs', {}).fetch('providers', []).select { |provider| finance_owned?(provider) }
    categories = games.fetch('categories', []).select { |category| finance_owned?(category) }
    data['game_catalog'] = games.fetch('games', []).select { |game| finance_owned?(game) }.map do |game|
      provider = providers.find { |row| row['id'] == game['publisher_id'] }
      category = categories.find { |row| row['id'] == game['category'] }
      {
        'id' => game['id'], 'casino_id' => @casino_id, 'name' => game['name'],
        'category' => category && category['name'], 'provider' => provider && provider['name']
      }
    end
    data
  end

  def save_finance(resource, id, body)
    return [nil, { 'resource' => 'Unsupported finance resource' }] unless %w[connections cascades].include?(resource)
    return [nil, { 'body' => 'Must be an object' }] unless body.is_a?(Hash)
    if body['_delete'] == true
      return [nil, { 'body' => 'Delete accepts no editable fields' }] unless body.keys == ['_delete']
      return [nil, { 'id' => 'An existing casino-local ID is required' }] unless id
      return delete_finance(resource, id)
    end
    records = @state.fetch('finance').fetch(resource)
    current = id && records.find { |record| record['id'].to_s == id.to_s && finance_owned?(record) }
    return [nil, { 'id' => 'Not found in this casino' }] if id && !current

    allowed = resource == 'connections' ? CONNECTION_FIELDS : CASCADE_FIELDS
    errors = {}
    (body.keys - allowed).each { |key| errors[key] = 'Unknown or read-only field' }
    clean = (current || {}).merge(body)
    errors['name'] = 'Required, at most 200 characters' unless clean['name'].is_a?(String) && clean['name'].strip.length.between?(1, 200)
    if clean['name'].is_a?(String)
      clean['name'] = clean['name'].strip
      errors['name'] = 'Name is already in use' if records.any? { |row| row != current && row['name'].casecmp?(clean['name']) }
    end
    finance_validate_segments(clean['segments'], errors)
    %w[enabled configuration_required].each do |key|
      errors[key] = 'Must be a boolean' if clean.key?(key) && ![true, false].include?(clean[key])
    end
    if resource == 'connections'
      finance_validate_connection(clean, errors)
    else
      finance_validate_cascade(clean, errors)
    end
    return [nil, errors] unless errors.empty?

    now = Time.now.utc.iso8601
    saved = clean.merge('id' => current ? current['id'] : SecureRandom.random_number(2**48) + 1,
                        'casino_id' => @casino_id, 'created_at' => current && current['created_at'] || now, 'updated_at' => now)
    saved = JSON.parse(JSON.generate(saved))
    updated = current ? records.map { |record| record == current ? saved : record } : records + [saved]
    @state['finance'][resource] = updated
    if resource == 'connections' && current && current['name'] != saved['name']
      @state['finance']['cascades'].each do |cascade|
        cascade['steps'].each { |step| step['psp'] = saved['name'] if step['psp'] == current['name'] }
      end
    end
    [JSON.parse(JSON.generate(saved)), {}]
  end

  def delete_finance(resource, id)
    return [nil, { 'resource' => 'Unsupported finance resource' }] unless %w[connections cascades].include?(resource)
    records = @state.fetch('finance').fetch(resource)
    current = records.find { |record| record['id'].to_s == id.to_s && finance_owned?(record) }
    return [nil, { 'id' => 'Not found in this casino' }] unless current
    if resource == 'connections' && @state['finance']['cascades'].any? { |cascade| cascade['steps'].any? { |step| step['psp'] == current['name'] || step['connection_id'].to_s == id.to_s } }
      return [nil, { 'id' => 'Connection is used by a cascade' }]
    end
    @state['finance'][resource] = records.reject { |record| record == current }
    [current, {}]
  end

  private

  def finance_owned?(record)
    record['casino_id'].to_s == @casino_id.to_s
  end

  def finance_validate_segments(segments, errors)
    local = @state['segments']
    local = local.values if local.is_a?(Hash)
    names = SEGMENTS + Array(local).map { |segment| segment['name'] if segment.is_a?(Hash) && (!segment.key?('casino_id') || finance_owned?(segment)) }.compact
    errors['segments'] = 'Choose casino-local segments' unless segments.is_a?(Array) && segments.length <= 100 && segments.all? { |name| names.include?(name) }
  end

  def finance_validate_connection(clean, errors)
    gateways = @state['finance']['gateways'].select { |gateway| finance_owned?(gateway) }
    gateway = gateways.find { |row| row['brand'] == clean['brand'] }
    errors['brand'] = 'Choose a gateway in this casino' unless gateway
    errors['currency'] = 'Choose a supported currency' unless CURRENCIES.include?(clean['currency'])
    errors['conn'] = 'Choose online, degraded or offline' unless %w[online degraded offline].include?(clean['conn'])
    { 'countries' => COUNTRIES, 'methods' => METHODS }.each do |key, options|
      values = clean[key]
      errors[key] = 'Choose one or more supported values' unless values.is_a?(Array) && values.length.between?(1, 100) && values.all? { |value| options.include?(value) }
    end
    settings = clean['settings']
    unless settings.is_a?(Hash) && settings.length <= 40 && settings.all? { |key, value| key.is_a?(String) && key.match?(/\A[a-z_][a-z0-9_]{0,79}\z/) && value.is_a?(String) && value.length <= 16_384 }
      errors['settings'] = 'Must contain text configuration fields'
      return
    end
    template = JSON.parse(SEED_JSON)['connections'].find { |row| row['brand'] == clean['brand'] }
    required = template ? template['settings'].keys : %w[merchant_id api_key endpoint_url]
    missing = required.any? { |key| settings[key].to_s.strip.empty? }
    errors['settings'] = 'Configure all gateway credentials before connecting' if clean['conn'] != 'offline' && missing
    clean['configuration_required'] = missing
    clean['enabled'] = !missing && clean['conn'] != 'offline'
  end

  def finance_validate_cascade(clean, errors)
    errors['type'] = 'Choose success or decline' unless %w[success decline].include?(clean['type'])
    { 'country' => COUNTRIES, 'zone' => ZONES, 'method' => METHODS, 'currency' => CURRENCIES }.each do |key, options|
      errors[key] = 'Choose a supported value or leave empty' unless clean[key] == '' || options.include?(clean[key])
    end
    steps = clean['steps']
    unless steps.is_a?(Array) && steps.length.between?(1, 100)
      errors['steps'] = 'Choose 1 to 100 payment connections'
      return
    end
    connections = @state['finance']['connections'].select { |connection| finance_owned?(connection) }
    steps.each_with_index do |step, index|
      key = "steps.#{index}"
      unless step.is_a?(Hash) && (step.keys - %w[psp value connection_id]).empty?
        errors[key] = 'Invalid step'
        next
      end
      connection = connections.find { |row| row['name'] == step['psp'] && (!step.key?('connection_id') || row['id'].to_s == step['connection_id'].to_s) }
      errors[key] = 'Choose a connection owned by this casino' unless connection
      value = step['value']
      valid = clean['type'] == 'success' ? value.is_a?(Numeric) && value.finite? && value.between?(0, 100) : DECLINE_REASONS.include?(value)
      errors["#{key}.value"] = 'Choose a valid routing threshold or decline reason' unless valid
    end
    required = steps.any? { |step| !step.is_a?(Hash) || connections.none? { |row| row['name'] == step['psp'] && row['enabled'] != false && !row['configuration_required'] } }
    clean['configuration_required'] = required
    clean['enabled'] = !required
  end
end
