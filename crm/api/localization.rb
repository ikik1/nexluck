require 'json'

module CRMLocalization
  CATALOG_PATH = File.expand_path('../../localization/crm.json', __dir__)
  LOCALES = %w[en ru pt-PT pt-BR es].freeze

  def self.locale_for(request)
    language = request['Accept-Language'].to_s.split(',').first.to_s.split(';').first.to_s.strip.downcase
    exact = LOCALES.find { |locale| locale.downcase == language }
    return exact if exact
    { 'en' => 'en', 'ru' => 'ru', 'pt' => 'pt-PT', 'es' => 'es' }.fetch(language.split('-').first, 'en')
  end

  def self.translate(value, locale)
    case value
    when Hash
      value.transform_values { |item| translate(item, locale) }
    when Array
      value.map { |item| translate(item, locale) }
    when String
      catalog.fetch(locale, {}).fetch(value, value)
    else
      value
    end
  end

  def self.errors(body, locale)
    return body unless LOCALES.include?(locale) && locale != 'en' && body.is_a?(Hash)
    body.each_with_object({}) do |(key, value), result|
      result[key] = %w[error error_description message fields errors detail].include?(key.to_s) ? translate(value, locale) : value
    end
  end

  def self.catalog
    @catalog ||= JSON.parse(File.read(CATALOG_PATH))
  end
end
