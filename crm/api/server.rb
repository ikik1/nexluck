#!/usr/bin/env ruby
# Dev server: serves the site root and the /crm/api/v1 REST API (see /crm/openapi.yaml).
# Usage: ruby crm/api/server.rb [port]
require 'webrick'
require 'json'
require 'date'

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

srv = WEBrick::HTTPServer.new(Port: PORT, BindAddress: '127.0.0.1', DocumentRoot: ROOT,
                              AccessLog: [], Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN))
srv.config[:MimeTypes]['yaml'] = 'application/yaml'

srv.mount_proc('/crm/api/v1/bonuses') do |req, res|
  rest = req.path.sub(%r{\A/crm/api/v1/bonuses/?}, '')
  LOCK.synchronize do
    if rest.empty?
      next json(res, 405, { error: 'Method not allowed' }) unless req.request_method == 'GET'
      tab = req.query['tab'] || 'all'
      next json(res, 400, { error: "Unknown tab '#{tab}'" }) unless TABS.key?(tab)
      limit = [[(req.query['limit'] || 20).to_i, 1].max, 100].min
      offset = [(req.query['offset'] || 0).to_i, 0].max
      ql = (req.query['q'] || '').strip.downcase
      live = BONUSES
      counts = TABS.map { |k, f| [k, live.count(&f)] }.to_h
      list = live.select(&TABS[tab]).select { |b| ql.empty? || b['name'].downcase.include?(ql) || b['id'].downcase.include?(ql) }
      json(res, 200, { items: list[offset, limit] || [], total: list.length, offset: offset, limit: limit, counts: counts })
    elsif (m = rest.match(%r{\A([\w-]+)/delete\z}))
      next json(res, 405, { error: 'Method not allowed' }) unless req.request_method == 'POST'
      b = BONUSES.find { |x| x['id'] == m[1] }
      next json(res, 404, { error: 'Bonus not found' }) unless b
      b['deleted'] = true
      json(res, 200, b)
    else
      json(res, 404, { error: 'Not found' })
    end
  end
end

trap('INT') { srv.shutdown }
trap('TERM') { srv.shutdown }
puts "NextLuck dev server on http://127.0.0.1:#{PORT}  (API docs: /crm/api-docs/)"
srv.start
