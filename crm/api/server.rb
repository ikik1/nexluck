#!/usr/bin/env ruby
# Dev server: serves the site root and the /crm/api/v1 REST API (see /crm/openapi.yaml).
# Usage: ruby crm/api/server.rb [port]
require 'webrick'
require 'json'
require 'date'
require 'time'
require 'openssl'
require 'base64'
require 'securerandom'

ROOT = File.expand_path('../../..', __FILE__)
PORT = (ARGV[0] || 8080).to_i

FIXED = [
  ['BN-1001','Welcome Pack 100%','active',1,'2026-08-14','2026-09-01','2026-12-31','First deposit',120000,96400,81200,2140],
  ['BN-1002','Reload Friday 50%','active',1,'2026-08-20','2026-09-05','2026-11-30','Deposit on Friday',45000,30100,27800,1320],
  ['BN-1003','Free Spins Gates of Olympus','active',1,'2026-09-02','2026-09-10','2026-10-31','Registration',18000,15900,12400,3010],
  ['BN-1004','VIP Cashback Weekly','active',0,'2026-07-11','2026-07-15','2027-01-15','Weekly loss',62000,41500,35200,412],
  ['BN-1005','Birthday Gift','auto',0,'2026-05-03','2026-05-05','2027-05-05','Player birthday',9500,6100,5300,286],
  ['BN-1006','Loyalty Level-Up Reward','auto',0,'2026-06-18','2026-06-20','2027-06-20','Loyalty level reached',23400,17800,14900,731],
  ['BN-1007','Win-back 30 Free Spins','auto',1,'2026-08-01','2026-08-03','2026-12-31','Inactive 30 days',7200,3900,3400,598],
  ['BN-1008','Summer Splash 200%','inactive',1,'2026-05-28','2026-06-01','2026-08-31','First deposit',88000,87200,79100,1904],
  ['BN-1009','Easter Egg Hunt','inactive',1,'2026-03-10','2026-03-28','2026-04-10','Any deposit',31000,30800,26400,877],
  ['BN-1010','No-Deposit €10','inactive',0,'2026-02-02','2026-02-05','2026-03-05','Registration',12000,11200,9100,1200],
  ['BN-1011','Referral Bonus','active',0,'2026-04-09','2026-04-10','2027-04-10',"Friend's first deposit",15500,9800,8200,344],
  ['BN-1012','Tournament Entry Boost','inactive',0,'2026-06-22','2026-07-01','2026-07-31','Tournament join',5200,5100,4300,205]
]
EV = ['First deposit','Registration','Any deposit','Weekly loss','Player birthday','Loyalty level reached','Inactive 30 days','Tournament join','Deposit on Friday',"Friend's first deposit"]
NM = ['Welcome Pack','Reload','Free Spins','Cashback','Level-Up Reward','Win-back','Boost','Mega Match','Lucky Spin','Weekend Special']
CATEGORIES = %w[SLOTS TABLE_GAMES LIVE_CASINO CRASH]
INCLUDE_SEGMENTS = %w[registered no_deposit kyc_verified]
EXCLUDE_SEGMENTS = %w[restricted_countries restricted_currencies]
TRIGGER_EVENTS = %w[on_registration on_deposit]
APPLIES_TO = %w[BONUS_ONLY BONUS_PLUS_DEPOSIT WINNINGS_ONLY]
CAP_TYPES = %w[MULTIPLIER FIXED]
WALLET_ORDER = %w[MAIN_WALLET_FIRST BONUS_MONEY_FIRST]
PAYMENT_METHODS = %w[SKRILL NETELLER CRYPTO]
KYC_LEVELS = %w[NONE VERIFIED_EMAIL VERIFIED_ID VERIFIED_ID_AND_ADDRESS]
CREATORS = %w[v.kovalevskiy a.petrova m.rossi]
DETAIL_KEYS = %w[description category createdBy availability triggers reward wagering walletRules antiBonusHunter]

BONUS_TYPES = ['dep match', 'no-deposit', 'free spins', 'cashback', 'multiplier']
TYPE_RULES = [[/no-deposit/i, 'no-deposit'], [/free spins|win-back|lucky spin|birthday/i, 'free spins'],
              [/cashback/i, 'cashback'], [/boost|level-up|weekend|referral|tournament/i, 'multiplier']]

def type_of(name)
  (TYPE_RULES.find { |re, _| name =~ re } || [nil, 'dep match'])[1]
end

def groups_of(id)
  n = id[3..-1].to_i
  INCLUDE_SEGMENTS.rotate(n % 3).first(1 + n % 3).sort_by { |g| INCLUDE_SEGMENTS.index(g) }
end

def detail_for(b, type, groups)
  n = b[0][3..-1].to_i
  trig = b[7] =~ /registration/i ? 'on_registration' : 'on_deposit'
  {
    'description' => "#{b[1]}: #{b[7].downcase} bonus.",
    'category' => type == 'free spins' ? 'SLOTS' : CATEGORIES[n % 4],
    'createdBy' => CREATORS[n % 3],
    'availability' => { 'startTime' => "#{b[5]}T00:00", 'endTime' => "#{b[6]}T23:59", 'includeSegments' => groups,
                        'excludeSegments' => [[], %w[restricted_countries], EXCLUDE_SEGMENTS, %w[restricted_currencies]][n % 4] },
    'triggers' => { 'event' => trig, 'minDeposit' => [10, 20, 25, 50][n % 4], 'maxDeposit' => [500, 1000, 2000, 5000][n % 4],
                    'depositNumber' => trig == 'on_registration' ? 0 : (b[7] =~ /first/i ? 1 : 1 + n % 3) },
    'reward' => { 'dmp' => (b[1][/(\d+)%/, 1] || [50, 100, 150][n % 3]).to_i, 'maxBonusAmount' => [100, 200, 300, 500][n % 4] },
    'wagering' => { 'multiplier' => [20, 25, 30, 35, 40][n % 5], 'timeToCompleteDays' => [7, 14, 30][n % 3], 'maxBetPerRound' => [2, 5, 10][n % 3],
                    'appliesTo' => type == 'free spins' ? 'WINNINGS_ONLY' : APPLIES_TO[n % 2],
                    'maxWithdrawCap' => n.even? ? { 'type' => 'MULTIPLIER', 'value' => 5 + n % 6 } : { 'type' => 'FIXED', 'value' => [500, 1000, 2000][n % 3] } },
    'walletRules' => { 'deduction' => WALLET_ORDER[n % 2], 'winnings' => WALLET_ORDER[(n / 2) % 2],
                       'allowCancelBeforeWagering' => n % 3 != 0, 'allowWithdrawBeforeWagering' => n % 5 == 0 },
    'antiBonusHunter' => { 'maxClaimsPerIp' => 1, 'maxClaimsPerDevice' => 1,
                           'blockSharedIpSubnets' => true, 'blockKnownVpnsAndProxies' => true,
                           'paymentMethodBlacklist' => PAYMENT_METHODS.dup,
                           'requireKycLevelBeforeClaim' => 'VERIFIED_ID_AND_ADDRESS',
                           'maxBetPerRound' => 10, 'maxBetPercentageOfBonus' => 10.0,
                           'restrictZeroRiskBetting' => true, 'minEvenMoneyCoveragePercentage' => 67.0 }
  }
end

def build
  seed = 7
  rnd = -> { seed = (seed * 16807) % 2147483647; seed / 2147483647.0 }
  rows = FIXED.map(&:dup)
  while rows.length < 100
    n = rows.length + 1001
    r = rnd.call
    kind = r < 0.4 ? 'active' : r < 0.7 ? 'inactive' : 'auto'
    val = ((5000 + rnd.call * 120000) / 100).round * 100
    w = (val * (0.3 + rnd.call * 0.7)).round
    d = Date.new(2026, 1, 1) + (rnd.call * 240).floor
    e = d + (20 + rnd.call * 300).floor
    c = d - (rnd.call * 10).ceil
    name = "#{NM[(rnd.call * 10).floor]} #{10 + (rnd.call * 19).floor * 5}%"
    promo = rnd.call < 0.5 ? 1 : 0
    ev = EV[(rnd.call * 10).floor]
    wins = (w * (0.6 + rnd.call * 0.35)).round
    recv = (100 + rnd.call * 3000).round
    rows << ["BN-#{n}", name, kind, promo, c.to_s, d.to_s, e.to_s, ev, val, w, wins, recv]
  end
  rows.map do |b|
    type = type_of(b[1])
    groups = groups_of(b[0])
    { 'id' => b[0], 'name' => b[1], 'status' => b[2], 'hasPromo' => b[3] == 1,
      'createdAt' => b[4], 'dateStart' => b[5], 'dateEnd' => b[6], 'event' => b[7],
      'bonusValue' => b[8], 'wagered' => b[9], 'wins' => b[10], 'received' => b[11],
      'bonusType' => type, 'groups' => groups, 'deleted' => false }.merge(detail_for(b, type, groups))
  end
end

BONUSES = build
LOCK = Mutex.new
CHANGELOG = BONUSES.map { |b| [b['id'], [{ 'at' => "#{b['createdAt']}T09:00:00Z", 'by' => b['createdBy'], 'summary' => 'Bonus created', 'changes' => [] }]] }.to_h
# Units of each currency per 1 EUR; editable through /exchange-rates.
RATES = { 'USD' => 1.08, 'GBP' => 0.85, 'CAD' => 1.47, 'AUD' => 1.65, 'CHF' => 0.95, 'SEK' => 11.5, 'NOK' => 11.7, 'PLN' => 4.28 }
RATES_META = { 'updatedAt' => Time.now.utc.iso8601, 'updatedBy' => 'system' }
PROMO_BANNERS = {}
PROMO_BANNER_DEFAULT = lambda do
  { 'images' => { 'web' => nil, 'tablet' => nil, 'mobile' => nil }, 'title' => '', 'description' => '',
    'buttons' => { 'depositForSignedUsers' => false, 'signUpForAnonymous' => false },
    'pages' => { 'home' => false, 'welcome' => false } }
end
MAX_IMAGE_CHARS = 2_800_000

def validate_banner(body)
  errors = {}
  out = PROMO_BANNER_DEFAULT.call
  imgs = body['images']
  out['images'].each_key do |k|
    v = imgs.is_a?(Hash) ? imgs[k] : nil
    if v.nil? || v == ''
      next
    elsif !v.is_a?(String) || v !~ %r{\Adata:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+\z}
      errors["images.#{k}"] = 'Use a PNG, JPEG, WEBP or GIF image'
    elsif v.length > MAX_IMAGE_CHARS
      errors["images.#{k}"] = 'Image is too large (max 2 MB)'
    else
      out['images'][k] = v
    end
  end
  %w[title description].each do |k|
    v = body[k].nil? ? '' : body[k]
    if !v.is_a?(String) || v.length > 20_000
      errors[k] = 'Text expected (max 20000 characters)'
    else
      out[k] = v
    end
  end
  { 'buttons' => out['buttons'], 'pages' => out['pages'] }.each do |group, defaults|
    src = body[group]
    defaults.each_key do |k|
      v = src.is_a?(Hash) && src.key?(k) ? src[k] : false
      errors["#{group}.#{k}"] = 'true or false expected' unless v == true || v == false
      defaults[k] = v == true
    end
  end
  [out, errors]
end

PROMO_CODES = BONUSES.map { |b| [b['id'], []] }.to_h

# Filter groups: values inside one group are OR-ed, different groups are AND-ed.
FILTERS = {
  'status' => {
    'active' => ->(b) { b['status'] != 'inactive' },
    'inactive' => ->(b) { b['status'] == 'inactive' },
    'auto' => ->(b) { b['status'] == 'auto' }
  },
  'promo' => {
    'banner' => ->(b) { b['hasPromo'] },
    'nobanner' => ->(b) { !b['hasPromo'] }
  },
  'bonusType' => BONUS_TYPES.map { |t| [t, ->(b) { b['bonusType'] == t }] }.to_h
}

def json(res, status, body)
  res.status = status
  res['Content-Type'] = 'application/json; charset=utf-8'
  res['Cache-Control'] = 'no-store'
  res.body = JSON.generate(body)
end

# ---- Server-to-server auth: OAuth 2.0 client credentials (RFC 6749 §4.4) + JWT access tokens (RFC 9068 style) ----
# Secrets come from the environment; when unset, random ones are generated for this run only.
ISSUER = 'nexluck-crm'
AUDIENCE = 'nexluck-crm-api'
TOKEN_TTL = 900
SCOPES = %w[bonuses:read bonuses:write]
JWT_KEY = ENV['CRM_JWT_SECRET'] || SecureRandom.hex(32)
CLIENT_SECRET = ENV['CRM_CLIENT_SECRET'] || SecureRandom.hex(24)
CLIENTS = {
  (ENV['CRM_CLIENT_ID'] || 'crm-dev-client') => {
    secret_digest: OpenSSL::Digest::SHA256.digest(CLIENT_SECRET),
    scopes: SCOPES
  }
}

def b64(s) Base64.urlsafe_encode64(s, padding: false) end
def unb64(s) Base64.urlsafe_decode64(s) end

# Constant-time comparison of equal-length digests.
def secure_eq(a, b)
  return false unless a.bytesize == b.bytesize
  r = 0
  a.bytes.zip(b.bytes) { |x, y| r |= x ^ y }
  r.zero?
end

def sign(data) OpenSSL::HMAC.digest('SHA256', JWT_KEY, data) end

def issue_token(client_id, scopes)
  now = Time.now.to_i
  head = b64(JSON.generate(alg: 'HS256', typ: 'at+jwt'))
  body = b64(JSON.generate(iss: ISSUER, sub: client_id, aud: AUDIENCE, iat: now, nbf: now,
                           exp: now + TOKEN_TTL, jti: SecureRandom.uuid, scope: scopes.join(' ')))
  "#{head}.#{body}.#{b64(sign("#{head}.#{body}"))}"
end

# Returns the claims hash or nil. The algorithm is pinned, never taken from the token.
def verify_token(token)
  h, p, s = token.to_s.split('.', 3)
  return nil unless h && p && s
  head = JSON.parse(unb64(h))
  return nil unless head['alg'] == 'HS256'
  return nil unless secure_eq(sign("#{h}.#{p}"), unb64(s))
  c = JSON.parse(unb64(p))
  now = Time.now.to_i
  return nil unless c['iss'] == ISSUER && c['aud'] == AUDIENCE && c['exp'].to_i > now && c['nbf'].to_i <= now
  c
rescue StandardError
  nil
end

def oauth_error(res, status, code, desc, www = nil)
  res['WWW-Authenticate'] = www if www
  res['Pragma'] = 'no-cache'
  json(res, status, { error: code, error_description: desc })
end

def bearer_error(res, status, code, desc)
  res['WWW-Authenticate'] = %(Bearer realm="nexluck-crm-api", error="#{code}", error_description="#{desc}")
  json(res, status, { error: code, error_description: desc })
end

# Enforces a valid bearer token with the given scope. Returns true when the request may proceed.
def authorize(req, res, scope)
  m = req['Authorization'].to_s.match(/\ABearer ([\w\-.]+)\z/)
  unless m
    res['WWW-Authenticate'] = 'Bearer realm="nexluck-crm-api"'
    json(res, 401, { error: 'invalid_request', error_description: 'Bearer access token required' })
    return false
  end
  claims = verify_token(m[1])
  return bearer_error(res, 401, 'invalid_token', 'Token is invalid or expired') && false unless claims
  unless claims['scope'].to_s.split.include?(scope)
    res['WWW-Authenticate'] = %(Bearer realm="nexluck-crm-api", error="insufficient_scope", scope="#{scope}")
    json(res, 403, { error: 'insufficient_scope', error_description: "Scope '#{scope}' required" })
    return false
  end
  req.attributes['client'] = claims['sub']
  true
end

srv = WEBrick::HTTPServer.new(Port: PORT, BindAddress: '127.0.0.1', DocumentRoot: ROOT,
                              AccessLog: [], Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN))
srv.config[:MimeTypes]['yaml'] = 'application/yaml'
# Dev server: always revalidate static files so edits show up without a hard refresh.
srv.config[:RequestCallback] = ->(_req, res) { res['Cache-Control'] = 'no-cache' }

srv.mount_proc('/crm/api/v1/oauth/token') do |req, res|
  res['Cache-Control'] = 'no-store'
  next oauth_error(res, 405, 'invalid_request', 'POST required') unless req.request_method == 'POST'
  next oauth_error(res, 415, 'invalid_request', 'Use application/x-www-form-urlencoded') unless req.content_type.to_s.start_with?('application/x-www-form-urlencoded')
  form = WEBrick::HTTPUtils.parse_query(req.body.to_s)
  id = secret = nil
  if (m = req['Authorization'].to_s.match(/\ABasic ([A-Za-z0-9+\/=]+)\z/))
    id, secret = Base64.decode64(m[1]).split(':', 2).map { |x| URI.decode_www_form_component(x.to_s) }
  else
    id, secret = form['client_id'], form['client_secret']
  end
  client = CLIENTS[id.to_s]
  # Hash the supplied secret and compare in constant time; also runs for unknown clients to avoid timing leaks.
  digest = OpenSSL::Digest::SHA256.digest(secret.to_s)
  ok = secure_eq(digest, client ? client[:secret_digest] : OpenSSL::Digest::SHA256.digest(SecureRandom.hex(8)))
  next oauth_error(res, 401, 'invalid_client', 'Client authentication failed', 'Basic realm="nexluck-crm-api"') unless client && ok
  next oauth_error(res, 400, 'unsupported_grant_type', 'Only client_credentials is supported') unless form['grant_type'] == 'client_credentials'
  asked = form['scope'] ? form['scope'].split : client[:scopes]
  next oauth_error(res, 400, 'invalid_scope', 'Requested scope not allowed') unless !asked.empty? && (asked - client[:scopes]).empty? && (asked - SCOPES).empty?
  json(res, 200, { access_token: issue_token(id, asked), token_type: 'Bearer', expires_in: TOKEN_TTL, scope: asked.join(' ') })
end

# ---- editing: validation, diff, changelog ----
def deep_dup(v) Marshal.load(Marshal.dump(v)) end

def deep_merge(a, b)
  return b unless a.is_a?(Hash) && b.is_a?(Hash)
  a.merge(b) { |_, x, y| deep_merge(x, y) }
end

def flat(h, pre = '')
  h.each_with_object({}) { |(k, v), o| v.is_a?(Hash) ? o.merge!(flat(v, "#{pre}#{k}.")) : o["#{pre}#{k}"] = v }
end

def list_view(b) b.reject { |k, _| DETAIL_KEYS.include?(k) } end

# The part of a bonus the editor may change. `auto` bonuses are reported as active.
def editable(b)
  deep_dup(b.slice('name', 'description', 'bonusType', 'category', 'availability', 'triggers', 'reward', 'wagering', 'walletRules', 'antiBonusHunter'))
    .merge('status' => b['status'] == 'inactive' ? 'inactive' : 'active')
end

DT_FORMAT = /\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\z/
def parse_dt(s)
  return nil unless s.is_a?(String) && s =~ DT_FORMAT
  DateTime.strptime(s, '%Y-%m-%dT%H:%M')
rescue ArgumentError
  nil
end

# Returns [cleaned_hash, errors]; errors maps a dotted field path to a message.
def validate_bonus(m)
  err = {}
  h = ->(v) { v.is_a?(Hash) ? v : {} }
  num = lambda do |path, v, min, max, int|
    ok = v.is_a?(Numeric) && v >= min && v <= max && (!int || v == v.to_i)
    err[path] = "Must be #{int ? 'a whole number' : 'a number'} between #{min} and #{max}" unless ok
    ok ? (int ? v.to_i : v) : nil
  end
  enum = lambda do |path, v, opts|
    err[path] = "Must be one of: #{opts.join(', ')}" unless opts.include?(v)
    v
  end
  subset = lambda do |path, v, opts|
    ok = v.is_a?(Array) && (v - opts).empty?
    err[path] = "Allowed values: #{opts.join(', ')}" unless ok
    ok ? v.uniq : []
  end
  bool = lambda do |path, v|
    err[path] = 'Must be true or false' unless [true, false].include?(v)
    v
  end

  name = m['name'].to_s.strip
  err['name'] = 'Required, up to 120 characters' if name.empty? || name.length > 120
  desc = m['description'].to_s
  err['description'] = 'Up to 2000 characters' if desc.length > 2000

  av, tr, rw, wg, wl, abh = %w[availability triggers reward wagering walletRules antiBonusHunter].map { |k| h.(m[k]) }
  cap = h.(wg['maxWithdrawCap'])
  s_dt, e_dt = parse_dt(av['startTime']), parse_dt(av['endTime'])
  err['availability.startTime'] = 'Use format YYYY-MM-DDTHH:MM' unless s_dt
  err['availability.endTime'] = 'Use format YYYY-MM-DDTHH:MM' unless e_dt
  err['availability.endTime'] = 'End time must be after start time' if s_dt && e_dt && e_dt <= s_dt

  cap_type = enum.('wagering.maxWithdrawCap.type', cap['type'], CAP_TYPES)
  min_dep = num.('triggers.minDeposit', tr['minDeposit'], 0, 1_000_000, false)
  max_dep = num.('triggers.maxDeposit', tr['maxDeposit'], 0, 1_000_000, false)
  err['triggers.maxDeposit'] = 'Must be greater than or equal to min deposit' if min_dep && max_dep && max_dep < min_dep

  out = {
    'name' => name, 'description' => desc,
    'status' => enum.('status', m['status'], %w[active inactive]),
    'bonusType' => enum.('bonusType', m['bonusType'], BONUS_TYPES),
    'category' => enum.('category', m['category'], CATEGORIES),
    'availability' => { 'startTime' => av['startTime'], 'endTime' => av['endTime'],
                        'includeSegments' => subset.('availability.includeSegments', av['includeSegments'], INCLUDE_SEGMENTS),
                        'excludeSegments' => subset.('availability.excludeSegments', av['excludeSegments'], EXCLUDE_SEGMENTS) },
    'triggers' => { 'event' => enum.('triggers.event', tr['event'], TRIGGER_EVENTS), 'minDeposit' => min_dep, 'maxDeposit' => max_dep,
                    'depositNumber' => num.('triggers.depositNumber', tr['depositNumber'], 0, 1000, true) },
    'reward' => { 'dmp' => num.('reward.dmp', rw['dmp'], 0, 1000, false),
                  'maxBonusAmount' => num.('reward.maxBonusAmount', rw['maxBonusAmount'], 0, 1_000_000, false) },
    'wagering' => { 'multiplier' => num.('wagering.multiplier', wg['multiplier'], 0, 500, false),
                    'timeToCompleteDays' => num.('wagering.timeToCompleteDays', wg['timeToCompleteDays'], 1, 365, true),
                    'maxBetPerRound' => num.('wagering.maxBetPerRound', wg['maxBetPerRound'], 0, 100_000, false),
                    'appliesTo' => enum.('wagering.appliesTo', wg['appliesTo'], APPLIES_TO),
                    'maxWithdrawCap' => { 'type' => cap_type,
                                          'value' => num.('wagering.maxWithdrawCap.value', cap['value'], 0, 1_000_000, false) } },
    'walletRules' => { 'deduction' => enum.('walletRules.deduction', wl['deduction'], WALLET_ORDER),
                       'winnings' => enum.('walletRules.winnings', wl['winnings'], WALLET_ORDER),
                       'allowCancelBeforeWagering' => bool.('walletRules.allowCancelBeforeWagering', wl['allowCancelBeforeWagering']),
                       'allowWithdrawBeforeWagering' => bool.('walletRules.allowWithdrawBeforeWagering', wl['allowWithdrawBeforeWagering']) },
    'antiBonusHunter' => {
      'maxClaimsPerIp' => num.('antiBonusHunter.maxClaimsPerIp', abh['maxClaimsPerIp'], 0, 1000, true),
      'maxClaimsPerDevice' => num.('antiBonusHunter.maxClaimsPerDevice', abh['maxClaimsPerDevice'], 0, 1000, true),
      'blockSharedIpSubnets' => bool.('antiBonusHunter.blockSharedIpSubnets', abh['blockSharedIpSubnets']),
      'blockKnownVpnsAndProxies' => bool.('antiBonusHunter.blockKnownVpnsAndProxies', abh['blockKnownVpnsAndProxies']),
      'paymentMethodBlacklist' => subset.('antiBonusHunter.paymentMethodBlacklist', abh['paymentMethodBlacklist'], PAYMENT_METHODS),
      'requireKycLevelBeforeClaim' => enum.('antiBonusHunter.requireKycLevelBeforeClaim', abh['requireKycLevelBeforeClaim'], KYC_LEVELS),
      'maxBetPerRound' => num.('antiBonusHunter.maxBetPerRound', abh['maxBetPerRound'], 0, 100_000, false),
      'maxBetPercentageOfBonus' => num.('antiBonusHunter.maxBetPercentageOfBonus', abh['maxBetPercentageOfBonus'], 0, 100, false),
      'restrictZeroRiskBetting' => bool.('antiBonusHunter.restrictZeroRiskBetting', abh['restrictZeroRiskBetting']),
      'minEvenMoneyCoveragePercentage' => num.('antiBonusHunter.minEvenMoneyCoveragePercentage', abh['minEvenMoneyCoveragePercentage'], 0, 100, false)
    }
  }
  [out, err]
end

def read_json(req, res)
  unless req.content_type.to_s.start_with?('application/json')
    json(res, 415, { error: 'Use Content-Type: application/json' })
    return nil
  end
  body = JSON.parse(req.body.to_s)
  return body if body.is_a?(Hash)
  json(res, 400, { error: 'JSON object expected' })
  nil
rescue JSON::ParserError
  json(res, 400, { error: 'Invalid JSON' })
  nil
end

def update_bonus(b, clean, actor)
  before = editable(b)
  after = clean
  changes = flat(after).reject { |k, v| flat(before)[k] == v }.map { |k, v| { 'field' => k, 'from' => flat(before)[k], 'to' => v } }
  return [] if changes.empty?
  prev_event = b['triggers']['event']
  b['status'] = after['status'] == 'inactive' ? 'inactive' : (b['status'] == 'auto' ? 'auto' : 'active')
  %w[name description bonusType category availability triggers reward wagering walletRules antiBonusHunter].each { |k| b[k] = after[k] }
  b['groups'] = after['availability']['includeSegments']
  b['dateStart'] = after['availability']['startTime'][0, 10]
  b['dateEnd'] = after['availability']['endTime'][0, 10]
  if prev_event != after['triggers']['event']
    b['event'] = after['triggers']['event'] == 'on_registration' ? 'Registration' : 'Any deposit'
  end
  CHANGELOG[b['id']].unshift({ 'at' => Time.now.utc.iso8601, 'by' => actor, 'summary' => "Updated #{changes.length} field#{changes.length == 1 ? '' : 's'}", 'changes' => changes })
  changes
end

# Public API for other servers (secured = true): bearer token required.
# The UI route (secured = false) is the backend-for-frontend of the CRM web app; in production it must sit
# behind the signed-in user's session and CSRF protection, and `actor` should be that user.
handler = lambda do |req, res, rest, secured|
  LOCK.synchronize do
    m = req.request_method
    route = case rest
            when 'bonuses' then [:list, %w[GET POST]]
            when %r{\Abonuses/([\w-]+)/promo-codes/([A-Z0-9-]+)\z} then [:promo_code, %w[DELETE], Regexp.last_match(1), Regexp.last_match(2)]
            when %r{\Abonuses/([\w-]+)/promo-banner\z} then [:promo_banner, %w[GET PUT], Regexp.last_match(1)]
            when %r{\Abonuses/([\w-]+)/promo-codes\z} then [:promo_codes, %w[GET POST], Regexp.last_match(1)]
            when %r{\Abonuses/([\w-]+)\z} then [:detail, %w[GET PATCH], Regexp.last_match(1)]
            when %r{\Abonuses/([\w-]+)/changelog\z} then [:changelog, %w[GET], Regexp.last_match(1)]
            when %r{\Abonuses/([\w-]+)/delete\z} then [:delete, %w[POST], Regexp.last_match(1)]
            when 'exchange-rates' then [:rates, %w[GET PATCH]]
            end
    next json(res, 404, { error: 'Not found' }) unless route
    action, methods, id, promo_code = route
    next json(res, 405, { error: 'Method not allowed' }) unless methods.include?(m)
    next if secured && !authorize(req, res, m == 'GET' ? 'bonuses:read' : 'bonuses:write')
    actor = secured ? req.attributes['client'].to_s : 'v.kovalevskiy'
    bonus = nil
    if id
      bonus = BONUSES.find { |x| x['id'] == id }
      next json(res, 404, { error: 'Bonus not found' }) unless bonus
    end

    case action
    when :list
      if m == 'POST'
        body = read_json(req, res)
        next unless body
        clean, errors = validate_bonus(body)
        next json(res, 422, { error: 'Validation failed', fields: errors }) unless errors.empty?
        next_id = BONUSES.map { |b| b['id'][/\d+\z/].to_i }.max + 1
        id = "BN-#{next_id}"
        detail = {
          'id' => id, 'name' => clean['name'], 'status' => clean['status'], 'hasPromo' => false,
          'createdAt' => Date.today.to_s, 'dateStart' => clean['availability']['startTime'][0, 10],
          'dateEnd' => clean['availability']['endTime'][0, 10],
          'event' => clean['triggers']['event'] == 'on_registration' ? 'Registration' : 'Any deposit',
          'bonusValue' => 0, 'wagered' => 0, 'wins' => 0, 'received' => 0,
          'bonusType' => clean['bonusType'], 'groups' => clean['availability']['includeSegments'], 'deleted' => false,
          'createdBy' => actor
        }.merge(clean.reject { |k, _| k == 'status' || k == 'bonusType' })
        BONUSES << detail
        CHANGELOG[id] = [{ 'at' => Time.now.utc.iso8601, 'by' => actor, 'summary' => 'Bonus created', 'changes' => [] }]
        PROMO_CODES[id] = []
        next json(res, 201, detail)
      end
      limit = [[(req.query['limit'] || 20).to_i, 1].max, 100].min
      offset = [(req.query['offset'] || 0).to_i, 0].max
      ql = (req.query['q'] || '').strip.downcase
      selected = {}
      bad = nil
      FILTERS.each do |group, opts|
        vals = req.query[group].to_s.split(',').map(&:strip).reject(&:empty?).uniq
        bad ||= "Unknown #{group} '#{(vals - opts.keys).first}'" unless (vals - opts.keys).empty?
        selected[group] = vals
      end
      next json(res, 400, { error: bad }) if bad
      searched = BONUSES.select { |b| ql.empty? || b['name'].downcase.include?(ql) || b['id'].downcase.include?(ql) }
      matches = lambda do |b, skip|
        selected.all? { |g, vals| g == skip || vals.empty? || vals.any? { |v| FILTERS[g][v].call(b) } }
      end
      list = searched.select { |b| matches.call(b, nil) }
      # Facet counts: what each option would return given the other groups' selections.
      counts = { 'total' => list.length }
      FILTERS.each do |g, opts|
        pool = searched.select { |b| matches.call(b, g) }
        counts[g] = opts.map { |k, f| [k, pool.count(&f)] }.to_h
      end
      json(res, 200, { items: (list[offset, limit] || []).map { |b| list_view(b) }, total: list.length, offset: offset, limit: limit, counts: counts })
    when :promo_codes
      if m == 'GET'
        json(res, 200, { items: PROMO_CODES[bonus['id']] })
      else
        body = read_json(req, res)
        next unless body
        start_time, end_time = body['startTime'], body['endTime']
        start_dt, end_dt = parse_dt(start_time), parse_dt(end_time)
        errors = {}
        errors['startTime'] = 'Use format YYYY-MM-DDTHH:MM' unless start_dt
        errors['endTime'] = 'Use format YYYY-MM-DDTHH:MM' unless end_dt
        errors['endTime'] = 'End time must be after start time' if start_dt && end_dt && end_dt <= start_dt
        next json(res, 422, { error: 'Validation failed', fields: errors }) unless errors.empty?
        requested = body['code']
        if requested
          if !requested.is_a?(String) || requested !~ /\A[A-Z0-9_-]{4,32}\z/
            errors['code'] = 'Use 4-32 characters: A-Z, 0-9, _ or -'
          elsif PROMO_CODES.values.flatten.any? { |item| item['code'] == requested }
            errors['code'] = 'Code already exists'
          end
        end
        next json(res, 422, { error: 'Validation failed', fields: errors }) unless errors.empty?
        code = requested
        loop do
          break if code
          candidate = "PROMO-#{SecureRandom.alphanumeric(8).upcase}"
          code = candidate unless PROMO_CODES.values.flatten.any? { |item| item['code'] == candidate }
        end
        item = { 'code' => code, 'startTime' => start_time, 'endTime' => end_time,
                 'createdAt' => Time.now.utc.iso8601 }
        PROMO_CODES[bonus['id']] << item
        CHANGELOG[bonus['id']].unshift({ 'at' => Time.now.utc.iso8601, 'by' => actor, 'summary' => "Generated promo code #{code}", 'changes' => [] })
        json(res, 201, item)
      end
    when :promo_code
      codes = PROMO_CODES[bonus['id']]
      item = codes.find { |x| x['code'] == promo_code }
      next json(res, 404, { error: 'Promo code not found' }) unless item
      codes.delete(item)
      CHANGELOG[bonus['id']].unshift({ 'at' => Time.now.utc.iso8601, 'by' => actor, 'summary' => "Deleted promo code #{promo_code}", 'changes' => [] })
      json(res, 200, { deleted: promo_code })
    when :detail
      next json(res, 200, bonus) if m == 'GET'
      body = read_json(req, res)
      next unless body
      clean, errors = validate_bonus(deep_merge(editable(bonus), body))
      next json(res, 422, { error: 'Validation failed', fields: errors }) unless errors.empty?
      update_bonus(bonus, clean, actor)
      json(res, 200, bonus)
    when :changelog
      json(res, 200, { items: CHANGELOG[bonus['id']] })
    when :delete
      bonus['deleted'] = true
      CHANGELOG[bonus['id']].unshift({ 'at' => Time.now.utc.iso8601, 'by' => actor, 'summary' => 'Marked as deleted', 'changes' => [] })
      json(res, 200, list_view(bonus))
    when :promo_banner
      if m == 'GET'
        json(res, 200, PROMO_BANNERS[bonus['id']] || PROMO_BANNER_DEFAULT.call)
      else
        body = read_json(req, res)
        next unless body
        banner, errors = validate_banner(body)
        next json(res, 422, { error: 'Validation failed', fields: errors }) unless errors.empty?
        PROMO_BANNERS[bonus['id']] = banner
        bonus['hasPromo'] = true
        CHANGELOG[bonus['id']].unshift({ 'at' => Time.now.utc.iso8601, 'by' => actor, 'summary' => 'Updated promo banner', 'changes' => [] })
        json(res, 200, banner)
      end
    when :rates
      if m == 'PATCH'
        body = read_json(req, res)
        next unless body
        rates = body['rates']
        bad = rates.is_a?(Hash) ? rates.reject { |k, v| RATES.key?(k) && v.is_a?(Numeric) && v > 0 && v <= 100_000 } : { 'rates' => 'object expected' }
        next json(res, 422, { error: 'Validation failed', fields: bad.transform_values { |v| v.is_a?(String) ? v : 'Must be a number > 0 for a supported currency' } }) unless bad.empty?
        rates.each { |k, v| RATES[k] = v.to_f }
        RATES_META.merge!('updatedAt' => Time.now.utc.iso8601, 'updatedBy' => actor)
      end
      json(res, 200, { base: 'EUR', rates: RATES, updatedAt: RATES_META['updatedAt'], updatedBy: RATES_META['updatedBy'] })
    end
  end
end

# WEBrick's proc handler only answers GET/POST by default.
WEBrick::HTTPServlet::ProcHandler.class_eval { alias_method :do_PATCH, :do_GET }
WEBrick::HTTPServlet::ProcHandler.class_eval { alias_method :do_DELETE, :do_GET }

srv.mount_proc('/crm/api/v1') { |req, res| handler.call(req, res, req.path.sub(%r{\A/crm/api/v1/?}, ''), true) }
srv.mount_proc('/crm/ui-api/v1') { |req, res| handler.call(req, res, req.path.sub(%r{\A/crm/ui-api/v1/?}, ''), false) }

trap('INT') { srv.shutdown }
trap('TERM') { srv.shutdown }
puts "NextLuck dev server on http://127.0.0.1:#{PORT}  (API docs: /crm/api-docs/)"
puts "S2S client_id=#{CLIENTS.keys.first}  client_secret=#{CLIENT_SECRET}" unless ENV['CRM_CLIENT_SECRET']
srv.start
