require 'fileutils'
require 'tempfile'

CUSTOMER_FUNNEL_STATUSES = %w[Lead Registered FTD Trusted VIP Dormant].freeze
CUSTOMER_RISK_KEYS = %w[rdw multiple_payment_methods pof_pow_violations abnormal_activity bonus_abuse bot_activity device_fingerprint_mismatches failed_kyc_attempts vpn_multiple_ips].freeze
CUSTOMER_OBJECTS = %w[luna.play max_rider k.novak sofia88 jhon_d anita.s tigerking mila_r omar77 lee.w kofi_g ivan.k].each_with_index.map do |name, i|
  {
    'id' => "CU-#{1001 + i}", 'external_id' => "PLAYER-#{5001 + i}", 'name' => name,
    'DocumentINo' => "DEMO-DOC-#{1001 + i}", 'country' => %w[DE SE PL BR CA IN US GB AE TH NG KZ][i],
    'currency' => %w[EUR EUR EUR BRL CAD INR USD GBP USD THB NGN USD][i],
    'lang' => %w[de sv pl pt en hi en en ar th en en][i],
    'addr1' => "#{10 + i} Demo Street", 'addr12' => '',
    'mfa_type' => %w[NONE TOTP SMS EMAIL][i % 4],
    'created_at' => "2026-08-#{format('%02d', 1 + i)}T10:00:00Z",
    'updated_at' => '2026-10-01T12:00:00Z', 'risk_score' => (i * 13 + 8) % 101,
    'kyc_status' => %w[NOT_STARTED PENDING VERIFIED REJECTED][i % 4], 'birthday' => "#{1985 + i}-05-12",
    'aml_status' => %w[CLEAR REVIEW BLOCKED][i % 3], 'info' => 'Demo customer profile.',
    'gender' => %w[Female Male Non-binary Undisclosed][i % 4],
    'devices' => [i.even? ? 'Desktop' : 'Mobile'].freeze,
    'sessions_per_week' => 2 + i % 6, 'bonus_wr_rate' => 40 + i * 5,
    'funnel_status' => CUSTOMER_FUNNEL_STATUSES[i % 6],
    'activity' => {
      'last_login_at' => (Time.now.utc - (i + 1) * 86400).iso8601.freeze,
      'last_session_hours' => 3 + i, 'overall_game_hours' => 5000 + i * 125
    }.freeze,
    'risk_indicators' => CUSTOMER_RISK_KEYS.select.with_index { |_, ri| (i + ri) % 4 == 0 }.freeze
  }.each_value(&:freeze).freeze
end.freeze

class CustomerStore
  FIELDS = %w[external_id name DocumentINo country currency lang addr1 addr12 mfa_type risk_score kyc_status birthday aml_status info funnel_status gender].freeze
  OPTIONS = {
    'mfa_type' => %w[NONE TOTP SMS EMAIL],
    'kyc_status' => %w[NOT_STARTED PENDING VERIFIED REJECTED],
    'aml_status' => %w[CLEAR REVIEW BLOCKED],
    'funnel_status' => CUSTOMER_FUNNEL_STATUSES,
    'gender' => %w[Female Male Non-binary Undisclosed]
  }.freeze
  COUNTRIES = %w[CA US BR MX AR CL PE DE FR ES IT NL PL SE GB IE AT FI RU KZ UA UZ AZ AE SA TR EG MA NG ZA KE GH TH VN ID PH MY IN JP KR AU NZ BD].freeze
  CURRENCIES = %w[EUR USD GBP CAD INR BRL MXN TRY AED NGN KES ZAR THB VND IDR PHP JPY AUD RUB KZT USDT BTC].freeze
  LANGUAGES = %w[en de sv pl pt fr hi ar th].freeze
  PASSWORD_ITERATIONS = 210_000

  def initialize
    @dir = File.expand_path(ENV['CRM_CUSTOMER_DATA_DIR'] || '~/.local/share/nexluck/customers')
    root = File.realpath(ROOT)
    raise 'Customer storage must be outside the web document root' if @dir == root || @dir.start_with?(root + '/')
    FileUtils.mkdir_p(@dir, mode: 0700)
    real = File.realpath(@dir)
    raise 'Customer storage must be outside the web document root' if real == root || real.start_with?(root + '/')
    File.chmod(0700, @dir)
    @profiles = load_file('profiles.json') || seed
    # Upgrade existing profiles without overwriting saved fields or timestamps.
    defaults = seed
    @profiles = @profiles.map do |id, profile|
      additions = defaults.fetch(id, {}).select { |key, _| %w[funnel_status activity risk_indicators gender devices sessions_per_week bonus_wr_rate].include?(key) }
      [id, additions.merge(profile)]
    end.to_h
    @credentials = load_file('credentials.json') || {}
    write_file('profiles.json', @profiles)
    write_file('credentials.json', @credentials)
    @segments = load_file('segments.json') || CustomerSegments::SEEDS.map { |s| [s['id'], s] }.to_h
    write_file('segments.json', @segments)
  end

  def segments
    @segments.values.sort_by { |s| s['id'] }
  end

  def segment(id)
    @segments[id]
  end

  def save_segment(id, body)
    clean, errors = CustomerSegments.validate(body)
    if clean && @segments.values.any? { |s| s['id'] != id && s['name'].downcase == clean['name'].downcase }
      errors['name'] = 'Segment name is already in use'
    end
    return [nil, errors] unless errors.empty?
    id ||= "SG-#{(@segments.keys.map { |key| key.delete_prefix('SG-').to_i }.max || 1000) + 1}"
    now = Time.now.utc.iso8601
    previous_tag = @segments.dig(id, 'tag_name')
    clean['tag_name'] = previous_tag if previous_tag && !body.key?('tag_name')
    saved = clean.merge('id' => id, 'created_at' => @segments.dig(id, 'created_at') || now, 'updated_at' => now)
    updated = @segments.merge(id => saved)
    write_file('segments.json', updated)
    @segments = updated
    [saved, {}]
  end

  def list
    @profiles.values.sort_by { |c| c['id'] }
  end

  def find(id)
    @profiles[id]
  end

  def update(id, body)
    errors = {}
    (body.keys - FIELDS).each { |key| errors[key] = 'Unknown or read-only field' }
    clean = @profiles.fetch(id).merge(body)
    FIELDS.each do |key|
      next if key == 'risk_score'
      value = clean[key]
      max = key == 'info' ? 4000 : 200
      errors[key] = "Must be text of at most #{max} characters" unless value.is_a?(String) && value.length <= max
    end
    %w[name external_id].each do |key|
      errors[key] = 'Required' if clean[key].is_a?(String) && clean[key].strip.empty?
    end
    if @profiles.values.any? { |c| c['id'] != id && c['external_id'] == clean['external_id'] }
      errors['external_id'] = 'External ID is already in use'
    end
    profile_options.each do |key, values|
      errors[key] = 'Choose a supported value' unless values.include?(clean[key])
    end
    score = clean['risk_score']
    errors['risk_score'] = 'Must be an integer between 0 and 100' unless score.is_a?(Integer) && score.between?(0, 100)
    begin
      date = Date.iso8601(clean['birthday'].to_s)
      errors['birthday'] = 'Must be a past date in YYYY-MM-DD format' unless date < Date.today && date.iso8601 == clean['birthday']
    rescue ArgumentError
      errors['birthday'] = 'Must be a valid date in YYYY-MM-DD format'
    end
    return [nil, errors] unless errors.empty?
    clean['updated_at'] = Time.now.utc.iso8601
    updated = @profiles.merge(id => clean)
    write_file('profiles.json', updated)
    @profiles = updated
    [clean, {}]
  end

  def set_password(id, password)
    salt = SecureRandom.random_bytes(32)
    digest = OpenSSL::PKCS5.pbkdf2_hmac(password, salt, PASSWORD_ITERATIONS, 64, 'sha512')
    record = {
      'customer_id' => id, 'algorithm' => 'PBKDF2-HMAC-SHA512', 'iterations' => PASSWORD_ITERATIONS,
      'salt' => Base64.strict_encode64(salt), 'password_hash' => Base64.strict_encode64(digest),
      'updated_at' => Time.now.utc.iso8601
    }
    updated = @credentials.merge(id => record)
    write_file('credentials.json', updated)
    @credentials = updated
  end

  def profile_options
    OPTIONS.merge('country' => COUNTRIES, 'currency' => CURRENCIES, 'lang' => LANGUAGES)
  end

  private

  def load_file(name)
    path = File.join(@dir, name)
    return nil unless File.exist?(path)
    raise "Refusing symlink customer store: #{name}" if File.symlink?(path)
    File.chmod(0600, path)
    JSON.parse(File.read(path))
  end

  def write_file(name, value)
    Tempfile.create(['customer-', '.json'], @dir) do |file|
      file.chmod(0600)
      file.write(JSON.generate(value))
      file.flush
      file.fsync
      File.rename(file.path, File.join(@dir, name))
    end
  end

  def seed
    CUSTOMER_OBJECTS.map { |customer| [customer['id'], customer.dup] }.to_h
  end
end

require_relative 'segments'
