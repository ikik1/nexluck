#!/usr/bin/env ruby
# Dev server: serves the site root and the /crm/api/v1 REST API (see /crm/openapi.yaml).
# Usage: ruby crm/api/server.rb [port]
require 'webrick'
require 'json'
require 'date'
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
GR = %w[first_dep registered vip no_deposit newcomers high_roller inactive_30d kyc_verified]

def groups_of(id)
  n = id[3..-1].to_i
  out = []
  (1 + n % 3).times do |i|
    g = GR[(n * (i + 3) + i * 5) % GR.length]
    out << g unless out.include?(g)
  end
  out
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
    { 'id' => b[0], 'name' => b[1], 'status' => b[2], 'hasPromo' => b[3] == 1,
      'createdAt' => b[4], 'dateStart' => b[5], 'dateEnd' => b[6], 'event' => b[7],
      'bonusValue' => b[8], 'wagered' => b[9], 'wins' => b[10], 'received' => b[11],
      'groups' => groups_of(b[0]), 'deleted' => false }
  end
end

BONUSES = build
LOCK = Mutex.new

TABS = {
  'all' => ->(b) { true },
  'active' => ->(b) { b['status'] != 'inactive' },
  'inactive' => ->(b) { b['status'] == 'inactive' },
  'auto' => ->(b) { b['status'] == 'auto' },
  'banner' => ->(b) { b['hasPromo'] },
  'nobanner' => ->(b) { !b['hasPromo'] }
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
  true
end

srv = WEBrick::HTTPServer.new(Port: PORT, BindAddress: '127.0.0.1', DocumentRoot: ROOT,
                              AccessLog: [], Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN))
srv.config[:MimeTypes]['yaml'] = 'application/yaml'

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

handler = lambda do |req, res, rest, secured|
  LOCK.synchronize do
    if rest.empty?
      next json(res, 405, { error: 'Method not allowed' }) unless req.request_method == 'GET'
      next if secured && !authorize(req, res, 'bonuses:read')
      tab = req.query['tab'] || 'all'
      next json(res, 400, { error: "Unknown tab '#{tab}'" }) unless TABS.key?(tab)
      limit = [[(req.query['limit'] || 20).to_i, 1].max, 100].min
      offset = [(req.query['offset'] || 0).to_i, 0].max
      ql = (req.query['q'] || '').strip.downcase
      counts = TABS.map { |k, f| [k, BONUSES.count(&f)] }.to_h
      list = BONUSES.select(&TABS[tab]).select { |b| ql.empty? || b['name'].downcase.include?(ql) || b['id'].downcase.include?(ql) }
      json(res, 200, { items: list[offset, limit] || [], total: list.length, offset: offset, limit: limit, counts: counts })
    elsif (m = rest.match(%r{\A([\w-]+)/delete\z}))
      next json(res, 405, { error: 'Method not allowed' }) unless req.request_method == 'POST'
      next if secured && !authorize(req, res, 'bonuses:write')
      b = BONUSES.find { |x| x['id'] == m[1] }
      next json(res, 404, { error: 'Bonus not found' }) unless b
      b['deleted'] = true
      json(res, 200, b)
    else
      json(res, 404, { error: 'Not found' })
    end
  end
end

# Public API for other servers: bearer token required.
srv.mount_proc('/crm/api/v1/bonuses') { |req, res| handler.call(req, res, req.path.sub(%r{\A/crm/api/v1/bonuses/?}, ''), true) }
# Backend-for-frontend used by the CRM web UI. Browsers must never hold client secrets; in production
# this route must sit behind the signed-in user's session (and CSRF protection), not be exposed publicly.
srv.mount_proc('/crm/ui-api/v1/bonuses') { |req, res| handler.call(req, res, req.path.sub(%r{\A/crm/ui-api/v1/bonuses/?}, ''), false) }

trap('INT') { srv.shutdown }
trap('TERM') { srv.shutdown }
puts "NextLuck dev server on http://127.0.0.1:#{PORT}  (API docs: /crm/api-docs/)"
puts "S2S client_id=#{CLIENTS.keys.first}  client_secret=#{CLIENT_SECRET}" unless ENV['CRM_CLIENT_SECRET']
srv.start
