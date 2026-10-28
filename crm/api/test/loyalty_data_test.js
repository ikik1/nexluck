const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ window: {}, NexLuckI18n: { t: value => value }, Date });
vm.runInContext(fs.readFileSync('crm/f/data.js', 'utf8'), context);
// The shared segment evaluator precedes the React UI, and is used unchanged.
const segments = fs.readFileSync('crm/c/Segments.jsx', 'utf8').split('function CustomerRiskScore')[0];
vm.runInContext(segments, context);
vm.runInContext(fs.readFileSync('crm/loyalty/loyalty.js', 'utf8'), context);
vm.runInContext(`
const now = Date.parse('2026-10-28T12:00:00Z'), day = 86400000;
const profile = { id:'CU-1001', loyalty_points: 1500, country:'DE', birthday:'1990-01-01', created_at:'2026-01-01T00:00:00Z', activity:{last_login_at:null}, risk_indicators:[] };
const rule = (field, value) => ({kind:'rule', field, operator:'>=', value, not:false});
const segments = [{id:'s1', rules:rule('loyalty_points',1000)}, {id:'s2', rules:rule('loyalty_points',2000)}];
const parameters = [{key:'loyalty_points',type:'number'}];
const tiers = [{id:'t1',minimum_points:1000,segment_ids:[]}, {id:'t2',minimum_points:2000,segment_ids:['s1','s2']}, {id:'t3',minimum_points:5000,segment_ids:[]}];
const result = points => window.NexLuckLoyalty.status({...profile,loyalty_points:points},tiers,segments,parameters,now);
`, context);
const read = expression => vm.runInContext(expression, context);
assert.equal(read('result(999).current'), null);
assert.equal(read('result(999).remaining'), 1);
assert.equal(read('result(1000).current.id'), 't1');
assert.equal(read('result(1500).progress'), 50);
assert.equal(read('result(2000).current.id'), 't2');
assert.equal(read('result(5000).current.id'), 't3');
assert.equal(read('result(5000).next'), null);
assert.equal(read('result(5000).progress'), 100);
read("segments[1].rules.value=3000");
assert.equal(read('result(2000).current.id'), 't1');
assert.equal(read('result(2000).progress'), 100);
assert.equal(read('result(2000).missingSegments.join()'), 's2');
read("segments[1].rules.field='unknown'; parameters.push({key:'unknown',type:'number'})");
assert.equal(read('result(4000).current.id'), 't1');
assert.equal(read('result(5000).current.id'), 't3');
assert.equal(read("window.NexLuckLoyalty.status(profile,[],segments,parameters,now).progress"), 0);
assert.equal(read("window.NexLuckLoyalty.status(profile,[{id:'z',minimum_points:0,segment_ids:[]}],[],[],now).current.id"), 'z');
read(`
WALLETS=[{id:'w1',customer_id:'CU-1001',type:'Real'},{id:'w2',customer_id:'CU-1002',type:'Bonus'},{id:'w3',customer_id:'CU-1003',type:'Real'}];
WALLET_TX=[{wallet:'w1',type:'Bet',ts:now-day},{wallet:'w1',type:'Bet',ts:now-day},
{wallet:'w2',type:'Bet',ts:now},{wallet:'w3',type:'Deposit',ts:now},
{wallet:'w3',type:'Bet',ts:now+1},{wallet:'w3',type:'Bet',ts:now-31*day}];
const customers=[profile,{...profile,id:'CU-1002',loyalty_points:0},{...profile,id:'CU-1003'}];
const breakdown=window.NexLuckLoyalty.breakdown(customers,tiers,segments,parameters,now-30*day,now,now);
`);
assert.equal(read('breakdown.total'), 2);
assert.equal(read('breakdown.counts.t1'), 1);
assert.equal(read('breakdown.unranked'), 1);
assert.equal(read('window.NexLuckLoyalty.breakdown(customers,tiers,segments,parameters,now,now,now).total'), 1);
assert.equal(read('window.NexLuckLoyalty.breakdown(customers,tiers,segments,parameters,now-2*day,now-2*day,now).total'), 0);
assert.equal(read('segmentFacts(profile,now).values.loyalty_points'), 1500);
console.log('Loyalty thresholds, ALL-segment eligibility, unknown facts, progress, periods and bet deduplication passed.');
