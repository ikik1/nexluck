require 'uri'

module CasinoWebsites
  WEBSITE_THEMES = %w[classic modern dark].freeze
  WEBSITE_FIELDS = %w[name url theme enabled].freeze

  def initialize_casino_websites
    @casino_websites = load_file('casino_websites.json') || []
    if @casino_websites.empty?
      @casino_websites = [
        ['Aurora Casino', 'aurora', 'modern'],
        ['Coast Casino', 'coast', 'classic'],
        ['Crown Casino', 'crown', 'dark'],
        ['Emerald Casino', 'emerald', 'modern'],
        ['Lunar Casino', 'lunar', 'dark']
      ].each_with_index.map do |(name, domain, theme), i|
        { 'id' => "CS-#{format('%016x', i + 1)}", 'name' => name,
          'url' => "https://#{domain}.example", 'theme' => theme, 'enabled' => true,
          'created_at' => "2026-10-#{format('%02d', i + 1)}T10:00:00Z",
          'updated_at' => "2026-10-#{format('%02d', i + 1)}T10:00:00Z" }
      end
    end
    write_file('casino_websites.json', @casino_websites)
  end

  def casino_websites
    @casino_websites
  end

  def save_casino_website(id, body)
    current = id && @casino_websites.find { |site| site['id'] == id }
    return [nil, { 'id' => 'Website not found' }] if id && !current
    errors = {}
    (body.keys - WEBSITE_FIELDS).each { |key| errors[key] = 'Unknown or read-only field' }
    draft = (current || { 'enabled' => true }).merge(body)
    %w[name url].each do |key|
      value = draft[key]
      if !value.is_a?(String) || value.strip.empty? || value.length > (key == 'name' ? 120 : 2048)
        errors[key] = key == 'name' ? 'Enter a name of 1-120 characters' : 'Enter a URL of 1-2048 characters'
      else
        draft[key] = value.strip
      end
    end
    unless errors['url']
      begin
        uri = URI.parse(draft['url'])
        unless %w[http https].include?(uri.scheme) && uri.host && !uri.host.empty? && !uri.userinfo
          errors['url'] = 'Use an absolute HTTP or HTTPS URL without credentials'
        end
      rescue URI::InvalidURIError
        errors['url'] = 'Use a valid HTTP or HTTPS URL'
      end
    end
    errors['theme'] = 'Choose Classic, Modern or Dark' unless WEBSITE_THEMES.include?(draft['theme'])
    errors['enabled'] = 'Must be true or false' unless [true, false].include?(draft['enabled'])
    return [nil, errors] unless errors.empty?
    now = Time.now.utc.iso8601
    saved = draft.merge('id' => current ? id : 'CS-' + SecureRandom.hex(8),
      'created_at' => current ? current['created_at'] : now, 'updated_at' => now)
    updated = current ? @casino_websites.map { |site| site['id'] == id ? saved : site } : @casino_websites + [saved]
    write_file('casino_websites.json', updated)
    @casino_websites = updated
    [saved, {}]
  end
end
