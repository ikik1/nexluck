const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fixture = JSON.parse(fs.readFileSync('crm/api/finance_seed.json', 'utf8'));
let requests = [];
let response = { ok: true, json: async () => ({ id: 27, name: 'Saved terminal' }) };
const context = vm.createContext({
  window: {},
  NexLuckI18n: { t: value => value },
  CRMContext: { fetch: async (...args) => { requests.push(args); return response; } },
});
vm.runInContext(fs.readFileSync('crm/f/data.js', 'utf8'), context);
const read = expression => vm.runInContext(expression, context);

(async () => {
  assert.equal(read('PAYMENT_CONNECTIONS.length + WALLETS.length + TRANSACTIONS.length'), 0);
  assert.equal(read('defaultSettingsForBrand("Stripe").secret_key'), '');
  context.fixture = fixture;
  read('installFinanceData(fixture)');
  assert.equal(read('PAYMENT_CONNECTIONS.length'), 26);
  assert.equal(read('WALLETS.length'), 48);
  assert.equal(read('txLogs(TRANSACTIONS[0]).length'), fixture.transactions[0].logs.length);
  read('PAYMENT_CONNECTIONS[0].settings.secret_key = "browser-only"');
  assert.notEqual(fixture.connections[0].settings.secret_key, 'browser-only');
  assert.throws(() => read('installFinanceData({connections: []})'), /Invalid finance/);
  assert.equal(read('WALLETS.length'), 48);
  const empty = Object.fromEntries(Object.keys(fixture).map(key => [key, []]));
  context.empty = empty;
  read('installFinanceData(empty)');
  assert.equal(read('WALLETS.length + PAYMENT_CONNECTIONS.length + TRANSACTIONS.length'), 0);
  await read('saveFinanceRecord("connections", {id: 0, name: "Saved terminal", casino_id: "foreign"})');
  assert.equal(requests[0][0], '/crm/ui-api/v1/finance/connections');
  assert.equal(requests[0][1].method, 'POST');
  assert.equal(JSON.parse(requests[0][1].body).casino_id, undefined);
  response = { ok: true, json: async () => ({ data: { id: 12, name: 'Saved terminal' } }) };
  await read('saveFinanceRecord("connections", {id: 12, name: "Saved terminal"})');
  assert.equal(requests[1][0], '/crm/ui-api/v1/finance/connections/12');
  assert.equal(requests[1][1].method, 'PATCH');
  response = { ok: false, json: async () => ({ errors: { settings: 'Credentials required' } }) };
  await assert.rejects(read('saveFinanceRecord("connections", {name: "Saved terminal"})'), /Credentials required/);
  response = { ok: false, json: async () => { throw new Error('not JSON'); } };
  await assert.rejects(read('saveFinanceRecord("cascades", {name: "Saved terminal"})'), /invalid response/);
  response = { ok: true, json: async () => ({ ok: true }) };
  await assert.rejects(read('saveFinanceRecord("connections", {name: "Saved terminal"})'), /did not confirm/);
  console.log('Finance bootstrap and API save tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
